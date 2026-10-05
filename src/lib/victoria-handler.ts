// VICTORIA handler — config loader, intent detection, handlers, nudge/scorecard builders.

import * as fs from 'fs'
import * as path from 'path'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { activity } from '@/db/schema'
import {
  formatScorecard,
  scorecardNarrative,
  type VictoriaConfig,
  type MetricTarget,
  type ScorecardData,
} from './victoria'
import {
  weeklyTotals,
  compareToPrevious,
  vsTargets,
  trend,
  computeRatios,
} from '../../tools/kpi'
import {
  getDay,
  getCurrentWeekLogs,
  getPreviousWeekLogs,
  getWeeklies,
  saveWeekly,
  toWeekStart,
} from '../../tools/victoria-db'

// ── Config ────────────────────────────────────────────────────────────────────

// The canonical funnel. If context/victoria.md is missing/unreadable, this is exactly what loads —
// the metric set and targets are guaranteed correct even without the config file present.
const DEFAULT_CONFIG: VictoriaConfig = {
  metrics: ['prospects_sourced', 'green_prospects', 'calls', 'connects', 'meetings_booked', 'meetings_sat'],
  targets: {
    prospects_sourced: { daily: null, weekly: 100 },
    green_prospects: { daily: null, weekly: null },
    calls: { daily: 100, weekly: null },
    connects: { daily: 50, weekly: null },
    meetings_booked: { daily: 2, weekly: 10 },
    meetings_sat: { daily: null, weekly: 5 },
  },
  nudgeTime: '18:00',
  scorecardDay: 'Friday',
}

export function parseVictoriaConfig(content: string): VictoriaConfig {
  const lines = content.split('\n')
  const config = { ...DEFAULT_CONFIG, targets: {} as Record<string, MetricTarget>, metrics: [] as string[] }
  let section: 'none' | 'metrics' | 'targets' | 'timing' = 'none'

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trimEnd()
    const trimmed = line.trim()
    if (!trimmed) continue

    // Section headers
    if (/^##\s+metrics/i.test(trimmed)) { section = 'metrics'; continue }
    if (/^##\s+targets/i.test(trimmed)) { section = 'targets'; continue }
    if (/^##\s+timing/i.test(trimmed)) { section = 'timing'; continue }
    if (/^##/.test(trimmed)) { section = 'none'; continue }

    if (section === 'metrics') {
      const m = line.match(/^\s*-\s+([a-z_]+)/)
      if (m && m[1]) config.metrics.push(m[1].trim())
    }

    if (section === 'targets') {
      // "- calls: 100 /" (daily only), "- prospects_sourced: / 100" (weekly only),
      // "- meetings_booked: 2 / 10" (both), "- green_prospects: /" (neither)
      const m = line.match(/^\s*-\s+([a-z_]+):\s*(\d+)?\s*\/\s*(\d+)?/)
      if (m && m[1]) {
        const key = m[1].trim()
        config.targets[key] = {
          daily: m[2] ? parseInt(m[2], 10) : null,
          weekly: m[3] ? parseInt(m[3], 10) : null,
        }
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
  if (Object.keys(config.targets).length === 0) config.targets = DEFAULT_CONFIG.targets
  return config
}

export function loadVictoriaConfig(): VictoriaConfig {
  const p = path.join(process.cwd(), 'context', 'victoria.md')
  try {
    return parseVictoriaConfig(fs.readFileSync(p, 'utf-8'))
  } catch {
    return DEFAULT_CONFIG
  }
}

// ── Activity logging ──────────────────────────────────────────────────────────

async function logActivity(
  type: string,
  input: string,
): Promise<{ rowId: string; startMs: number }> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()
  await getDb().insert(activity).values({
    id: rowId,
    event_id: `victoria_${type}_${Date.now()}`,
    type,
    agent: 'VICTORIA',
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

// ── Scorecard builder (also used by cron) ────────────────────────────────────

export async function buildScorecard(): Promise<string> {
  const { rowId, startMs } = await logActivity('scorecard', 'on-demand scorecard')

  const [thisWeekLogs, prevWeekLogs, recentWeeklies] = await Promise.all([
    getCurrentWeekLogs(),
    getPreviousWeekLogs(),
    getWeeklies(4),
  ])

  const config = loadVictoriaConfig()

  if (thisWeekLogs.length === 0) {
    const empty = 'No tallies logged this week yet — send your end-of-day numbers to start tracking.'
    await succeedActivity(rowId, startMs, 'no data this week')
    return empty
  }

  // Zero-fill every tracked metric so a fixed 6-metric funnel always renders a complete
  // row/target check — a metric nobody logged today/this-week is a real "0", not an omission.
  const zeroFill = (totals: import('../../tools/kpi').WeeklyTotals) => {
    const filled = { ...totals }
    for (const m of config.metrics) if (!(m in filled)) filled[m] = 0
    return filled
  }

  const thisTotals = zeroFill(weeklyTotals(thisWeekLogs.map(l => l.metrics)))
  const prevTotals = prevWeekLogs.length > 0
    ? zeroFill(weeklyTotals(prevWeekLogs.map(l => l.metrics)))
    : null

  const comparison = compareToPrevious(thisTotals, prevTotals)

  // Weekly target: the explicit weekly figure if set, else a daily target scaled by the
  // days actually logged this week (e.g. calls: 100/day x 4 days logged = 400 expected).
  const weeklyTargetMap: Record<string, number | null> = {}
  const dailyTargetMap: Record<string, number | null> = {}
  for (const metric of config.metrics) {
    const t: MetricTarget = config.targets[metric] ?? { daily: null, weekly: null }
    weeklyTargetMap[metric] = t.weekly ?? (t.daily != null ? t.daily * thisWeekLogs.length : null)
    dailyTargetMap[metric] = t.daily
  }
  const weeklyTargetList = vsTargets(thisTotals, weeklyTargetMap)

  const todayLog = await getDay()
  const todayTotals = zeroFill(todayLog?.metrics ?? {})
  const dailyTargetList = vsTargets(todayTotals, dailyTargetMap)

  const ratios = computeRatios(thisTotals)

  // Trend: use the 4 most recent completed weekly totals (oldest first)
  const historicalTotals = [...recentWeeklies].reverse().map(w => w.totals)
  const trends: Record<string, import('../../tools/kpi').TrendDirection> = {}
  for (const metric of Object.keys(thisTotals)) {
    trends[metric] = trend(historicalTotals, metric)
  }

  const isFirstWeek = prevTotals === null

  const data: ScorecardData = {
    weekStart: new Date(toWeekStart() * 1000),
    totals: thisTotals,
    todayTotals,
    comparison,
    weeklyTargets: weeklyTargetList,
    dailyTargets: dailyTargetList,
    ratios,
    trends,
    daysCounted: thisWeekLogs.length,
    isFirstWeek,
  }

  const scorecardText = formatScorecard(data)

  let narrative = ''
  try {
    narrative = await scorecardNarrative(data)
  } catch (err) {
    console.error('[victoria] scorecardNarrative failed:', err)
  }

  const fullText = narrative ? `${scorecardText}\n${narrative}` : scorecardText

  // Save to kpi_weekly
  await saveWeekly(toWeekStart(), thisTotals, fullText)

  await succeedActivity(rowId, startMs, `scorecard: ${thisWeekLogs.length} days, first=${isFirstWeek}`)
  return fullText
}
