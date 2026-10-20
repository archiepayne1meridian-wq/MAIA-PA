// PATCH /api/dashboard/reminders/due/[id] — dismiss one referral nudge.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { dismissReminder } from '../../../../../../../tools/referral-reminders'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  await dismissReminder(numId)
  return NextResponse.json({ ok: true })
}
