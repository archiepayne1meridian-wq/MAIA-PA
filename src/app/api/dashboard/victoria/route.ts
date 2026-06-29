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

// Replicate tools/kpi.ts weeklyTotals — same logic as the scorecard
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

// Known ordered metrics — shown in this order if present
const KNOWN_METRICS = ['calls', 'connects', 'meetings_booked', 'meetings_held', 'follow_ups', 'new_prospects', 'active_clients']

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const currentWeekStart = toWeekStartUtc()

  // Historical weekly scorecards — up to 8 (newest first)
  const weeklyRows = await db
    .select({ week_start: kpi_weekly.week_start, totals_json: kpi_weekly.totals_json })
    .from(kpi_weekly)
    .orderBy(desc(kpi_weekly.week_start))
    .limit(8)

  // Parse weekly scorecards
  const parsedWeekly = weeklyRows.map(r => {
    let totals: Record<string, number> = {}
    try { totals = JSON.parse(r.totals_json) } catch { /* ignore */ }
    return { weekStart: r.week_start, totals }
  })

  // Does this week already have a scorecard? (if scorecard was run mid-week)
  const thisWeekScorecard = parsedWeekly.find(w => w.weekStart === currentWeekStart)

  // Current week from kpi_logs (same computation as the scorecard uses)
  const currentWeekLogs = await db
    .select({ metrics_json: kpi_logs.metrics_json })
    .from(kpi_logs)
    .where(gte(kpi_logs.log_date, currentWeekStart))
  const currentWeekTotals = thisWeekScorecard?.totals ?? weeklyTotals(
    currentWeekLogs.map(r => {
      try { return JSON.parse(r.metrics_json) as Record<string, number> } catch { return {} }
    }),
  )

  // Build bars: historical (oldest first) + current week as rightmost
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

  // Determine which metrics have any non-zero data
  const allTotals = [
    ...historicalBars.map(w => w.totals),
    currentWeekTotals,
  ]
  const activeMetrics = KNOWN_METRICS.filter(m => allTotals.some(t => (t[m] ?? 0) > 0))
  const noDataMetrics = KNOWN_METRICS.filter(m => !activeMetrics.includes(m))

  // Targets — calls=15 matches D1 data.ts hardcode (context/victoria.md targets are blank)
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
  })
}
