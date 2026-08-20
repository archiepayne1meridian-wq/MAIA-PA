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
  type DianaSession,
} from '../../../../../../tools/diana-db'
import {
  pickRandomProfile,
  generateProspectName,
  getProfileDisplay,
  type ProspectProfileKey,
} from '@/lib/diana'

const WEB_USER = 'web'

function profileInfo(key: string | null, name: string | null) {
  if (!key || !name) return null
  return getProfileDisplay(key as ProspectProfileKey, name)
}

function serialise(s: DianaSession) {
  return {
    id: s.id,
    scenario: s.scenario,
    difficulty: s.difficulty,
    status: s.status,
    slackUser: s.slack_user,
    transcript: parseTranscript(s.transcript_json).map(t => ({ role: t.role, text: t.text })),
    profile: profileInfo(s.prospect_profile, s.prospect_name),
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

  // Randomly select one of the 4 deVere prospect profiles for this call, plus a
  // fresh random name — both stored on the session so every turn stays consistent.
  const profileKey = pickRandomProfile()
  const prospectName = generateProspectName()

  const session = await startSession({
    slackUser: WEB_USER,
    difficulty: body.difficulty,
    prospectProfile: profileKey,
    prospectName,
  })

  // DIANA never speaks first — the transcript starts empty. Archie opens the
  // call; her opening line (the profile's exact scripted line) is returned by
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
      profile: getProfileDisplay(profileKey, prospectName),
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
