import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { buildDashboardData } from '@/app/dashboard/data'
import { buildGreeting } from '@/lib/maia-voice'

export async function POST() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const data = await buildDashboardData()
    const spokenResponse = await buildGreeting(data)
    return NextResponse.json({ spokenResponse })
  } catch (err) {
    console.error('[maia/greeting] error', err)
    return NextResponse.json({ error: 'Failed to generate greeting' }, { status: 500 })
  }
}
