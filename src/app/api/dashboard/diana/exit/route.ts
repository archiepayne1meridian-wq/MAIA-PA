// Web adapter for ending a DIANA session and generating feedback.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import {
  getActiveSession,
  endSession,
  parseTranscript,
} from '../../../../../../tools/diana-db'
import { roleplayFeedback } from '@/lib/diana'
import { loadDianaConfig } from '@/lib/diana-handler'

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

  const config = loadDianaConfig()
  const feedback = adviserTurns === 0
    ? 'No exchanges to score — start a session and say a few things first.'
    : await roleplayFeedback(transcript, config.rubric)

  return NextResponse.json({ feedback, turns: adviserTurns })
}
