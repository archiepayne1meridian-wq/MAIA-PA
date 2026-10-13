import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { markReminderDone } from '../../../../../../tools/reminders'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: 'Invalid reminder id' }, { status: 400 })
  }
  const { done } = await req.json().catch(() => ({})) as { done?: boolean }
  await markReminderDone(numId, done ?? true)
  return NextResponse.json({ ok: true })
}
