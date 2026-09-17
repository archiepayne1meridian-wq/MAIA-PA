// Web adapter — fetch next due flashcard.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDueCards, type Track, type Exam } from '../../../../../../../tools/study-db'

export async function GET(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const track = (url.searchParams.get('track') as Track | null) ?? 'qualification'
  const exam = (url.searchParams.get('exam') as Exam | null) ?? undefined
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? (parseInt(limitParam, 10) || 1) : 1

  const due = await getDueCards(limit, track, exam)
  return NextResponse.json({ card: due[0] ?? null, cards: due })
}
