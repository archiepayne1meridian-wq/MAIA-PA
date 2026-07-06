// MERCURY handler — intent detection, Slack draft delivery, refinement loop.
// Logs all actions to `activity` with agent='MERCURY'.

import { eq } from 'drizzle-orm'
import { postMessage, updateMessage } from './slack'
import { generateDraft, type MercuryMedium } from './mercury'
import {
  saveDraft,
  updateDraftStatus,
  updateDraftContent,
  updateDraftSlackTs,
  getActiveDraft,
  type MercuryDraft,
} from '../../tools/mercury'
import { getDb } from '@/db'
import { activity } from '@/db/schema'

// ─── Intent detection ─────────────────────────────────────────────────────────

export interface MercuryIntent {
  type: 'draft_message'
  medium: MercuryMedium
  context: string
  incoming?: string
}

export function detectMercuryIntent(text: string): MercuryIntent | null {
  if (!/^mercury[,.]?\s+/i.test(text.trim())) return null

  // Strip "Mercury, " prefix
  const body = text.replace(/^mercury[,.]?\s*/i, '').trim()
  if (!body) return null

  // Detect medium
  let medium: MercuryMedium = 'email'
  if (/\bwhats\s?app\b/i.test(body)) {
    medium = 'whatsapp'
  } else if (/\bimessage\b|\bi\s?message\b|\btext\b/i.test(body)) {
    medium = 'imessage'
  } else if (/\bemail\b/i.test(body)) {
    medium = 'email'
  }

  // Try to split incoming message from context at " -- " or "--- [message text] ---"
  // Common pattern: "Mercury, email reply — [incoming] — [instructions]"
  // For now: everything after the medium keyword is context; user pastes incoming inline
  const context = body

  return { type: 'draft_message', medium, context }
}

// ─── Slack delivery helpers ───────────────────────────────────────────────────

function formatSlackDraft(medium: MercuryMedium, subject: string | null, body: string): string {
  const mediumLabel = medium === 'email' ? '✉️ *MERCURY — Email Draft*' : `💬 *MERCURY — ${medium === 'whatsapp' ? 'WhatsApp' : 'iMessage'} Draft*`
  const subjectLine = medium === 'email' && subject ? `*Subject:* ${subject}\n\n` : ''
  return `${mediumLabel}\n${subjectLine}${body}\n\n_Reply to refine, or say "done" when ready._`
}

// ─── On-demand Slack handler ──────────────────────────────────────────────────

export async function handleMercuryDraft(
  channel: string,
  medium: MercuryMedium,
  context: string,
  incoming?: string,
  slackUser?: string,
): Promise<void> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()

  await getDb().insert(activity).values({
    id: rowId,
    event_id: `mercury_draft_${Date.now()}`,
    type: 'message_draft',
    agent: 'MERCURY',
    slack_user: slackUser,
    input: context,
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })

  try {
    const result = await generateDraft(medium, context, incoming)
    const draftId = await saveDraft(medium, context, result.body, incoming)

    const slackText = formatSlackDraft(medium, result.subject, result.body)
    const msg = await postMessage(channel, slackText)

    await updateDraftSlackTs(draftId, msg.ts)

    await getDb()
      .update(activity)
      .set({ output: `draft posted: ${draftId}`, status: 'success', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[mercury] handleMercuryDraft failed:', err)
    await getDb()
      .update(activity)
      .set({ output: msg, status: 'error', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
    await postMessage(channel, `⚠ MERCURY: ${msg}`)
  }
}

// ─── Thread reply handler (refinement loop) ───────────────────────────────────

export async function handleMercuryThread(
  draft: MercuryDraft,
  replyText: string,
  channel: string,
): Promise<void> {
  const lower = replyText.trim().toLowerCase()

  if (/^done\s*$/i.test(lower)) {
    await updateDraftStatus(draft.id, 'approved')
    await postMessage(
      channel,
      `✅ *MERCURY — Draft approved.* Copy saved. Send whenever you\'re ready.`,
      draft.slack_ts ?? undefined,
    )
    return
  }

  // Redraft with feedback
  try {
    const newResult = await generateDraft(
      draft.medium as MercuryMedium,
      draft.context,
      draft.incoming_message ?? undefined,
      replyText,
    )

    await updateDraftContent(draft.id, newResult.body)

    await updateMessage(
      channel,
      draft.slack_ts!,
      formatSlackDraft(draft.medium as MercuryMedium, newResult.subject, newResult.body),
    )

    await postMessage(
      channel,
      `✏️ *Redrafted.* Reply again to refine further, or say *"done"* to approve.`,
      draft.slack_ts ?? undefined,
    )
  } catch (err) {
    console.error('[mercury] handleMercuryThread redraft failed:', err)
    await postMessage(
      channel,
      `⚠ MERCURY: redraft failed — ${err instanceof Error ? err.message : String(err)}`,
      draft.slack_ts ?? undefined,
    )
  }
}

// Re-export for use in events route
export { getActiveDraft }
