import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getAllTemplates } from '../../../../../../tools/mercury'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const templates = await getAllTemplates()
  return NextResponse.json({ templates })
}
