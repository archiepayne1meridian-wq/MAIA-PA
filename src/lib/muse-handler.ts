// MUSE handler — intent detection, Slack delivery, harvest stub.
// Log all actions to activity with agent: 'MUSE'.

import { eq } from 'drizzle-orm'
import { postMessage } from './slack'
import {
  getInsights,
  getPendingById,
  updatePending,
  updatePendingSlackTs,
  getPendingBySlackTs,
  type MusePending,
} from '../../tools/muse'
import { getDb } from '@/db'
import { activity } from '@/db/schema'

// ─── Intent detection ─────────────────────────────────────────────────────────

type MuseIntent =
  | { type: 'search_sector'; sector: string; query: string }
  | { type: 'search_all'; query: string }
  | { type: 'file_entry'; content: string; sector?: string }
  | { type: 'brain_dump'; content: string }
  | { type: 'confirm'; pendingId: string; decision: 'keep' | 'discard' }
  | { type: 'status' }

export function detectMuseIntent(text: string): MuseIntent | null {
  const t = text.trim()
  if (!/^muse[,.]?\s+/i.test(t)) return null
  const body = t.replace(/^muse[,.]?\s*/i, '').trim()
  if (!body) return null

  // Status
  if (/^(what.?s pending|status|summary|pending|what do you know)\s*$/i.test(body)) {
    return { type: 'status' }
  }

  // Sector search: "search [sector] for [query]"
  const sectorSearch = body.match(
    /^search\s+(training|markets|products|regulations|sales[\s&]+prospecting|sales|expat\s+knowledge|expat|performance)\s+for\s+(.+)$/i,
  )
  if (sectorSearch) {
    return { type: 'search_sector', sector: sectorSearch[1]!.trim(), query: sectorSearch[2]!.trim() }
  }

  // Search all
  const searchAll = body.match(
    /^(?:search\s+everything\s+for|what\s+do\s+you\s+know\s+about|search\s+for|search\s+everything[:\s]+)([\s\S]+)$/i,
  )
  if (searchAll) {
    return { type: 'search_all', query: searchAll[1]!.trim() }
  }

  // Brain dump
  const brainDump = body.match(/^brain\s*dump[:\s]+([\s\S]+)$/i)
  if (brainDump) {
    return { type: 'brain_dump', content: brainDump[1]!.trim() }
  }

  // File entry
  const fileEntry = body.match(/^(?:file\s+this[:\s]+|add\s+this[:\s]+|save\s+this[:\s]+)([\s\S]+)$/i)
  if (fileEntry) {
    return { type: 'file_entry', content: fileEntry[1]!.trim() }
  }

  // Fallback: treat everything as a full search
  return { type: 'search_all', query: body }
}

// ─── Status handler ───────────────────────────────────────────────────────────

export async function handleMuseStatus(channel: string, slackUser?: string): Promise<void> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()
  await logRow(rowId, 'muse_status', 'status', slackUser)

  try {
    const { pending, recentEntries } = await getInsights()
    const pendingCount = pending.length
    const entryCount = recentEntries.length

    let msg = `🧠 *MUSE — Status*\n`
    msg += `*Pending confirmations:* ${pendingCount === 0 ? 'None — all clear' : `${pendingCount} awaiting your review`}\n`
    msg += `*Active entries:* ${entryCount === 0 ? 'Knowledge base is empty' : `${entryCount} recent entries`}\n`

    if (pendingCount > 0) {
      msg += '\n_Pending:_\n'
      for (const p of pending.slice(0, 3)) {
        msg += `• *${p.suggested_title}* (${p.suggested_sector})\n`
      }
    }

    msg += '\n_Filing and search will be available from Step 3._'

    await postMessage(channel, msg)
    await resolveRow(rowId, `status: ${pendingCount} pending, ${entryCount} entries`, startMs)
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    await errorRow(rowId, m, startMs)
    await postMessage(channel, `⚠ MUSE status error: ${m}`)
  }
}

// ─── Search handler (stub) ────────────────────────────────────────────────────

export async function handleMuseSearch(
  channel: string,
  query: string,
  sector?: string,
  slackUser?: string,
): Promise<void> {
  await postMessage(
    channel,
    `🧠 *MUSE — Search (stub)*\n_Query: "${query}"${sector ? ` in ${sector}` : ' across all sectors'}_\n\nSearch will be active from Step 4. Your query was received.`,
  )
  await insertActivity('muse_search', query, 'stub: searchKnowledge not yet wired', slackUser)
}

// ─── File handler (stub) ──────────────────────────────────────────────────────

