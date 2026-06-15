import { NextRequest } from 'next/server'
import { verifySlackSignature, postMessage } from '@/lib/slack'
import { ask } from '@/lib/claude'
import { getDb } from '@/db'
import { activity } from '@/db/schema'
import { eq } from 'drizzle-orm'
import {
  detectAthenaIntent,
  handleIngest,
  handleFlashcardQuiz,
  handleDailyQuiz,
  handleProgress,
  handleWeaknessReport,
  handleStudyPlan,
  handleGoAheadOrCancel,
} from '@/lib/athena-handler'
import {
  detectHeraIntent,
  handleLogReflection,
  handleOnDemand,
} from '@/lib/hera-handler'
import {
  detectDianaIntent,
  handleObjectionLibrary,
  handleRoleplayStart,
  handleRoleplayTurn,
  handleRoleplayExit,
  handleRoleplayReset,
} from '@/lib/diana-handler'
import { getActiveSession } from '../../../../../tools/diana-db'
import {
  detectCassandraIntent,
  handleCassandraBrief,
  handleFxOnly,
} from '@/lib/cassandra-handler'
import {
  detectDemeterIntent,
  handlePortfolioBrief,
  handleAddHolding,
  handleRemoveHolding,
  handleUpdateHolding,
  handleListHoldings,
  handleAllocation,
  handleNewsStub,
  handleSeedHoldings,
} from '@/lib/demeter-handler'

interface SlackEvent {
  type: string
  text?: string
  ts?: string
  channel?: string
  user?: string
  bot_id?: string
  subtype?: string
}

interface SlackPayload {
  type: string
  challenge?: string
  event?: SlackEvent
  event_id?: string
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  let payload: SlackPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  // Slack app setup: return challenge before HMAC check (URL not yet verified)
  if (payload.type === 'url_verification') {
    return Response.json({ challenge: payload.challenge })
  }

  const signature = request.headers.get('x-slack-signature') ?? ''
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? ''

  if (!verifySlackSignature(rawBody, signature, timestamp)) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Acknowledge immediately — Slack requires < 3 s
  setImmediate(() => {
    handleEvent(payload).catch((err: unknown) =>
      console.error('[slack/events] handler error:', err),
    )
  })

  return new Response('', { status: 200 })
}

