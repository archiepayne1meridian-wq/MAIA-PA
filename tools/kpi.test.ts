import { describe, it, expect } from 'vitest'
import {
  weeklyTotals,
  compareToPrevious,
  vsTargets,
  trend,
  type DailyMetrics,
  type WeeklyTotals,
} from './kpi'

// ── weeklyTotals ──────────────────────────────────────────────────────────────

describe('weeklyTotals', () => {
  it('returns empty object for empty logs', () => {
    expect(weeklyTotals([])).toEqual({})
  })

  it('returns the single log unchanged', () => {
    const log: DailyMetrics = { calls: 8, connects: 3 }
    expect(weeklyTotals([log])).toEqual({ calls: 8, connects: 3 })
  })

  it('sums metrics across multiple days', () => {
    const logs: DailyMetrics[] = [
      { calls: 8, connects: 3, meetings_booked: 1 },
      { calls: 6, connects: 2, meetings_booked: 0 },
      { calls: 10, connects: 5, meetings_booked: 2 },
    ]
    expect(weeklyTotals(logs)).toEqual({ calls: 24, connects: 10, meetings_booked: 3 })
  })

  it('handles logs with different metric sets (partial tallies)', () => {
    const logs: DailyMetrics[] = [
      { calls: 5 },
      { calls: 3, follow_ups: 4 },
    ]
    expect(weeklyTotals(logs)).toEqual({ calls: 8, follow_ups: 4 })
  })

  it('ignores non-finite values (NaN, Infinity)', () => {
    const logs: DailyMetrics[] = [{ calls: NaN }, { calls: 5 }]
    expect(weeklyTotals(logs)).toEqual({ calls: 5 })
  })
})

// ── compareToPrevious ─────────────────────────────────────────────────────────

describe('compareToPrevious', () => {
  it('computes delta and pct for a normal comparison', () => {
    const thisWeek: WeeklyTotals = { calls: 24 }
    const lastWeek: WeeklyTotals = { calls: 20 }
    const [result] = compareToPrevious(thisWeek, lastWeek)
    expect(result).toEqual({
      metric: 'calls', thisWeek: 24, lastWeek: 20, delta: 4, pct: 20, isBaseline: false,
    })
  })

  it('BASELINE: returns isBaseline=true with null delta/pct when no prior week exists', () => {
    const results = compareToPrevious({ calls: 8, connects: 3 }, null)
    expect(results).toHaveLength(2)
    for (const r of results) {
      expect(r.isBaseline).toBe(true)
      expect(r.lastWeek).toBeNull()
      expect(r.delta).toBeNull()
      expect(r.pct).toBeNull()
    }
    const calls = results.find(r => r.metric === 'calls')
    expect(calls?.thisWeek).toBe(8)
  })

  it('BASELINE: never produces NaN, Infinity, or "down 100%" for a first week', () => {
    const results = compareToPrevious({ calls: 0 }, null)
    for (const r of results) {
      expect(r.delta).toBeNull()
      expect(r.pct).toBeNull()
      if (r.pct !== null) {
        expect(Number.isFinite(r.pct)).toBe(true)
      }
    }
  })

  it('returns null pct when lastWeek metric is 0 (avoid div-by-zero, but is NOT baseline)', () => {
    const [result] = compareToPrevious({ calls: 5 }, { calls: 0 })
    expect(result?.pct).toBeNull()
    expect(result?.delta).toBe(5)
    expect(result?.isBaseline).toBe(false)  // prior week exists, just had 0 for this metric
  })

  it('computes a negative delta for a down week', () => {
    const [result] = compareToPrevious({ calls: 10 }, { calls: 20 })
    expect(result?.delta).toBe(-10)
    expect(result?.pct).toBe(-50)
    expect(result?.isBaseline).toBe(false)
  })

  it('includes metrics present in lastWeek but absent from thisWeek', () => {
    const results = compareToPrevious({ calls: 5 }, { calls: 5, follow_ups: 3 })
    const fu = results.find(r => r.metric === 'follow_ups')
    expect(fu).toBeDefined()
    expect(fu?.thisWeek).toBe(0)
    expect(fu?.lastWeek).toBe(3)
    expect(fu?.delta).toBe(-3)
    expect(fu?.isBaseline).toBe(false)
  })

  it('rounds pct to one decimal place', () => {
    const [result] = compareToPrevious({ calls: 11 }, { calls: 9 })
    // (2/9)*100 = 22.222... → 22.2
    expect(result?.pct).toBe(22.2)
  })

  it('returns empty array when both weeks are empty', () => {
    expect(compareToPrevious({}, {})).toEqual([])
  })

  it('BASELINE: returns empty array when first week has no data', () => {
    expect(compareToPrevious({}, null)).toEqual([])
  })
})

