// VICTORIA handler — config loader, intent detection, handlers, nudge/scorecard builders.

import * as fs from 'fs'
import * as path from 'path'
import { eq } from 'drizzle-orm'
import { postMessage } from './slack'
import { getDb } from '@/db'
import { activity } from '@/db/schema'
import {
  parseTally,
  formatEchoConfirm,
  formatScorecard,
  type VictoriaConfig,
  type ScorecardData,
} from './victoria'
import {
  weeklyTotals,
  compareToPrevious,
  vsTargets,
  trend,
} from '../../tools/kpi'
import {
  logTally,
  getDay,
  getCurrentWeekLogs,
  getPreviousWeekLogs,
  getWeeklies,
  saveWeekly,
  toDateStamp,
  toWeekStart,
} from '../../tools/victoria-db'

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: VictoriaConfig = {
  metrics: ['calls', 'connects', 'meetings_booked', 'meetings_held', 'follow_ups', 'new_prospects', 'active_clients'],
  targets: {},
  nudgeTime: '18:00',
  scorecardDay: 'Friday',
}

export function parseVictoriaConfig(content: string): VictoriaConfig {
  const lines = content.split('\n')
  const config = { ...DEFAULT_CONFIG, targets: {} as Record<string, number | null>, metrics: [] as string[] }
  let section: 'none' | 'metrics' | 'targets' | 'timing' = 'none'

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trimEnd()
    const trimmed = line.trim()
    if (!trimmed) continue

    // Section headers
    if (/^##\s+metrics/i.test(trimmed)) { section = 'metrics'; continue }
    if (/^##\s+weekly\s+targets/i.test(trimmed)) { section = 'targets'; continue }
    if (/^##\s+timing/i.test(trimmed)) { section = 'timing'; continue }
    if (/^##/.test(trimmed)) { section = 'none'; continue }

    if (section === 'metrics') {
      const m = line.match(/^\s*-\s+([a-z_]+)/)
      if (m && m[1]) config.metrics.push(m[1].trim())
    }

    if (section === 'targets') {
      // "- calls: 40" or "- calls:" (blank = no target)
      const m = line.match(/^\s*-\s+([a-z_]+):\s*(\d+)?/)
      if (m && m[1]) {
        const key = m[1].trim()
        config.targets[key] = m[2] ? parseInt(m[2], 10) : null
      }
    }

    if (section === 'timing') {
      const nudge = line.match(/^\s*-?\s*nudge_time:\s*(.+)/)
      if (nudge && nudge[1]) config.nudgeTime = nudge[1].trim().split(' ')[0]!.trim()
      const day = line.match(/^\s*-?\s*scorecard_day:\s*(.+)/)
      if (day && day[1]) config.scorecardDay = day[1].trim().split(' ')[0]!.trim()
    }
  }

  if (config.metrics.length === 0) config.metrics = DEFAULT_CONFIG.metrics
  return config
}

function loadVictoriaConfig(): VictoriaConfig {
  const p = path.join(process.cwd(), 'context', 'victoria.md')
  try {
    return parseVictoriaConfig(fs.readFileSync(p, 'utf-8'))
  } catch {
    return DEFAULT_CONFIG
  }
}

// ── Intent detection ──────────────────────────────────────────────────────────

export type VictoriaIntent =
  | { type: 'scorecard' }
  | { type: 'tally'; text: string }
  | { type: 'confirm_tally' }
  | { type: 'correct_tally'; text: string }

export function detectVictoriaIntent(text: string): VictoriaIntent | null {
  const lower = text.trim().toLowerCase()

  // On-demand scorecard / status
  if (
    /\bhow am i doing\b/.test(lower) ||
    /\bmy numbers?\b/.test(lower) ||
    /\bscorecard\b/.test(lower) ||
    /^victoria[,\s].*\b(score|numbers?|stats?|progress|report|summary)\b/.test(lower) ||
    /^victoria\s*$/.test(lower) ||
    /^victoria[,\s]\s*how/.test(lower)
  ) {
    return { type: 'scorecard' }
  }

  // "VICTORIA, <tally>" — explicit prefix
  if (/^victoria[,\s]/i.test(lower)) {
    const tallyPart = text.trim().replace(/^victoria[,\s]+/i, '').trim()
    if (tallyPart) return { type: 'tally', text: tallyPart }
    return null
  }

  return null
}

// Called from the events route when we're in a pending-confirmation state
// (stored in a lightweight in-memory map — sessions are short-lived).
export function isPendingConfirm(text: string): boolean {
  const lower = text.trim().toLowerCase()
  return /^(yes|yep|yeah|correct|looks? right|confirmed?|ok|okay|✓|👍)$/i.test(lower)
}

// ── Pending tally state (in-memory, per-user) ─────────────────────────────────
// Persists only within a single Railway instance and single conversation.
// Acceptable for a personal tool with one user.

interface PendingTally {
  metrics: Record<string, number>
  note?: string
  dateStamp: number
  isOverwrite: boolean
}

const pendingTallies = new Map<string, PendingTally>()

export function setPendingTally(userId: string, p: PendingTally): void {
  pendingTallies.set(userId, p)
}

export function getPendingTally(userId: string): PendingTally | null {
  return pendingTallies.get(userId) ?? null
}

export function clearPendingTally(userId: string): void {
  pendingTallies.delete(userId)
}

// ── Activity logging ──────────────────────────────────────────────────────────

async function logActivity(
  type: string,
  input: string,
  slackUser?: string,
): Promise<{ rowId: string; startMs: number }> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()
  await getDb().insert(activity).values({
    id: rowId,
    event_id: `victoria_${type}_${Date.now()}`,
    type,
    agent: 'VICTORIA',
    slack_user: slackUser,
    input: input.slice(0, 200),
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })
  return { rowId, startMs }
}

async function succeedActivity(rowId: string, startMs: number, output?: string) {
  await getDb().update(activity)
    .set({ output: output?.slice(0, 500), status: 'success', duration_ms: Date.now() - startMs })
    .where(eq(activity.id, rowId))
}

// ── Tally handler ─────────────────────────────────────────────────────────────

export async function handleTally(
  channel: string,
  userId: string | undefined,
  rawText: string,
): Promise<void> {
  const { rowId, startMs } = await logActivity('tally_parse', rawText, userId)
  const config = loadVictoriaConfig()

  // Strip client names — any token that looks like a proper noun (capitalised word not at
  // sentence start and not a metric/number). Simple heuristic: warn if 2+ consecutive caps words.
  const properNounPattern = /(?:(?<=\s)|(?<=,\s))([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g
  const clientNameMatches = rawText.match(properNounPattern)
  let noteWarning = ''
  if (clientNameMatches) {
    noteWarning = '\n_Names stay in the deVere CRM — I\'ve stored the count only._'
  }

  const { parsed, needsClaude, found } = parseTally(rawText, config.metrics)

  if (Object.keys(parsed).length === 0 && !needsClaude) {
    await postMessage(channel,
      `_VICTORIA: couldn't read any numbers — try something like "8 calls, 2 meetings booked, 5 follow-ups"._`)
    await succeedActivity(rowId, startMs, 'parse failed — no numbers found')
    return
  }

  if (needsClaude) {
    // Stub — Claude fallback not yet enabled
    await postMessage(channel,
      `_VICTORIA: that one's a bit ambiguous — could you rephrase? (e.g. "8 calls, 2 meetings booked")_`)
    await succeedActivity(rowId, startMs, 'needs claude fallback — stub')
    return
  }

  const dateStamp = toDateStamp()
  const existing = await getDay(dateStamp)
  const isOverwrite = !!existing

  const echo = formatEchoConfirm(parsed, isOverwrite) + noteWarning

  // Store pending; wait for "yes" confirmation
  if (userId) {
    setPendingTally(userId, { metrics: parsed, dateStamp, isOverwrite })
  }

  await postMessage(channel, echo)
  await succeedActivity(rowId, startMs, `pending confirm — found: ${found.join(', ')}`)
}

// ── Confirmation handler ──────────────────────────────────────────────────────

export async function handleTallyConfirm(
  channel: string,
  userId: string | undefined,
): Promise<void> {
  if (!userId) {
    await postMessage(channel, `_VICTORIA: can't find a pending tally to confirm._`)
    return
  }

  const pending = getPendingTally(userId)
  if (!pending) {
    await postMessage(channel, `_VICTORIA: no pending tally — send your numbers first._`)
    return
  }

  clearPendingTally(userId)

  const { rowId, startMs } = await logActivity('tally_store', JSON.stringify(pending.metrics), userId)

  await logTally(pending.metrics, undefined, pending.dateStamp)

  const action = pending.isOverwrite ? 'Updated' : 'Saved'
  await postMessage(channel, `_${action}. Good work — keep it up._`)
  await succeedActivity(rowId, startMs, `stored: ${JSON.stringify(pending.metrics)}`)
}

// ── Scorecard builder (also used by cron) ────────────────────────────────────

export async function buildScorecard(channel: string, userId?: string): Promise<void> {
  const { rowId, startMs } = await logActivity('scorecard', 'on-demand scorecard', userId)

  const [thisWeekLogs, prevWeekLogs, recentWeeklies] = await Promise.all([
    getCurrentWeekLogs(),
    getPreviousWeekLogs(),
    getWeeklies(4),
  ])

  const config = loadVictoriaConfig()

  if (thisWeekLogs.length === 0) {
    await postMessage(channel,
      `*VICTORIA*\n\n_No tallies logged this week yet — send your end-of-day numbers to start tracking._`)
    await succeedActivity(rowId, startMs, 'no data this week')
    return
  }

  const thisTotals = weeklyTotals(thisWeekLogs.map(l => l.metrics))
  const prevTotals = prevWeekLogs.length > 0
    ? weeklyTotals(prevWeekLogs.map(l => l.metrics))
    : null

  const comparison = compareToPrevious(thisTotals, prevTotals)
  const targetList = vsTargets(thisTotals, config.targets)

  // Trend: use the 4 most recent completed weekly totals (oldest first)
  const historicalTotals = [...recentWeeklies].reverse().map(w => w.totals)
  const trends: Record<string, import('../../tools/kpi').TrendDirection> = {}
  for (const metric of Object.keys(thisTotals)) {
    trends[metric] = trend(historicalTotals, metric)
  }

  const data: ScorecardData = {
    weekStart: new Date(toWeekStart() * 1000),
    totals: thisTotals,
    comparison,
    targets: targetList,
    trends,
    daysCounted: thisWeekLogs.length,
  }

  const scorecardText = formatScorecard(data)

  // Save to kpi_weekly
  await saveWeekly(toWeekStart(), thisTotals, scorecardText)

  await postMessage(channel, scorecardText)
  await succeedActivity(rowId, startMs, `scorecard: ${thisWeekLogs.length} days`)
}

// ── End-of-day nudge (also used by cron) ─────────────────────────────────────

export async function buildEveningNudge(channel: string, userId?: string): Promise<void> {
  const { rowId, startMs } = await logActivity('nudge', 'end-of-day nudge', userId)

  const todayLog = await getDay()

  if (todayLog) {
    // Already logged — skip silently (cron path) or confirm
    const parts = Object.entries(todayLog.metrics)
      .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
      .join(' · ')
    console.log(`[victoria] nudge skipped — today already logged: ${parts}`)
    await succeedActivity(rowId, startMs, 'skipped — already logged')
    return
  }

  const config = loadVictoriaConfig()
  const metricHints = config.metrics
    .slice(0, 4)
    .map(m => m.replace(/_/g, ' '))
    .join(' / ')

  await postMessage(
    channel,
    `*VICTORIA — End of day*\n\nQuick tally for today? (${metricHints}…)\n\n_Reply with your numbers, e.g. "8 calls, 2 meetings booked, 5 follow-ups"_`,
  )
  await succeedActivity(rowId, startMs, 'nudge sent')
}
