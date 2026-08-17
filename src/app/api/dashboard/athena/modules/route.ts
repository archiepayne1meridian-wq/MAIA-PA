// Web adapter — list modules that have at least one unsuspended card.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getModulesWithCards, type Track } from '../../../../../../tools/study-db'

export async function GET(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const track = (new URL(req.url).searchParams.get('track') as Track | null) ?? 'qualification'
  const modules = await getModulesWithCards(track)
  return NextResponse.json({ modules })
}
