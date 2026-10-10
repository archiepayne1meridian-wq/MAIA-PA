import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { listSessions, createSession, type AthenaTab } from '../../../../../../tools/athena-db'

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const limitParam = Number(searchParams.get('limit') ?? '20')
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20

  try {
    const sessions = await listSessions(limit)
    return NextResponse.json({ sessions })
  } catch (err) {
    console.error('[athena/sessions] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as { tab?: AthenaTab }
  const tab: AthenaTab = body.tab === 'product' ? 'product' : 'r01'

  try {
    const id = await createSession(tab)
    return NextResponse.json({ id })
  } catch (err) {
    console.error('[athena/sessions] POST failed:', err)
    return NextResponse.json({ error: 'Failed to start session' }, { status: 500 })
  }
}
