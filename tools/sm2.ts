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
