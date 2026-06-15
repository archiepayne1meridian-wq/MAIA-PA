// HERA handler — intent detection, reflection logging, nudge/review builders.
// Logs all actions to `activity` with agent='HERA'.

import * as fs from 'fs'
import * as path from 'path'
import { eq } from 'drizzle-orm'
import { postMessage } from './slack'
import {
  detectDistress,
  coarseSentiment,
  detectClientMention,
  acknowledgeReflection,
  coachWeekly,
} from './hera'
import {
  addReflection,
  getReflections,
  getTodayReflections,
  saveWeeklyReview,
  getStreak,
  type Reflection,
} from '../../tools/hera-db'
import { getDb } from '@/db'
import { activity } from '@/db/schema'

// ─── Config ──────────────────────────────────────────────────────────────────

interface HeraConfig {
  reflectionTime: string   // e.g. "21:30"
  weeklyReviewDay: string  // e.g. "Sunday"
  focusAreas: string[]
}

function loadHeraConfig(): HeraConfig {
  const p = path.join(process.cwd(), 'context', 'hera.md')
  const defaults: HeraConfig = { reflectionTime: '21:30', weeklyReviewDay: 'Sunday', focusAreas: [] }
  try {
    const content = fs.readFileSync(p, 'utf-8')
    const lines = content.split('\n')
    const config = { ...defaults }
    let inFocus = false

    for (const raw of lines) {
      const line = raw.replace(/#.*$/, '').trimEnd()
      if (!line.trim()) { inFocus = false; continue }

      const kv = line.match(/^(\w[\w_]*):\s*(.*)$/)
      if (kv && !raw.startsWith(' ') && !raw.startsWith('\t')) {
        inFocus = kv[1] === 'focus_areas'
        if (kv[1] === 'reflection_time' && kv[2]?.trim()) config.reflectionTime = kv[2].trim()
        if (kv[1] === 'weekly_review_day' && kv[2]?.trim()) config.weeklyReviewDay = kv[2].trim()
        continue
      }
      const item = line.match(/^\s*-\s+(.+)$/)
      if (inFocus && item) config.focusAreas.push(item[1]!.trim())
    }
    return config
  } catch {
    return defaults
  }
}

// ─── Intent detection ─────────────────────────────────────────────────────────

export type HeraIntent =
  | { type: 'log_reflection'; text: string }
  | { type: 'how_am_i_doing' }
  | { type: 'what_patterns' }
  | { type: 'mentor_prompt' }

export function detectHeraIntent(text: string): HeraIntent | null {
  const lower = text.trim().toLowerCase()

  // On-demand queries
  if (/\b(how am i doing|how('?m| am) i getting on)\b/i.test(lower))
    return { type: 'how_am_i_doing' }
  if (/\bwhat patterns\b/i.test(lower))
    return { type: 'what_patterns' }
  if (/\b(raise with (my )?(senior |line )?adviser|raise with (my )?mentor|what (should|to) (raise|ask|bring))\b/i.test(lower))
    return { type: 'mentor_prompt' }

  // Explicit reflection trigger: "HERA," prefix, or the word "reflection"
  if (/^hera[,.]?\s+/i.test(lower) || /\breflection\b/i.test(lower))
    return { type: 'log_reflection', text: text.trim() }

  return null
}

// ─── Shared activity logger ───────────────────────────────────────────────────

async function logActivity(type: string, input: string): Promise<{ rowId: string; startMs: number }> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()
  await getDb().insert(activity).values({
    id: rowId,
    event_id: `hera_${type}_${Date.now()}`,
    type,
    agent: 'HERA',
    input,
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })
  return { rowId, startMs }
}

async function succeedActivity(rowId: string, startMs: number, output: string) {
  await getDb().update(activity)
    .set({ output, status: 'success', duration_ms: Date.now() - startMs })
    .where(eq(activity.id, rowId))
}

async function failActivity(rowId: string, startMs: number, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  await getDb().update(activity)
    .set({ output: msg, status: 'error', duration_ms: Date.now() - startMs })
    .where(eq(activity.id, rowId))
}

// Supportive response shown when distress is flagged.
// Warm, human, not clinical. Gently points toward a trusted person.
// No helpline wall, no diagnosis, no specific methods.
const SUPPORTIVE_RESPONSE =
  `It sounds like things are weighing on you right now. ` +
  `Please don't sit with that alone — reach out to someone you trust today, ` +
  `whether that's a friend, a family member, or your GP. ` +
  `I've noted your reflection.`

// ─── Log a reflection ─────────────────────────────────────────────────────────

export async function handleLogReflection(
  channel: string,
  text: string,
  source: 'text' | 'voice' = 'text',
): Promise<void> {
  const { rowId, startMs } = await logActivity('log_reflection', text.slice(0, 200))

  try {
    // ── Step 1: keyword floor (runs always, result cannot be suppressed) ──
    const keywordCheck = detectDistress(text)
    const clientMention = detectClientMention(text)

    // ── Step 2: Claude ack + belt-and-braces distress check ──────────────
    let ackText = `Logged. Thanks for checking in. 🌿`   // fallback if Claude unavailable
    let modelFlaggedDistress = false
    try {
      const result = await acknowledgeReflection(text)
      ackText = result.ack
      modelFlaggedDistress = result.modelFlaggedDistress
    } catch (err) {
      console.error('[hera] acknowledgeReflection failed (using fallback):', err)
    }

    // ── Step 3: final flag — keyword OR model; keyword can never be suppressed ──
    const finalDistressFlagged = keywordCheck.flagged || modelFlaggedDistress

    // ── Step 4: save reflection with final flag ───────────────────────────
    const sentiment = coarseSentiment(text, finalDistressFlagged)
    await addReflection({ body: text, source, sentiment, distressFlagged: finalDistressFlagged })

    // ── Step 5: route based on final flag ─────────────────────────────────
    if (finalDistressFlagged) {
      // Supportive path — never let a cheerful ack go out on a flagged note.
      await postMessage(channel, SUPPORTIVE_RESPONSE)
      await succeedActivity(rowId, startMs, 'distress path taken')
      return
    }

    // ── Normal acknowledgement ────────────────────────────────────────────
    const streak = await getStreak()
    const streakNote = streak >= 2 ? `  _${streak}-day streak._` : ''
    const parts: string[] = [ackText + streakNote]

    if (clientMention) {
      parts.push(
        `_Just a note: it's worth keeping reflections focused on your own development ` +
        `rather than specific client details. No worries — this one's saved._`
      )
    }

    await postMessage(channel, parts.join('\n'))
    await succeedActivity(rowId, startMs, 'reflection logged')
  } catch (err) {
    console.error('[hera] handleLogReflection failed:', err)
    await failActivity(rowId, startMs, err)
    await postMessage(channel, `⚠ HERA: couldn't save your reflection — ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ─── On-demand: how am I doing / patterns / mentor prompt ────────────────────

export async function handleOnDemand(
  channel: string,
  intent: 'how_am_i_doing' | 'what_patterns' | 'mentor_prompt',
): Promise<void> {
  const config = loadHeraConfig()
  const { rowId, startMs } = await logActivity(`on_demand_${intent}`, intent)

  try {
    const recent = await getReflections(14)

    if (recent.length === 0) {
      await postMessage(channel, `_HERA: no reflections on record yet. Send one this evening and I'll start building up a picture._`)
      await succeedActivity(rowId, startMs, 'no data')
      return
    }

    let reply: string
    if (intent === 'mentor_prompt') {
      // Run coachWeekly and extract just the final adviser-prompt paragraph.
      // For simplicity, we run the full coaching read — the adviser prompt is the last paragraph.
      reply = await coachWeekly(recent, config.focusAreas)
    } else {
      reply = await coachWeekly(recent, config.focusAreas)
    }

    await postMessage(channel, reply)
    await succeedActivity(rowId, startMs, 'on-demand response sent')
  } catch (err) {
    console.error('[hera] handleOnDemand failed:', err)
    await failActivity(rowId, startMs, err)
    await postMessage(channel, `⚠ HERA: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ─── Scheduled evening nudge ──────────────────────────────────────────────────

export async function buildEveningNudge(channel: string): Promise<void> {
  const { rowId, startMs } = await logActivity('evening_nudge', 'scheduled')

  try {
    const todayEntries = await getTodayReflections()
    if (todayEntries.length > 0) {
      console.log('[hera] nudge skipped — reflection already logged today')
      await succeedActivity(rowId, startMs, 'skipped — already reflected')
      return
    }

    await postMessage(channel, `*HERA* — How did today go? Send me a quick note, voice memo, or a few sentences whenever you're ready. 🌙`)
    await succeedActivity(rowId, startMs, 'nudge sent')
  } catch (err) {
    console.error('[hera] buildEveningNudge failed:', err)
    await failActivity(rowId, startMs, err)
    await postMessage(channel, `⚠ HERA nudge failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ─── Scheduled weekly review ──────────────────────────────────────────────────

export async function buildWeeklyReview(channel: string): Promise<void> {
  const config = loadHeraConfig()
  const { rowId, startMs } = await logActivity('weekly_review', 'scheduled')

  try {
    const reflections = await getReflections(7)

    if (reflections.length === 0) {
      await postMessage(channel, `*HERA — Weekly Reflection*\n\nNo reflections this week. That's okay — the important thing is starting. Try a short note this evening.`)
      await succeedActivity(rowId, startMs, 'no reflections this week')
      return
    }

    const summary = await coachWeekly(reflections, config.focusAreas)

    const nowSec = Math.floor(Date.now() / 1000)
    const weekStart = nowSec - 7 * 86400
    await saveWeeklyReview(weekStart, nowSec, summary)

    await postMessage(channel, `*HERA — Weekly Reflection*\n\n${summary}`)
    await succeedActivity(rowId, startMs, `weekly review posted (${reflections.length} reflections)`)
  } catch (err) {
    console.error('[hera] buildWeeklyReview failed:', err)
    await failActivity(rowId, startMs, err)
    await postMessage(channel, `⚠ HERA weekly review failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