// ── vsTargets ─────────────────────────────────────────────────────────────────

describe('vsTargets', () => {
  it('marks on_track when value meets or exceeds target', () => {
    const result = vsTargets({ calls: 40 }, { calls: 40 })
    expect(result[0]?.status).toBe('on_track')
  })

  it('marks below when value is under target', () => {
    const result = vsTargets({ calls: 30 }, { calls: 40 })
    expect(result[0]?.status).toBe('below')
  })

  it('marks no_target when target is null', () => {
    const result = vsTargets({ calls: 20 }, { calls: null })
    expect(result[0]?.status).toBe('no_target')
  })

  it('marks no_target when metric is absent from targets', () => {
    const result = vsTargets({ calls: 20 }, {})
    expect(result[0]?.status).toBe('no_target')
  })

  it('returns empty array when totals are empty', () => {
    expect(vsTargets({}, { calls: 40 })).toEqual([])
  })

  it('handles mixed target statuses', () => {
    const totals: WeeklyTotals = { calls: 45, meetings_booked: 3, follow_ups: 10 }
    const targets = { calls: 40, meetings_booked: 5, follow_ups: null }
    const results = vsTargets(totals, targets)
    const byMetric = Object.fromEntries(results.map(r => [r.metric, r.status]))
    expect(byMetric['calls']).toBe('on_track')
    expect(byMetric['meetings_booked']).toBe('below')
    expect(byMetric['follow_ups']).toBe('no_target')
  })
})

// ── trend ─────────────────────────────────────────────────────────────────────

describe('trend', () => {
  it('returns flat for empty weeks (no history at all)', () => {
    expect(trend([], 'calls')).toBe('flat')
  })

  it('BASELINE: returns flat for a single week — building baseline, no trend yet', () => {
    expect(trend([{ calls: 10 }], 'calls')).toBe('flat')
  })

  it('returns flat when all values are zero', () => {
    expect(trend([{ calls: 0 }, { calls: 0 }, { calls: 0 }], 'calls')).toBe('flat')
  })

  it('returns up when second half average is clearly higher', () => {
    // First half avg: 10, second half avg: 30 → +200% > threshold
    const weeks: WeeklyTotals[] = [
      { calls: 10 },
      { calls: 10 },
      { calls: 30 },
      { calls: 30 },
    ]
    expect(trend(weeks, 'calls')).toBe('up')
  })

  it('returns down when second half average is clearly lower', () => {
    const weeks: WeeklyTotals[] = [
      { calls: 40 },
      { calls: 40 },
      { calls: 10 },
      { calls: 10 },
    ]
    expect(trend(weeks, 'calls')).toBe('down')
  })

  it('returns flat when change is within the threshold', () => {
    // First half avg: 20, second half avg: 21 → 5% change < 10% threshold
    const weeks: WeeklyTotals[] = [
      { calls: 20 },
      { calls: 20 },
      { calls: 21 },
      { calls: 21 },
    ]
    expect(trend(weeks, 'calls')).toBe('flat')
  })

  it('returns up when first half is zero and second half has activity', () => {
    const weeks: WeeklyTotals[] = [{ calls: 0 }, { calls: 10 }]
    expect(trend(weeks, 'calls')).toBe('up')
  })

  it('treats absent metric as 0 (metric not yet logged)', () => {
    const weeks: WeeklyTotals[] = [{ connects: 5 }, { connects: 5 }]
    expect(trend(weeks, 'calls')).toBe('flat')
  })

  it('respects a custom threshold percentage', () => {
    // 15% change — within 20% custom threshold → flat
    const weeks: WeeklyTotals[] = [{ calls: 20 }, { calls: 23 }]
    expect(trend(weeks, 'calls', 20)).toBe('flat')
    // Same data but default 10% threshold → up
    expect(trend(weeks, 'calls', 10)).toBe('up')
  })
})
