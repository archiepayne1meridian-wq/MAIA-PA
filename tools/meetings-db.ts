// MEETINGS — pure DB functions. Isolated storage, deliberately: no table
// here is shared with APOLLO's apollo_calls/apollo_debrief_messages or any
// other agent's chat history — a meeting session's chat is its own thread,
// scoped by session_id, from upload to upload.

import { getDb } from '@/db'
import { meeting_sessions, meeting_debrief_messages } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import type { MeetingNotes } from '@/lib/meetings'

export interface MeetingSession {
  id: string
  transcript: string
  notes: MeetingNotes | null
}

export async function createMeetingSession(transcript: string, notes: MeetingNotes): Promise<string> {
  const id = crypto.randomUUID()
  await getDb().insert(meeting_sessions).values({
    id,
    transcript,
    notes_json: JSON.stringify(notes),
  })
  return id
}

export async function getMeetingSession(id: string): Promise<MeetingSession | null> {
  const [row] = await getDb().select().from(meeting_sessions).where(eq(meeting_sessions.id, id)).limit(1)
  if (!row) return null
  let notes: MeetingNotes | null = null
  if (row.notes_json) {
    try { notes = JSON.parse(row.notes_json) as MeetingNotes } catch { notes = null }
  }
  return { id: row.id, transcript: row.transcript, notes }
}

export async function updateMeetingSessionNotes(id: string, notes: MeetingNotes): Promise<void> {
  await getDb().update(meeting_sessions)
    .set({ notes_json: JSON.stringify(notes), updated_at: Math.floor(Date.now() / 1000) })
    .where(eq(meeting_sessions.id, id))
}

export interface MeetingDebriefMessage { role: 'user' | 'assistant'; content: string }

export async function getMeetingMessages(sessionId: string, limit = 50): Promise<MeetingDebriefMessage[]> {
  const rows = await getDb().select().from(meeting_debrief_messages)
    .where(eq(meeting_debrief_messages.session_id, sessionId))
    .orderBy(asc(meeting_debrief_messages.created_at))
    .limit(limit)
  return rows.map(r => ({ role: r.role as 'user' | 'assistant', content: r.content }))
}

export async function saveMeetingMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  await getDb().insert(meeting_debrief_messages).values({
    id: crypto.randomUUID(), session_id: sessionId, role, content,
  })
}
