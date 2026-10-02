// Not in the original route list — added so the confirmation-email card's
// "✓ Sent" button persists across reloads instead of being purely client-side.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { markEmailSent, getCall } from '../../../../../../tools/apollo'

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
  await markEmailSent(callId)
  return NextResponse.json({ ok: true })
}
