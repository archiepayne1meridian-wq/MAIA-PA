// Web adapter for DIANA session management.
// Uses slack_user: 'web' to isolate web sessions from Slack sessions.
// Slack handler always uses the real Slack user ID (e.g. 'U024BE7LH') —
// getActiveSession('web') and getActiveSession('<slack_uid>') never collide.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import {
  startSession,
  getActiveSession,
  endSession,
  parseTranscript,
  getRecentGeneratedProspects,
  type DianaSession,
} from '../../../../../../tools/diana-db'
import { generateProspect, parseGeneratedProspect, prospectDisplay } from '@/lib/diana'

const WEB_USER = 'web'

function profileInfo(generatedProspectJson: string | null) {
  const prospect = parseGeneratedProspect(generatedProspectJson)
  return prospect ? prospectDisplay(prospect) : null
}

function serialise(s: DianaSession) {
  return {
    id: s.id,
    scenario: s.scenario,
    difficulty: s.difficulty,
    status: s.status,
    slackUser: s.slack_user,
    transcript: parseTranscript(s.transcript_json).map(t => ({ role: t.role, text: t.text })),
    profile: profileInfo(s.generated_prospect),
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
    difficulty?: 'warm' | 'neutral' | 'tough'
    mode?: 'text' | 'voice'
  }

  // One Haiku call generates a fresh, randomly-combined prospect for this call —
  // stored on the session as JSON so every turn (and scoring) reuses the same one.
  // Recent first names are fed back in so Haiku doesn't converge on the same
  // handful of names when asked to "pick randomly" with no real entropy source.
  let prospect
  try {
    const recentJson = await getRecentGeneratedProspects(WEB_USER, 8)
    const recentFirstNames = recentJson
      .map(j => parseGeneratedProspect(j)?.firstName)
      .filter((n): n is string => Boolean(n))
    prospect = await generateProspect(recentFirstNames)
  } catch (err) {
    console.error('[diana] generateProspect failed:', err)
    return NextResponse.json({ error: 'Could not generate a prospect — try again' }, { status: 500 })
  }

  const session = await startSession({
    slackUser: WEB_USER,
    difficulty: body.difficulty,
    generatedProspect: JSON.stringify(prospect),
  })

  // DIANA never speaks first — the transcript starts empty. Archie opens the
  // call; her opening line (from the generated prospect) is returned by
  // /message on the first adviser turn, not generated here.
  return NextResponse.json({
    session: {
      id: session.id,
      scenario: session.scenario,
      difficulty: session.difficulty,
      status: 'active',
      slackUser: WEB_USER,
      transcript: [],
      mode: body.mode ?? 'text',
      profile: prospectDisplay(prospect),
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
