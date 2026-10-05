// HERA handler — intent detection, reflection logging, nudge/review builders.
// Logs all actions to `activity` with agent='HERA'.

import * as fs from 'fs'
import * as path from 'path'
import { eq } from 'drizzle-orm'
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
  saveWeeklyReview,
  getStreak,
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
  `It sounds like you're carrying a lot right now, and I'm glad you put it into words. ` +
  `Please don't carry it on your own — talking to someone you trust, whether a friend, ` +
  `someone in your family, or someone else close to you, can really help. ` +
  `I'm always here when you want to reflect.`

// ─── Log a reflection — shared core ──────────────────────────────────────────
//
// Runs the full pipeline (distress check, ack, save, streak note) and returns
// the response text rather than posting it anywhere — the dashboard reflect
// route calls this and returns the text in its JSON response.

export interface ProcessedReflection {
  response: string
  distressFlagged: boolean
}

export async function processReflection(
  text: string,
  source: 'text' | 'voice' = 'text',
): Promise<ProcessedReflection> {
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
    return { response: SUPPORTIVE_RESPONSE, distressFlagged: true }
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

  return { response: parts.join('\n'), distressFlagged: false }
}

// ─── Scheduled weekly review ──────────────────────────────────────────────────

export async function buildWeeklyReview(): Promise<string> {
  const config = loadHeraConfig()
  const { rowId, startMs } = await logActivity('weekly_review', 'scheduled')

  try {
    const reflections = await getReflections(7)

    if (reflections.length === 0) {
      const empty = `No reflections this week. That's okay — the important thing is starting. Try a short note this evening.`
      await succeedActivity(rowId, startMs, 'no reflections this week')
      return empty
    }

    const summary = await coachWeekly(reflections, config.focusAreas)

    const nowSec = Math.floor(Date.now() / 1000)
    const weekStart = nowSec - 7 * 86400
    await saveWeeklyReview(weekStart, nowSec, summary)

    await succeedActivity(rowId, startMs, `weekly review saved (${reflections.length} reflections)`)
    return summary
  } catch (err) {
    console.error('[hera] buildWeeklyReview failed:', err)
    await failActivity(rowId, startMs, err)
    throw err
  }
}
