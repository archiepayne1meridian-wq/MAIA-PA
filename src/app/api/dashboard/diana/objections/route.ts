import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { loadDianaConfig } from '@/lib/diana-handler'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const config = loadDianaConfig()
  return NextResponse.json({ objections: config.objections })
}
