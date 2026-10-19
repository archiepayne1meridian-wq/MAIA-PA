import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getOverviewStats } from '../../../../../../tools/map-db'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const overview = await getOverviewStats()
  return NextResponse.json(overview)
}
