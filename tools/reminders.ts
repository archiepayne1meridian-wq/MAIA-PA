// Pure DB functions for maia_reminders — the home page to-do list. No Claude calls.

import { eq, asc } from 'drizzle-orm'
import { getDb } from '@/db'
import { maia_reminders } from '@/db/schema'

export interface Reminder {
  id: number
  text: string
  done: number
  due_date: string | null
  created_at: number
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function isToday(createdAt: number): boolean {
  return new Date(createdAt * 1000).toISOString().slice(0, 10) === todayDateString()
}

// "Today's + undone" per spec — undone reminders stick around regardless of
// age (nothing gets lost), but a done one only shows for the rest of the day
// it was completed on, then disappears for good rather than piling up.
export async function getReminders(): Promise<Reminder[]> {
  const rows = await getDb()
    .select()
    .from(maia_reminders)
    .orderBy(asc(maia_reminders.done), asc(maia_reminders.created_at))
  return (rows as Reminder[]).filter(r => r.done === 0 || isToday(r.created_at))
}

export async function addReminder(text: string, dueDate?: string | null): Promise<Reminder> {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const [row] = await db.insert(maia_reminders).values({
    text,
    done: 0,
    due_date: dueDate ?? null,
    created_at: now,
  }).returning()
  return row as Reminder
}

export async function markReminderDone(id: number, done = true): Promise<void> {
  await getDb().update(maia_reminders)
    .set({ done: done ? 1 : 0 })
    .where(eq(maia_reminders.id, id))
}
