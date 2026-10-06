// GET /api/dashboard/diana/context — right panel data: weak points, sessions
// this week, streak, last session. Shared with hub-context's 'practice' case
// (src/app/api/dashboard/hub-context/[agent]/route.ts) via buildPracticeContext.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getRecentSessions } from '../../../../../../tools/diana-db'
import { buildPracticeContext } from '@/lib/diana'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await getRecentSessions(100)
    const context = buildPracticeContext(rows)
    return NextResponse.json(context)
  } catch (err) {
    console.error('[diana/context] failed:', err)
    return NextResponse.json({ error: 'Failed to load context' }, { status: 500 })
  }
}
