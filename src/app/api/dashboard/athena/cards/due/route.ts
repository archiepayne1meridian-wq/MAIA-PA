// Web adapter — fetch next due flashcard.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDueCards, type Track } from '../../../../../../../tools/study-db'

export async function GET(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const track = (new URL(req.url).searchParams.get('track') as Track | null) ?? 'qualification'
  const due = await getDueCards(1, track)
  return NextResponse.json({ card: due[0] ?? null })
}
