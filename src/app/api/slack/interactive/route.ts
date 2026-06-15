import { NextRequest } from 'next/server'
import { verifySlackSignature, updateMessage, postMessage } from '@/lib/slack'
import { getDb } from '@/db'
import { approvals } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { handleReveal, handleGrade, handleMcqAnswer } from '@/lib/athena-handler'
import { handleObjectionDetail } from '@/lib/diana-handler'

interface SlackAction {
  action_id: string
  value?: string
}

interface InteractivePayload {
  type: string
  actions?: SlackAction[]
  container?: { message_ts: string; channel_id: string }
  channel?: { id: string }
  message?: { ts: string }
  user?: { id: string }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-slack-signature') ?? ''
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? ''

  if (!verifySlackSignature(rawBody, signature, timestamp)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: InteractivePayload
  try {
    const params = new URLSearchParams(rawBody)
    payload = JSON.parse(params.get('payload') ?? '{}')
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  // Acknowledge immediately
  setImmediate(() => {
    handleInteractive(payload).catch((err: unknown) =>
      console.error('[slack/interactive] handler error:', err),
    )
  })

  return new Response('', { status: 200 })
}

async function handleInteractive(payload: InteractivePayload): Promise<void> {
  if (payload.type !== 'block_actions') return

  const action = payload.actions?.[0]
  if (!action) return

  const channel =
    payload.container?.channel_id ?? payload.channel?.id ?? ''
  const messageTs =
    payload.container?.message_ts ?? payload.message?.ts ?? ''

  const actionId = action.action_id

  // ── ATHENA: flashcard reveal ──────────────────────────────────────────────
  if (actionId.startsWith('athena_reveal_')) {
    const cardId = actionId.slice('athena_reveal_'.length)
    await handleReveal(cardId, channel, messageTs)
    return
  }

  // ── ATHENA: flashcard grade ───────────────────────────────────────────────
  // action_id: athena_grade_<cardId>_<again|hard|good|easy>
  if (actionId.startsWith('athena_grade_')) {
    const rest = actionId.slice('athena_grade_'.length)
    const lastUnderscore = rest.lastIndexOf('_')
    if (lastUnderscore === -1) return
    const cardId = rest.slice(0, lastUnderscore)
    const grade = rest.slice(lastUnderscore + 1)
    await handleGrade(cardId, grade, channel, messageTs, payload.user?.id)
    return
  }

  // ── ATHENA: MCQ answer ────────────────────────────────────────────────────
  // action_id: athena_mcq_<sessionId>_<qIndex>_<choiceIndex>
  if (actionId.startsWith('athena_mcq_')) {
    const rest = actionId.slice('athena_mcq_'.length)
    // sessionId is a UUID (contains hyphens), qIndex and choiceIndex are ints
    // Format: <uuid>_<qIndex>_<choiceIndex>
    // UUID has 4 hyphens; split from the right to get last two segments
    const parts = rest.split('_')
    if (parts.length < 3) return
    const choiceIndex = parseInt(parts[parts.length - 1], 10)
    const qIndex = parseInt(parts[parts.length - 2], 10)
    const sessionId = parts.slice(0, parts.length - 2).join('_')
    if (isNaN(qIndex) || isNaN(choiceIndex)) return
    await handleMcqAnswer(sessionId, qIndex, choiceIndex, channel, messageTs, payload.user?.id)
    return
  }

  // ── DIANA: objection button tap ──────────────────────────────────────────────
  // action_id: diana_obj_<slug>   e.g. diana_obj_not_interested
  if (actionId.startsWith('diana_obj_')) {
    const slug = actionId.slice('diana_obj_'.length)
    await handleObjectionDetail(slug, channel, payload.user?.id)
    return
  }

  // ── MAIA approvals ────────────────────────────────────────────────────────
  if (actionId.startsWith('maia_approve_') || actionId.startsWith('maia_reject_')) {
    const approved = actionId.startsWith('maia_approve_')
    const approvalId = actionId.replace(/^maia_(approve|reject)_/, '')

    const status = approved ? 'approved' : 'rejected'
    const label = approved ? 'Approved ✓' : 'Rejected ✗'

    await getDb()
      .update(approvals)
      .set({ status, resolved_at: Math.floor(Date.now() / 1000) })
      .where(eq(approvals.id, approvalId))

    if (channel && messageTs) {
      await updateMessage(channel, messageTs, label)
      await postMessage(channel, `${label} by <@${payload.user?.id ?? 'unknown'}>`, messageTs)
    }
  }
}
