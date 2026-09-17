import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getRecentAnalyses } from '../../../../../../tools/oracle'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const analyses = await getRecentAnalyses(20)
  return NextResponse.json({ analyses })
}
