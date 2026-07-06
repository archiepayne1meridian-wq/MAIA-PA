import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getRecentDrafts } from '../../../../../tools/mercury'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const drafts = await getRecentDrafts(7)
  return NextResponse.json({ drafts })
}
