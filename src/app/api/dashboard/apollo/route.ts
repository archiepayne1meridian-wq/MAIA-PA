import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getRecentCalls } from '../../../../../tools/apollo'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const calls = await getRecentCalls(10)
  return NextResponse.json({
    calls: calls.map(c => ({
      id: c.id,
      call_date: c.call_date,
      prospect_name: c.prospect_name,
      created_at: c.created_at,
    })),
  })
}
