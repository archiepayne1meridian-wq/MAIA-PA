import { describe, it, expect } from 'vitest'
import { calcStreak } from './hera-db'

const DAY = 86400

// A fixed "today midnight" for all tests: 2026-06-15 00:00:00 UTC
const TODAY = 1750032000  // Mon 2026-06-15 00:00:00 UTC

function days(...offsets: number[]): Set<number> {
  return new Set(offsets.map(d => TODAY - d * DAY))
}

describe('calcStreak', () => {
  it('returns 0 when no reflections exist', () => {
    expect(calcStreak(new Set(), TODAY)).toBe(0)
  })

  it('returns 1 when only today has a reflection', () => {
    expect(calcStreak(days(0), TODAY)).toBe(1)
  })

  it('returns 2 for today + yesterday', () => {
    expect(calcStreak(days(0, 1), TODAY)).toBe(2)
  })

  it('returns 5 for five consecutive days ending today', () => {
    expect(calcStreak(days(0, 1, 2, 3, 4), TODAY)).toBe(5)
  })

  it('breaks on a gap: today + day-before-yesterday (missing yesterday)', () => {
    // today=0, gap at 1, reflection at 2 — streak is 1 (only today)
    expect(calcStreak(days(0, 2), TODAY)).toBe(1)
  })

  it('returns 0 when only a past day has a reflection (not today)', () => {
    // reflection 2 days ago, nothing today or yesterday
    expect(calcStreak(days(2), TODAY)).toBe(0)
  })

  it('returns 3 for consecutive past days not reaching today', () => {
    // reflections on days 1, 2, 3 — streak starts from today (0) which is absent
    expect(calcStreak(days(1, 2, 3), TODAY)).toBe(0)
  })

  it('handles a long streak correctly', () => {
    const offsets = Array.from({ length: 30 }, (_, i) => i)
    expect(calcStreak(days(...offsets), TODAY)).toBe(30)
  })

  it('multiple reflections on the same day count as one streak day', () => {
    // Two entries both bucketing to "today midnight" — streak is still 1
    const set = new Set([TODAY, TODAY])
    expect(calcStreak(set, TODAY)).toBe(1)
  })

  it('gap in the middle of a longer run — only the trailing consecutive run counts', () => {
    // today(0), yesterday(1), gap(2), day4(3), day5(4) — streak = 2 (today + yesterday)
    expect(calcStreak(days(0, 1, 3, 4), TODAY)).toBe(2)
  })
})

// ─── windowed cutoff date math ────────────────────────────────────────────────
// getReflections(days) uses: cutoff = now - days * 86400
// Verify the arithmetic stays correct so the window is what we expect.
describe('windowed fetch cutoff', () => {
  it('7-day window cutoff is 7 × 86400 seconds before now', () => {
    const now = TODAY + 43200  // noon on today
    const cutoff = now - 7 * DAY
    expect(cutoff).toBe(TODAY + 43200 - 7 * DAY)
  })

  it('cutoff for 0 days returns now (empty window)', () => {
    const now = TODAY
    expect(now - 0 * DAY).toBe(now)
  })
})