export async function handleMuseFile(
  channel: string,
  content: string,
  sector?: string,
  slackUser?: string,
): Promise<void> {
  const preview = content.slice(0, 120) + (content.length > 120 ? '…' : '')
  await postMessage(
    channel,
    `🧠 *MUSE — Filing (stub)*${sector ? ` [${sector}]` : ''}\n_Input received:_ ${preview}\n\nFiling pipeline will be active from Step 3.`,
  )
  await insertActivity('muse_file', content.slice(0, 400), 'stub: processInput not yet wired', slackUser)
}

// ─── Brain dump handler (stub) ────────────────────────────────────────────────

export async function handleMuseBrainDump(
  channel: string,
  content: string,
  slackUser?: string,
): Promise<void> {
  const preview = content.slice(0, 120) + (content.length > 120 ? '…' : '')
  await postMessage(
    channel,
    `🧠 *MUSE — Brain Dump (stub)*\n_Received:_ ${preview}\n\nBrain dump pipeline will be active from Step 3.`,
  )
  await insertActivity('muse_braindump', content.slice(0, 400), 'stub: processInput not yet wired', slackUser)
}

// ─── Confirm handler ──────────────────────────────────────────────────────────

export async function handleMuseConfirm(
  channel: string,
  pendingId: string,
  decision: 'keep' | 'discard',
  threadTs?: string,
  slackUser?: string,
): Promise<void> {
  const pending = await getPendingById(pendingId)
  if (!pending) {
    await postMessage(channel, `⚠ MUSE: pending item not found.`, threadTs)
    return
  }

  const status = decision === 'keep' ? 'approved' : 'discarded'
  await updatePending(pendingId, status)

  const emoji = decision === 'keep' ? '✅' : '❌'
  await postMessage(
    channel,
    `${emoji} *MUSE — Entry ${decision === 'keep' ? 'approved' : 'discarded'}.*\n_"${pending.suggested_title}"_ in ${pending.suggested_sector}.`,
    threadTs,
  )
  await insertActivity('muse_confirm', `${pendingId}: ${decision}`, `status: ${status}`, slackUser)
}

// ─── Thread routing ───────────────────────────────────────────────────────────

export async function getActiveMusePending(slackTs: string): Promise<MusePending | null> {
  return getPendingBySlackTs(slackTs)
}

export async function handleMuseThread(
  pending: MusePending,
  replyText: string,
  channel: string,
): Promise<void> {
  const lower = replyText.trim().toLowerCase()

  if (/^(keep|yes|file\s*it|confirm|ok)\s*$/i.test(lower)) {
    await handleMuseConfirm(channel, pending.id, 'keep', pending.slack_ts ?? undefined)
    return
  }

  if (/^(discard|no|drop\s*it|reject|nope)\s*$/i.test(lower)) {
    await handleMuseConfirm(channel, pending.id, 'discard', pending.slack_ts ?? undefined)
    return
  }

  // Edit instruction — stub in Step 2
  await postMessage(
    channel,
    `🧠 *MUSE — Edit instruction (stub)*\n_"${replyText}"_ noted. Edit and redraft will be active from Step 3.`,
    pending.slack_ts ?? undefined,
  )
}

// ─── Auto-harvest (stub — wired in Step 5) ───────────────────────────────────

export function checkMuseHarvest(
  _agent: string,
  _eventType: string,
  _data: Record<string, unknown>,
): void {
  // No-op in Step 2. Wired to ATHENA + CASSANDRA handlers in Step 5.
}

// Re-export for Slack thread save
export { updatePendingSlackTs }

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function logRow(id: string, type: string, input: string, slackUser?: string): Promise<void> {
  await getDb().insert(activity).values({
    id,
    event_id: `${type}_${Date.now()}`,
    type,
    agent: 'MUSE',
    slack_user: slackUser,
    input: input.slice(0, 500),
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })
}

async function resolveRow(id: string, output: string, startMs: number): Promise<void> {
  await getDb()
    .update(activity)
    .set({ output: output.slice(0, 500), status: 'success', duration_ms: Date.now() - startMs })
    .where(eq(activity.id, id))
}

async function errorRow(id: string, message: string, startMs: number): Promise<void> {
  await getDb()
    .update(activity)
    .set({ output: message.slice(0, 500), status: 'error', duration_ms: Date.now() - startMs })
    .where(eq(activity.id, id))
}

async function insertActivity(type: string, input: string, output: string, slackUser?: string): Promise<void> {
  try {
    await getDb().insert(activity).values({
      id: crypto.randomUUID(),
      event_id: `${type}_${Date.now()}`,
      type,
      agent: 'MUSE',
      slack_user: slackUser,
      input: input.slice(0, 500),
      output: output.slice(0, 500),
      status: 'success',
      created_at: Math.floor(Date.now() / 1000),
    })
  } catch {
    // Non-fatal
  }
}
