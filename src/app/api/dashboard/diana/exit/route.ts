// Web adapter for ending a DIANA session and generating the 7-stage deVere scorecard.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import {
  getActiveSession,
  endSession,
  parseTranscript,
} from '../../../../../../tools/diana-db'
import { scoreCall, type ProspectProfileKey } from '@/lib/diana'

const WEB_USER = 'web'

export async function POST() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const session = await getActiveSession(WEB_USER)
  if (!session) {
    return NextResponse.json({ error: 'No active session' }, { status: 404 })
  }

  await endSession(session.id)

  const transcript = parseTranscript(session.transcript_json)
  const adviserTurns = transcript.filter(t => t.role === 'user').length

  if (adviserTurns === 0) {
    return NextResponse.json({
      score: null,
      turns: 0,
      note: 'No exchanges to score — start a session and say a few things first.',
    })
  }

  const score = await scoreCall(transcript, session.prospect_profile as ProspectProfileKey | null)

  return NextResponse.json({ score, turns: adviserTurns })
}
