// Web adapter for DIANA roleplay turns.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import {
  getActiveSession,
  appendTurn,
  parseTranscript,
} from '../../../../../../tools/diana-db'
import { roleplayTurn, getProfileOpeningLine, type ProspectProfileKey } from '@/lib/diana'

const WEB_USER = 'web'

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

  // Capture transcript BEFORE appending the user's message.
  // Mirrors the Slack handler: roleplayTurn receives history, then the new adviser line.
  const _existingTranscript = parseTranscript(session.transcript_json)
  await appendTurn(session.id, 'user', text.trim())

  // DIANA never speaks first. Archie's very first line of the call gets the
  // profile's exact scripted opening line — deterministic, no Claude call —
  // exactly like the legacy Slack roleplay's deterministic "Hello?" opener.
  // Every turn after that is a real Claude reply.
  let reply: string
  if (_existingTranscript.length === 0 && session.prospect_profile) {
    reply = getProfileOpeningLine(session.prospect_profile as ProspectProfileKey)
  } else {
    reply = await roleplayTurn(
      _existingTranscript,
      text.trim(),
      session.scenario,
      (session.difficulty as 'warm' | 'neutral' | 'tough') || 'neutral',
      mode === 'voice',
      session.prospect_profile as ProspectProfileKey | null,
      session.prospect_name,
    )
  }

  await appendTurn(session.id, 'diana', reply)
  return NextResponse.json({ reply })
}
