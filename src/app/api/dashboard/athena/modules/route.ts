// Web adapter — list modules that have at least one unsuspended card.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getModulesWithCards } from '../../../../../../tools/study-db'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const modules = await getModulesWithCards()
  return NextResponse.json({ modules })
}
