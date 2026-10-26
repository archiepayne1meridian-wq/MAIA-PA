// POST /api/dashboard/meetings/structure — { transcript } -> structured
// MeetingNotes JSON, persisted as a new meeting_sessions row (the start of
// this upload's own isolated chat thread — see tools/meetings-db.ts). Runs
// automatically right after transcription, client-side.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { structureMeetingNotes } from '@/lib/meetings'
import { createMeetingSession } from '../../../../../../tools/meetings-db'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { transcript } = await req.json().catch(() => ({})) as { transcript?: string }
  if (!transcript?.trim()) {
    return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
  }

  try {
    const notes = await structureMeetingNotes(transcript)
    const sessionId = await createMeetingSession(transcript, notes)
    return NextResponse.json({ sessionId, notes })
  } catch (err) {
    console.error('[meetings/structure] failed:', err)
    const message = err instanceof Error ? err.message : 'Structuring failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
