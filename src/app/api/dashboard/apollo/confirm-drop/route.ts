// Confirms removing a prospect from CRM after a "drop" outcome — Archie must
// explicitly confirm here before anything is marked dropped. Never automatic.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { confirmDrop, getCall } from '../../../../../../tools/apollo'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { callId } = await req.json().catch(() => ({})) as { callId?: string }
  if (!callId) {
    return NextResponse.json({ error: 'callId required' }, { status: 400 })
  }
  const call = await getCall(callId)
  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }
  await confirmDrop(callId)
  return NextResponse.json({ ok: true })
}
