import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { setReminder, getCall } from '../../../../../../tools/apollo'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { callId, type, date } = await req.json().catch(() => ({})) as {
    callId?: string
    type?: 'show_up' | 'follow_up'
    date?: string | null
  }
  if (!callId || (type !== 'show_up' && type !== 'follow_up')) {
    return NextResponse.json({ error: 'callId and type (show_up|follow_up) are required' }, { status: 400 })
  }
  const call = await getCall(callId)
  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }
  await setReminder(callId, type, date ?? null)
  return NextResponse.json({ ok: true })
}
