// Web adapter for DIANA session management.
// Uses slack_user: 'web' to isolate web sessions from Slack sessions.
// Slack handler always uses the real Slack user ID (e.g. 'U024BE7LH') —
// getActiveSession('web') and getActiveSession('<slack_uid>') never collide.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import {
  startSession,
  appendTurn,
  getActiveSession,
  endSession,
  parseTranscript,
  type DianaSession,
} from '../../../../../../tools/diana-db'

const WEB_USER = 'web'
const OPENING_LINE = 'Hello?'

function serialise(s: DianaSession) {
  return {
    id: s.id,
    scenario: s.scenario,
    difficulty: s.difficulty,
    status: s.status,
    slackUser: s.slack_user,
    transcript: parseTranscript(s.transcript_json).map(t => ({ role: t.role, text: t.text })),
  }
}

// GET — return the current active web session (or null).
export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const session = await getActiveSession(WEB_USER)
  return NextResponse.json({ session: session ? serialise(session) : null })
}

// POST — start a new session. Ends any existing web session first (same as Slack flow).
export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as {
    scenario?: string
    difficulty?: 'warm' | 'neutral' | 'tough'
  }

  const session = await startSession({
    slackUser: WEB_USER,
    scenario: body.scenario,
    difficulty: body.difficulty,
  })

  // Matches the Slack start sequence exactly: deterministic opening, no Claude call.
  await appendTurn(session.id, 'diana', OPENING_LINE)

  return NextResponse.json({
    session: {
      id: session.id,
      scenario: session.scenario,
      difficulty: session.difficulty,
      status: 'active',
      slackUser: WEB_USER,
      transcript: [{ role: 'diana', text: OPENING_LINE }],
    },
  })
}

// DELETE — force-end the web session without feedback (reset).
export async function DELETE() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const session = await getActiveSession(WEB_USER)
  if (session) await endSession(session.id)
  return NextResponse.json({ ok: true })
}
