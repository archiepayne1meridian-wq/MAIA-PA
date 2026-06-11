import { describe, it, expect } from 'vitest'
import { sm2, GRADE_QUALITY } from './sm2'

const BASE: Parameters<typeof sm2>[0] = { ef: 2.5, intervalDays: 0, repetitions: 0 }

describe('sm2 — new card (repetitions=0)', () => {
  it('first correct review (good, q=4): repetitions→1, intervalDays→1', () => {
    const r = sm2(BASE, 4)
    expect(r.repetitions).toBe(1)
    expect(r.intervalDays).toBe(1)
  })

  it('lapse on fresh card (again, q=1): repetitions stays 0, intervalDays=1', () => {
    const r = sm2(BASE, 1)
    expect(r.repetitions).toBe(0)
    expect(r.intervalDays).toBe(1)
  })
})

describe('sm2 — second review (repetitions=1)', () => {
  it('second correct (good, q=4): repetitions→2, intervalDays→6', () => {
    const r = sm2({ ...BASE, repetitions: 1, intervalDays: 1 }, 4)
    expect(r.repetitions).toBe(2)
    expect(r.intervalDays).toBe(6)
  })
})

describe('sm2 — third review and beyond (repetitions≥2)', () => {
  it('third correct (good, q=4): intervalDays = round(6 * ef)', () => {
    const card = { ef: 2.5, intervalDays: 6, repetitions: 2 }
    const r = sm2(card, 4)
    expect(r.intervalDays).toBe(Math.round(6 * 2.5))
    expect(r.repetitions).toBe(3)
  })

  it('easy (q=5) increases EF above starting 2.5', () => {
    const r = sm2(BASE, 5)
    expect(r.ef).toBeGreaterThan(2.5)
  })

  it('hard (q=3) decreases EF', () => {
    const r = sm2({ ...BASE, repetitions: 1, intervalDays: 1 }, 3)
    expect(r.ef).toBeLessThan(2.5)
  })
})

describe('sm2 — EF clamp', () => {
  it('EF never goes below 1.3 even after repeated lapses', () => {
    let card = { ...BASE }
    for (let i = 0; i < 20; i++) {
      card = { ...card, ...sm2(card, 0) }
    }
    expect(card.ef).toBeGreaterThanOrEqual(1.3)
  })

  it('EF is exactly 1.3 when computed value would go below', () => {
    const card = { ef: 1.31, intervalDays: 1, repetitions: 0 }
    const r = sm2(card, 0)
    expect(r.ef).toBe(1.3)
  })
})

describe('sm2 — lapse resets', () => {
  it('q<3 always resets repetitions to 0 and intervalDays to 1', () => {
    const card = { ef: 2.5, intervalDays: 30, repetitions: 5 }
    for (const q of [0, 1, 2]) {
      const r = sm2(card, q)
      expect(r.repetitions).toBe(0)
      expect(r.intervalDays).toBe(1)
    }
  })
})

describe('sm2 — button quality mapping', () => {
  it('again→1, hard→3, good→4, easy→5', () => {
    expect(GRADE_QUALITY.again).toBe(1)
    expect(GRADE_QUALITY.hard).toBe(3)
    expect(GRADE_QUALITY.good).toBe(4)
    expect(GRADE_QUALITY.easy).toBe(5)
  })

  it('again (q=1) lapses; hard (q=3) keeps streak; good (q=4) keeps streak', () => {
    expect(sm2(BASE, GRADE_QUALITY.again).repetitions).toBe(0)
    expect(sm2(BASE, GRADE_QUALITY.hard).repetitions).toBe(1)
    expect(sm2(BASE, GRADE_QUALITY.good).repetitions).toBe(1)
    expect(sm2(BASE, GRADE_QUALITY.easy).repetitions).toBe(1)
  })
})

describe('sm2 — dueAt', () => {
  it('dueAt is in the future', () => {
    const now = Math.floor(Date.now() / 1000)
    const r = sm2(BASE, 4)
    expect(r.dueAt).toBeGreaterThan(now)
  })

  it('dueAt ≈ now + intervalDays * 86400', () => {
    const before = Math.floor(Date.now() / 1000)
    const r = sm2(BASE, 4)
    const after = Math.floor(Date.now() / 1000)
    const expectedMin = before + r.intervalDays * 86400
    const expectedMax = after + r.intervalDays * 86400
    expect(r.dueAt).toBeGreaterThanOrEqual(expectedMin)
    expect(r.dueAt).toBeLessThanOrEqual(expectedMax)
  })
})
