// Date-triggered home-screen nudges (the `reminders` table) — distinct from
// tools/reminders.ts's maia_reminders (a persistent to-do list). A row here
// is meant to surface on exactly remind_date and then disappear once
// dismissed. First (and currently only) producer: APOLLO's booked-debrief
// flow, once it captures a meeting_date (see src/lib/apollo-debrief.ts).

import { getDb } from '@/db'
import { reminders } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export interface ReferralReminder {
  id: number
  remind_date: string
  message: string
  prospect_id: string | null
  dismissed: number
  created_at: number
}

function dayBefore(isoDate: string): string | null {
  const d = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export async function insertReferralReminder(
  meetingDate: string,
  message: string,
  prospectId: string | null,
): Promise<void> {
  const remindDate = dayBefore(meetingDate)
  if (!remindDate) return
  await getDb().insert(reminders).values({ remind_date: remindDate, message, prospect_id: prospectId })
}

// Day-OF reminder — "Meeting today with X" — distinct from the day-before
// referral nudge above. Used by the Calls agent's "Set Reminder" button
// (src/app/api/dashboard/apollo/set-reminder/route.ts), remind_date is the
// meeting date itself, no offset.
export async function insertMeetingDayReminder(
  meetingDate: string,
  message: string,
  prospectId: string | null,
): Promise<void> {
  if (Number.isNaN(new Date(`${meetingDate}T00:00:00Z`).getTime())) return
  await getDb().insert(reminders).values({ remind_date: meetingDate, message, prospect_id: prospectId })
}

export async function getDueReminders(todayIso: string): Promise<ReferralReminder[]> {
  return getDb().select().from(reminders)
    .where(and(eq(reminders.remind_date, todayIso), eq(reminders.dismissed, 0)))
}

export async function dismissReminder(id: number): Promise<void> {
  await getDb().update(reminders).set({ dismissed: 1 }).where(eq(reminders.id, id))
}
