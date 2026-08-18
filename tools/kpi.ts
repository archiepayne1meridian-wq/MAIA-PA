// VICTORIA — pure KPI computation functions. No I/O. All deterministic.
// The model never computes these numbers — only this module does.

export interface DailyMetrics {
  [metric: string]: number
}

export interface WeeklyTotals {
  [metric: string]: number
}

export interface ComparisonItem {
  metric: string
  thisWeek: number
  lastWeek: number | null  // null when no prior week exists
  delta: number | null     // null when no prior week exists
  pct: number | null       // null when no prior week, or lastWeek === 0
  isBaseline: boolean      // true = first week on record, no comparison available
}

export interface TargetItem {
  metric: string
  value: number
  target: number | null
  status: 'on_track' | 'below' | 'no_target'
}

export type TrendDirection = 'up' | 'down' | 'flat'

export interface RatioItem {
  key: string
  label: string
  numerator: number
  denominator: number
  value: number | null  // percentage, one decimal place; null when denominator is 0 (never divide by zero)
}

// Sum all metrics across a set of daily log entries.
// Missing keys in a log are treated as 0 — partial tallies are fine.
export function weeklyTotals(logs: DailyMetrics[]): WeeklyTotals {
  const totals: WeeklyTotals = {}
  for (const log of logs) {
    for (const [metric, value] of Object.entries(log)) {
      totals[metric] = (totals[metric] ?? 0) + (Number.isFinite(value) ? value : 0)
    }
  }
  return totals
}

// Week-over-week delta and percentage change.
// Pass lastWeek=null when there is no prior week on record — signals "building baseline",
// not "previous week was zero". Never produces NaN%, div-by-zero, or misleading "down 100%".
export function compareToPrevious(
  thisWeek: WeeklyTotals,
  lastWeek: WeeklyTotals | null,
): ComparisonItem[] {
  if (lastWeek === null) {
    // First week on record — no comparison available.
    return Object.keys(thisWeek).map(metric => ({
      metric,
      thisWeek: thisWeek[metric] ?? 0,
      lastWeek: null,
      delta: null,
      pct: null,
      isBaseline: true,
    }))
  }

  const metrics = new Set([...Object.keys(thisWeek), ...Object.keys(lastWeek)])
  return Array.from(metrics).map(metric => {
    const tw = thisWeek[metric] ?? 0
    const lw = lastWeek[metric] ?? 0
    const delta = tw - lw
    const pct = lw === 0 ? null : Math.round((delta / lw) * 1000) / 10  // one decimal place
    return { metric, thisWeek: tw, lastWeek: lw, delta, pct, isBaseline: false }
  })
}

// Compare weekly totals against targets.
// Metrics with null / undefined targets get status='no_target'.
export function vsTargets(
  totals: WeeklyTotals,
  targets: Record<string, number | null | undefined>,
): TargetItem[] {
  return Object.keys(totals).map(metric => {
    const value = totals[metric] ?? 0
    const target = targets[metric] ?? null
    const status =
      target === null ? 'no_target'
      : value >= target ? 'on_track'
      : 'below'
    return { metric, value, target, status }
  })
}

// Determine trend direction for a single metric across N weekly snapshots.
// Weeks must be in chronological order (oldest first).
// Uses simple average of second half vs first half — stable on small N.
// Returns 'flat' if N < 2 or the metric is absent across all weeks.
export function trend(
  recentWeeks: WeeklyTotals[],
  metric: string,
  thresholdPct = 10,
): TrendDirection {
  const values = recentWeeks.map(w => w[metric] ?? 0)
  if (values.length < 2) return 'flat'

  const mid = Math.floor(values.length / 2)
  const firstHalf = values.slice(0, mid)
  const secondHalf = values.slice(mid)

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length

  if (avgFirst === 0 && avgSecond === 0) return 'flat'
  if (avgFirst === 0) return 'up'  // any activity vs none = up

  const changePct = ((avgSecond - avgFirst) / avgFirst) * 100
  if (changePct > thresholdPct) return 'up'
  if (changePct < -thresholdPct) return 'down'
  return 'flat'
}

// Derived funnel ratios — connect rate, booking rate, sit rate, green rate.
// Always calculated here from raw totals; never a value a user enters directly.
// Missing metrics are treated as 0. A zero denominator yields value=null (not 0%, not Infinity).
export function computeRatios(totals: WeeklyTotals): RatioItem[] {
  const pct = (numerator: number, denominator: number): number | null =>
    denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null

  const calls = totals.calls ?? 0
  const connects = totals.connects ?? 0
  const meetingsBooked = totals.meetings_booked ?? 0
  const meetingsSat = totals.meetings_sat ?? 0
  const prospectsSourced = totals.prospects_sourced ?? 0
  const greenProspects = totals.green_prospects ?? 0

  return [
    { key: 'connect_rate', label: 'Connect rate', numerator: connects, denominator: calls, value: pct(connects, calls) },
    { key: 'booking_rate', label: 'Booking rate', numerator: meetingsBooked, denominator: connects, value: pct(meetingsBooked, connects) },
    { key: 'sit_rate', label: 'Sit rate', numerator: meetingsSat, denominator: meetingsBooked, value: pct(meetingsSat, meetingsBooked) },
    { key: 'green_rate', label: 'Green rate', numerator: greenProspects, denominator: prospectsSourced, value: pct(greenProspects, prospectsSourced) },
  ]
}
