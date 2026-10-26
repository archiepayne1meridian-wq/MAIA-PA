// POST /api/dashboard/apollo/set-reminder — "Set Reminder" button on a call
// card. Writes a day-of nudge to the global `reminders` table (shown on the
// home screen on remind_date) — booked calls use meeting_date, follow_up
// calls use follow_up_date. reminder_set/reminder_type/reminder_date on the
// call row itself are kept only as the "already set" flag driving the
// button's disabled state, same column the old show-up/follow-up flow used.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { setReminder, getCall } from '../../../../../../tools/apollo'
import { insertMeetingDayReminder } from '../../../../../../tools/referral-reminders'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { callId } = await req.json().catch(() => ({})) as { callId?: string }
  if (!callId) {
    return NextResponse.json({ error: 'callId is required' }, { status: 400 })
  }

  const call = await getCall(callId)
  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  const date = call.outcome === 'booked' ? call.meeting_date : call.follow_up_date
  if (!date) {
    return NextResponse.json({ error: 'No date available for this call yet' }, { status: 400 })
  }

  const who = call.prospect_name ?? 'the prospect'
  const message = call.outcome === 'booked'
    ? `Meeting today with ${who}${call.company_name ? ` — ${call.company_name}` : ''}.`
    : `Follow up today with ${who}.`

  await insertMeetingDayReminder(date, message, call.linked_prospect_id)
  await setReminder(callId, call.outcome === 'booked' ? 'show_up' : 'follow_up', date)
  return NextResponse.json({ ok: true })
}