async function handleEvent(payload: SlackPayload): Promise<void> {
  const event = payload.event
  if (!event) return

  // Only handle plain messages; ignore bot messages and subtypes (edits, joins, etc.)
  if (event.type !== 'message' || event.bot_id || event.subtype) return
  if (!event.text || !event.ts) return

  const eventId = payload.event_id ?? event.ts

  // De-duplication: skip if we've already processed this event
  const existing = await getDb()
    .select({ id: activity.id })
    .from(activity)
    .where(eq(activity.event_id, eventId))
    .limit(1)

  if (existing.length > 0) return

  const channel = event.channel ?? process.env.SLACK_CHANNEL_ID!
  const text = event.text

  // Reserve the event_id by inserting a placeholder activity row
  const rowId = crypto.randomUUID()
  const startMs = Date.now()

  await getDb().insert(activity).values({
    id: rowId,
    event_id: eventId,
    type: 'message_received',
    agent: 'MAIA',
    slack_user: event.user,
    input: text,
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })

  try {
    // ── DIANA: active-session check — MUST run before all other intent routing ──
    // While a diana_session is active, every message routes to DIANA's roleplay
    // handler until the user says "done" / "exit" / "stop" / "diana, reset".
    // This prevents "quiz me" (ATHENA) or "reflection" (HERA) said during a roleplay
    // from routing to the wrong agent.
    const dianaSession = await getActiveSession(event.user ?? '')
    if (dianaSession) {
      await getDb().update(activity).set({ agent: 'DIANA' }).where(eq(activity.id, rowId))
      if (/^\s*(done|exit|stop)\s*$/i.test(text)) {
        await handleRoleplayExit(channel, event.user, dianaSession)
      } else if (/^\s*diana\s*,?\s*reset\s*$/i.test(text)) {
        await handleRoleplayReset(channel, event.user, dianaSession)
      } else {
        await handleRoleplayTurn(channel, event.user, dianaSession, text)
      }
      await getDb()
        .update(activity)
        .set({ status: 'success', duration_ms: Date.now() - startMs })
        .where(eq(activity.id, rowId))
      return
    }

    // Check if this is a "go ahead" / "cancel" response for a pending ATHENA quiz
    const handled = await handleGoAheadOrCancel(text, channel, event.user)
    if (handled) {
      await getDb()
        .update(activity)
        .set({ status: 'success', output: 'athena go-ahead handled', duration_ms: Date.now() - startMs })
        .where(eq(activity.id, rowId))
      return
    }

    // ── DIANA intent routing (reference mode + roleplay start) ────────────────
    // Sits here — before HERA/CASSANDRA/DEMETER/ATHENA — so a "diana," prefix
    // always wins regardless of what other words appear in the message.
    const dianaIntent = detectDianaIntent(text)
    if (dianaIntent) {
      await getDb().update(activity).set({ agent: 'DIANA' }).where(eq(activity.id, rowId))
      switch (dianaIntent.type) {
        case 'reference':
          await handleObjectionLibrary(channel, event.user)
          break
        case 'roleplay_start':
          await handleRoleplayStart(channel, event.user, dianaIntent)
          break
        case 'reset':
          // No active session to reset (checked above)
          await postMessage(channel, `_No active roleplay to reset._`)
          break
      }
      await getDb()
        .update(activity)
        .set({ status: 'success', duration_ms: Date.now() - startMs })
        .where(eq(activity.id, rowId))
      return
    }

    // HERA intent routing
    const heraIntent = detectHeraIntent(text)
    if (heraIntent) {
      await getDb().update(activity).set({ agent: 'HERA' }).where(eq(activity.id, rowId))
      switch (heraIntent.type) {
        case 'log_reflection':
          await handleLogReflection(channel, heraIntent.text, 'text')
          break
        case 'how_am_i_doing':
        case 'what_patterns':
        case 'mentor_prompt':
          await handleOnDemand(channel, heraIntent.type)
          break
      }
      await getDb()
        .update(activity)
        .set({ status: 'success', duration_ms: Date.now() - startMs })
        .where(eq(activity.id, rowId))
      return
    }

    // CASSANDRA intent routing (before DEMETER — "brief me" belongs to CASSANDRA)
    const cassandraIntent = detectCassandraIntent(text)
    if (cassandraIntent) {
      await getDb().update(activity).set({ agent: 'CASSANDRA' }).where(eq(activity.id, rowId))
      switch (cassandraIntent.type) {
        case 'morning_brief': await handleCassandraBrief(channel, event.user); break
        case 'fx_only':       await handleFxOnly(channel, event.user); break
      }
      await getDb()
        .update(activity)
        .set({ status: 'success', duration_ms: Date.now() - startMs })
        .where(eq(activity.id, rowId))
      return
    }

    // DEMETER intent routing
    const demeterIntent = detectDemeterIntent(text)
    if (demeterIntent) {
      await getDb().update(activity).set({ agent: 'DEMETER' }).where(eq(activity.id, rowId))

      switch (demeterIntent.type) {
        case 'brief':
          await handlePortfolioBrief(channel, event.user)
          break
        case 'add':
          await handleAddHolding(
            demeterIntent.ticker,
            demeterIntent.quantity,
            demeterIntent.avgCost,
            demeterIntent.currency,
            channel,
            event.user,
          )
          break
        case 'remove':
          await handleRemoveHolding(demeterIntent.ticker, channel, event.user)
          break
        case 'update':
          await handleUpdateHolding(demeterIntent.ticker, demeterIntent.quantity, channel, event.user)
          break
        case 'list':
          await handleListHoldings(channel, event.user)
          break
        case 'allocation':
          await handleAllocation(channel, event.user)
          break
        case 'news':
          await handleNewsStub(demeterIntent.ticker, channel, event.user)
          break
        case 'seed':
          await handleSeedHoldings(channel, event.user)
          break
      }

      await getDb()
        .update(activity)
        .set({ status: 'success', duration_ms: Date.now() - startMs })
        .where(eq(activity.id, rowId))
      return
    }

    // ATHENA intent routing
    const intent = detectAthenaIntent(text)

    if (intent) {
      await getDb().update(activity).set({ agent: 'ATHENA' }).where(eq(activity.id, rowId))

      switch (intent.type) {
        case 'ingest':
          await handleIngest(intent.module, intent.material, channel, event.user)
          break
        case 'quiz':
          await handleFlashcardQuiz(channel, event.user)
          break
        case 'daily_quiz':
          await handleDailyQuiz(intent.module, channel, event.user)
          break
        case 'progress':
          await handleProgress(channel, event.user)
          break
        case 'weakness':
          await handleWeaknessReport(channel, event.user)
          break
        case 'plan':
          await handleStudyPlan(channel, event.user)
          break
      }

      await getDb()
        .update(activity)
        .set({ status: 'success', duration_ms: Date.now() - startMs })
        .where(eq(activity.id, rowId))
      return
    }

    // Default: MAIA spine — pass to Claude
    const reply = await ask(text)
    await postMessage(channel, reply, event.ts)

    await getDb()
      .update(activity)
      .set({
        output: reply,
        status: 'success',
        duration_ms: Date.now() - startMs,
      })
      .where(eq(activity.id, rowId))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await getDb()
      .update(activity)
      .set({ output: message, status: 'error', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
  }
}
