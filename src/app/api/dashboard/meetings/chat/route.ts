// POST /api/dashboard/meetings/chat — { sessionId, message } -> edits this
// session's structured notes in place, returning the updated notes plus a
// short confirmation reply.
//
// Isolated memory: history is loaded from meeting_debrief_messages, scoped
// by session_id — a table of its own, never apollo_debrief_messages or any
// other agent's chat store. Nothing here reads or writes another agent's
// conversation.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { refineMeetingNotes } from '@/lib/meetings'
import { getMeetingSession, getMeetingMessages, saveMeetingMessage, updateMeetingSessionNotes } from '../../../../../../tools/meetings-db'

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  }
  const messages = await getMeetingMessages(sessionId, 50)
  return NextResponse.json({ messages })
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { sessionId, message } = await req.json().catch(() => ({})) as { sessionId?: string; message?: string }
  if (!sessionId || !message?.trim()) {
    return NextResponse.json({ error: 'sessionId and message are required' }, { status: 400 })
  }

  const session = await getMeetingSession(sessionId)
  if (!session || !session.notes) {
    return NextResponse.json({ error: 'Meeting session not found' }, { status: 404 })
  }

  try {
    const priorHistory = await getMeetingMessages(sessionId, 50)
    await saveMeetingMessage(sessionId, 'user', message.trim())

    const result = await refineMeetingNotes(session.transcript, session.notes, priorHistory, message.trim())
    await updateMeetingSessionNotes(sessionId, result.notes)
    await saveMeetingMessage(sessionId, 'assistant', result.reply)

    return NextResponse.json(result)
  } catch (err) {
    console.error('[meetings/chat] failed:', err)
    const msg = err instanceof Error ? err.message : 'Refinement failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
