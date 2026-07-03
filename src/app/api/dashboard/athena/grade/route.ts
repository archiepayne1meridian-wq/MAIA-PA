// Web adapter — grade a flashcard (SM2). Calls applyReview then fetches the next due card.
// Fully deterministic — no Claude calls.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { applyReview, getDueCards, type Grade } from '../../../../../../tools/study-db'

const VALID_GRADES: Grade[] = ['again', 'hard', 'good', 'easy']

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { cardId, grade } = await req.json().catch(() => ({})) as { cardId?: string; grade?: string }
  if (!cardId) return NextResponse.json({ error: 'cardId required' }, { status: 400 })
  if (!grade || !(VALID_GRADES as string[]).includes(grade)) {
    return NextResponse.json({ error: 'grade must be again | hard | good | easy' }, { status: 400 })
  }

  const { intervalDays } = await applyReview(cardId, grade as Grade)

  const due = await getDueCards(1)
  return NextResponse.json({ intervalDays, nextCard: due[0] ?? null })
}
