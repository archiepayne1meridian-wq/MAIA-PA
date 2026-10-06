// POST /api/dashboard/diana/end — end the session, score the call, generate
// the narrative review, store weak points for tomorrow's focus, and return
// Ava's spoken readout alongside the scorecard for the thread.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import {
  getActiveSession,
  endSession,
  setSessionScore,
  setSessionReview,
  parseTranscript,
} from '../../../../../../tools/diana-db'
import { scoreCall, generateSessionReview, buildSpokenReview, inferCallStage, stageDisplayLabel, detectMeetingBooked } from '@/lib/diana'
import { upsertPreference } from '@/lib/preferences'
import { textToSpeechBase64 } from '@/lib/elevenlabs'

const WEB_USER = 'web'
const AVA_VOICE_ID = process.env.ELEVENLABS_AVA_VOICE_ID ?? 'wCizWKvnaS3LOIUwHo98'

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
      review: null,
      turns: 0,
      note: 'No exchanges to score — start a session and say a few things first.',
    })
  }

  const meetingBooked = transcript.some(t => t.role === 'diana' && detectMeetingBooked(t.text))
  const outcome: 'completed' | 'lost' = meetingBooked ? 'completed' : 'lost'
  // Ladder position ignoring the terminal override — "how far did the call
  // actually get" rather than just "completed"/"lost".
  const stage = inferCallStage(transcript, false, false)
  const stageLabel = stageDisplayLabel(stage)

  const score = await scoreCall(transcript, session.generated_prospect)
  const review = await generateSessionReview(transcript, score)

  await setSessionScore(session.id, score.total)
  await setSessionReview(session.id, JSON.stringify({
    stages: score.stages,
    deductions: score.deductions,
    knowledgeEvents: score.knowledgeEvents,
    total: score.total,
    maxTotal: score.maxTotal,
    stageReached: stageLabel,
    outcome,
    whatWorked: review.whatWorked,
    whatToImprove: review.whatToImprove,
    focusNext: review.focusNext,
  }))

  // Feeds tomorrow's TODAY'S FOCUS card — same preference keys APOLLO writes
  // after a real call, so either source updates the same focus.
  await Promise.all([
    upsertPreference({ category: 'diana', rule_type: 'behaviour', rule_key: 'todays_focus', rule_value: review.focusNext, source: 'diana' }),
    upsertPreference({ category: 'diana', rule_type: 'behaviour', rule_key: 'weak_stage', rule_value: stage, source: 'diana' }),
  ])

  const spokenReview = buildSpokenReview(review, stageLabel)
  const audio = await textToSpeechBase64(spokenReview, AVA_VOICE_ID)

  return NextResponse.json({
    score,
    review,
    stageReached: stageLabel,
    outcome,
    turns: adviserTurns,
    spokenReview,
    audio,
  })
}
