import { getDb } from '@/db'
import { study_cards } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export interface Card {
  ef: number
  intervalDays: number
  repetitions: number
}

export interface ReviewResult extends Card {
  dueAt: number
}

// Button → quality mapping
export const GRADE_QUALITY: Record<'again' | 'hard' | 'good' | 'easy', number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
}

export function sm2(card: Card, quality: number): ReviewResult {
  let { ef, intervalDays, repetitions } = card

  if (quality < 3) {
    repetitions = 0
    intervalDays = 1
  } else {
    if (repetitions === 0) {
      intervalDays = 1
    } else if (repetitions === 1) {
      intervalDays = 6
    } else {
      intervalDays = Math.round(intervalDays * ef)
    }
    repetitions += 1
  }

  ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (ef < 1.3) ef = 1.3

  const dueAt = Math.floor(Date.now() / 1000) + intervalDays * 86400

  return { ef, intervalDays, repetitions, dueAt }
}

// ─── Weak-point tracking ────────────────────────────────────────────────────
// Ranks modules by average ease factor (lowest EF = weakest — cards that keep
// getting "again"/"hard" pull the module average down). Drives the dashboard's
// "Your weak areas this week" panel and the APOLLO → flagWeakArea() connection.

export async function getWeakModules(
  track: 'qualification' | 'products',
  exam?: string
): Promise<{
  moduleId: string
  moduleName: string
  avgEaseFactor: number
  dueCount: number
  weakestCards: { front: string; easeFactor: number }[]
}[]> {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const conditions = [eq(study_cards.track, track), eq(study_cards.suspended, 0)]
  if (exam) conditions.push(eq(study_cards.exam, exam))

  const cards = await db
    .select({ module: study_cards.module, front: study_cards.front, ef: study_cards.ef, due_at: study_cards.due_at })
    .from(study_cards)
    .where(and(...conditions))

  const byModule = new Map<string, { front: string; ef: number; due_at: number }[]>()
  for (const c of cards) {
    const arr = byModule.get(c.module) ?? []
    arr.push(c)
    byModule.set(c.module, arr)
  }

  const result = Array.from(byModule.entries()).map(([moduleName, moduleCards]) => {
    const avgEaseFactor = moduleCards.reduce((sum, c) => sum + c.ef, 0) / moduleCards.length
    const dueCount = moduleCards.filter(c => c.due_at <= now).length
    const weakestCards = [...moduleCards]
      .sort((a, b) => a.ef - b.ef)
      .slice(0, 3)
      .map(c => ({ front: c.front, easeFactor: Math.round(c.ef * 100) / 100 }))

    return {
      moduleId: moduleName,
      moduleName,
      avgEaseFactor: Math.round(avgEaseFactor * 100) / 100,
      dueCount,
      weakestCards,
    }
  })

  return result.sort((a, b) => a.avgEaseFactor - b.avgEaseFactor)
}
