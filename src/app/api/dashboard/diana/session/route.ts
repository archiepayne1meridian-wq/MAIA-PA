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
import { loadDianaConfig } from '@/lib/diana-handler'
import { PROSPECT_PROFILES, pickRandomProfile, type ProspectProfileKey } from '@/lib/diana'

const WEB_USER = 'web'

function profileInfo(key: string | null) {
  if (!key || !(key in PROSPECT_PROFILES)) return null
  const p = PROSPECT_PROFILES[key as ProspectProfileKey]
  return { key: p.key, name: p.name, description: p.description }
}

function serialise(s: DianaSession) {
  return {
    id: s.id,
    scenario: s.scenario,
    difficulty: s.difficulty,
    status: s.status,
    slackUser: s.slack_user,
    transcript: parseTranscript(s.transcript_json).map(t => ({ role: t.role, text: t.text })),
    profile: profileInfo(s.prospect_profile),
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
    mode?: 'text' | 'voice'
  }

  // Autonomous selection: pick a random objection when no scenario is provided
  let scenario = body.scenario
  if (!scenario) {
    const config = loadDianaConfig()
    if (config.objections.length > 0) {
      const pick = config.objections[Math.floor(Math.random() * config.objections.length)]
      scenario = pick.label
    }
  }

  // Randomly select one of the 4 deVere prospect profiles for this call.
  const profileKey = pickRandomProfile()
  const profile = PROSPECT_PROFILES[profileKey]

  const session = await startSession({
    slackUser: WEB_USER,
    scenario,
    difficulty: body.difficulty,
    prospectProfile: profileKey,
  })

  const openingLine = profile.openingLine
  await appendTurn(session.id, 'diana', openingLine)

  return NextResponse.json({
    session: {
      id: session.id,
      scenario: session.scenario,
      difficulty: session.difficulty,
      status: 'active',
      slackUser: WEB_USER,
      transcript: [{ role: 'diana', text: openingLine }],
      mode: body.mode ?? 'text',
      profile: { key: profile.key, name: profile.name, description: profile.description },
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
