// GET /api/dashboard/reminders/due — today's date-triggered referral nudges
// (the `reminders` table, not maia_reminders' persistent to-do list).

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDueReminders } from '../../../../../../tools/referral-reminders'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const today = new Date().toISOString().slice(0, 10)
  const reminders = await getDueReminders(today)
  return NextResponse.json({ reminders })
}
