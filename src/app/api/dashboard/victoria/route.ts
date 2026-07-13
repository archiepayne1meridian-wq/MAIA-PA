import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { kpi_weekly, kpi_logs } from '@/db/schema'
import { desc, gte } from 'drizzle-orm'

// Matches victoria-db.ts toWeekStart — Monday midnight UTC
function toWeekStartUtc(nowMs = Date.now()): number {
  const d = new Date(nowMs)
  const day = d.getUTCDay() // 0=Sun
  const daysFromMonday = (day + 6) % 7
  return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - daysFromMonday * 86400 * 1000) / 1000
}

function todayStartUtc(): number {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000
}

function weeklyTotals(logs: Record<string, number>[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const log of logs) {
    for (const [k, v] of Object.entries(log)) {
      totals[k] = (totals[k] ?? 0) + (Number.isFinite(v) ? v : 0)
    }
  }
  return totals
}

function weekLabel(weekStartSecs: number, isCurrent: boolean): string {
  if (isCurrent) return 'This wk'
  const d = new Date(weekStartSecs * 1000)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const KNOWN_METRICS = ['calls', 'connects', 'meetings_booked', 'meetings_held', 'follow_ups', 'new_prospects', 'active_clients']

function parseMetrics(json: string): Record<string, number> {
  try { return JSON.parse(json) as Record<string, number> } catch { return {} }
}

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const currentWeekStart = toWeekStartUtc()
  const todayStart = todayStartUtc()
  const thirtyAgo = todayStart - 30 * 86400

  // Historical weekly scorecards — up to 8 (newest first)
  const weeklyRows = await db
    .select({ week_start: kpi_weekly.week_start, totals_json: kpi_weekly.totals_json })
    .from(kpi_weekly)
    .orderBy(desc(kpi_weekly.week_start))
    .limit(8)

  const parsedWeekly = weeklyRows.map(r => {
    return { weekStart: r.week_start, totals: parseMetrics(r.totals_json) }
  })

  const thisWeekScorecard = parsedWeekly.find(w => w.weekStart === currentWeekStart)

  const currentWeekLogs = await db
    .select({ metrics_json: kpi_logs.metrics_json })
    .from(kpi_logs)
    .where(gte(kpi_logs.log_date, currentWeekStart))
  const currentWeekTotals = thisWeekScorecard?.totals ?? weeklyTotals(currentWeekLogs.map(r => parseMetrics(r.metrics_json)))

  // Today's totals
  const todayLogs = await db
    .select({ metrics_json: kpi_logs.metrics_json })
    .from(kpi_logs)
    .where(gte(kpi_logs.log_date, todayStart))
  const todayTotals = weeklyTotals(todayLogs.map(r => parseMetrics(r.metrics_json)))

  // Scorecard history (newest first, with summaries)
  const scorecardHistoryRows = await db
    .select({ id: kpi_weekly.id, week_start: kpi_weekly.week_start, totals_json: kpi_weekly.totals_json, summary: kpi_weekly.summary })
    .from(kpi_weekly)
    .orderBy(desc(kpi_weekly.week_start))
    .limit(12)

  const weeklyScorecardsHistory = scorecardHistoryRows.map(r => {
    const totals = parseMetrics(r.totals_json)
    return {
      id: r.id,
      weekStart: r.week_start,
      label: weekLabel(r.week_start, r.week_start === currentWeekStart),
      totals,
      summary: r.summary,
    }
  })

  // Daily bars (per-day last 30 days)
  const dailyLogs = await db
    .select({ log_date: kpi_logs.log_date, metrics_json: kpi_logs.metrics_json })
    .from(kpi_logs)
    .where(gte(kpi_logs.log_date, thirtyAgo))
    .orderBy(kpi_logs.log_date)

  const dailyMap = new Map<number, Record<string, number>>()
  for (const log of dailyLogs) {
    const metrics = parseMetrics(log.metrics_json)
    const existing = dailyMap.get(log.log_date) ?? {}
    for (const [k, v] of Object.entries(metrics)) {
      existing[k] = (existing[k] ?? 0) + (Number.isFinite(v) ? v : 0)
    }
    dailyMap.set(log.log_date, existing)
  }
  const dailyBars = Array.from(dailyMap.entries()).map(([date, totals]) => ({
    label: new Date(date * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    date,
    ...Object.fromEntries(KNOWN_METRICS.map(k => [k, totals[k] ?? 0])),
  }))

  // Build weekly bars
  const historicalBars = parsedWeekly
    .filter(w => w.weekStart !== currentWeekStart)
    .slice(0, 8)
    .reverse()

  const bars = [
    ...historicalBars.map(w => ({
      label: weekLabel(w.weekStart, false),
      weekStart: w.weekStart,
      isCurrent: false,
      ...Object.fromEntries(KNOWN_METRICS.map(k => [k, w.totals[k] ?? 0])),
    })),
    {
      label: weekLabel(currentWeekStart, true),
      weekStart: currentWeekStart,
      isCurrent: true,
      ...Object.fromEntries(KNOWN_METRICS.map(k => [k, currentWeekTotals[k] ?? 0])),
    },
  ]

  const allTotals = [...historicalBars.map(w => w.totals), currentWeekTotals]
  const activeMetrics = KNOWN_METRICS.filter(m => allTotals.some(t => (t[m] ?? 0) > 0))
  const noDataMetrics = KNOWN_METRICS.filter(m => !activeMetrics.includes(m))

  const targets: Record<string, number | null> = { calls: 15 }
  for (const m of KNOWN_METRICS) {
    if (!(m in targets)) targets[m] = null
  }

  return NextResponse.json({
    bars,
    activeMetrics,
    noDataMetrics,
    targets,
    thisWeekTotals: currentWeekTotals,
    todayTotals,
    weeklyScorecardsHistory,
    dailyBars,
  })
}
