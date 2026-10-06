// Web adapter for DIANA roleplay turns. Returns the prospect's reply as text
// + Simon TTS audio bundled together, plus the silently-tracked call stage
// and whether the session just ended (goodbye said, or the prospect
// themselves said goodbye) — see src/lib/diana.ts's inferCallStage/
// detectGoodbye/detectMeetingBooked.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import {
  getActiveSession,
  appendTurn,
  parseTranscript,
} from '../../../../../../tools/diana-db'
import {
  roleplayTurn, parseGeneratedProspect, inferCallStage,
  detectGoodbye, detectMeetingBooked,
} from '@/lib/diana'
import { textToSpeechBase64 } from '@/lib/elevenlabs'

const WEB_USER = 'web'
const SIMON_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? 'Ln7FbpLNuLn2OdYq2w7S'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { text, mode } = await req.json().catch(() => ({})) as { text?: string; mode?: 'text' | 'voice' }
  if (!text?.trim()) {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }

  const session = await getActiveSession(WEB_USER)
  if (!session) {
    return NextResponse.json({ error: 'No active session — start one first' }, { status: 404 })
  }

  // Capture transcript BEFORE appending the user's message — roleplayTurn
  // receives history, then the new adviser line.
  const existingTranscript = parseTranscript(session.transcript_json)
  await appendTurn(session.id, 'user', text.trim())

  // DIANA never speaks first on legacy (/session-started) sessions — the very
  // first adviser turn there gets the generated prospect's exact opening line
  // deterministically. /start-created sessions already have the opening line
  // in history, so this branch is a no-op for them.
  const prospect = parseGeneratedProspect(session.generated_prospect)
  let reply: string
  if (existingTranscript.length === 0 && prospect) {
    reply = prospect.openingLine
  } else {
    reply = await roleplayTurn(
      existingTranscript,
      text.trim(),
      session.scenario,
      (session.difficulty as 'warm' | 'neutral' | 'tough') || 'neutral',
      mode === 'voice',
      session.generated_prospect,
    )
  }

  const updatedTranscript = await appendTurn(session.id, 'diana', reply)

  const archieSaidGoodbye = detectGoodbye(text)
  const prospectSaidGoodbye = detectGoodbye(reply)
  const goodbyeSaid = archieSaidGoodbye || prospectSaidGoodbye
  const meetingBooked = updatedTranscript.some(t => t.role === 'diana' && detectMeetingBooked(t.text))
  const stage = inferCallStage(updatedTranscript, meetingBooked, goodbyeSaid)

  const audio = await textToSpeechBase64(reply, SIMON_VOICE_ID)

  return NextResponse.json({
    text: reply,
    audio,
    stage,
    session_ended: goodbyeSaid,
  })
}
