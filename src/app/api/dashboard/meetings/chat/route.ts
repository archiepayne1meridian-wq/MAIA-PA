// POST /api/dashboard/meetings/chat — { notes, history, message } -> edits
// the structured notes in place, returning the updated notes plus a short
// confirmation reply. Fully stateless server-side — the client resends the
// current notes + full chat history on every turn (see src/lib/meetings.ts).

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { refineMeetingNotes, type MeetingNotes, type RefineTurn } from '@/lib/meetings'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { notes, history, message } = await req.json().catch(() => ({})) as {
    notes?: MeetingNotes; history?: RefineTurn[]; message?: string
  }
  if (!notes || !message?.trim()) {
    return NextResponse.json({ error: 'notes and message are required' }, { status: 400 })
  }

  try {
    const result = await refineMeetingNotes(notes, history ?? [], message.trim())
    return NextResponse.json(result)
  } catch (err) {
    console.error('[meetings/chat] failed:', err)
    const msg = err instanceof Error ? err.message : 'Refinement failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
