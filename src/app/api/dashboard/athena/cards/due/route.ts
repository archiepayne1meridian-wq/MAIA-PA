// Web adapter — fetch next due flashcard.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDueCards } from '../../../../../../../tools/study-db'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const due = await getDueCards(1)
  return NextResponse.json({ card: due[0] ?? null })
}
