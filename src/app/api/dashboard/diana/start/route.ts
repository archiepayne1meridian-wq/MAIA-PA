// POST /api/dashboard/diana/start — generate a fresh hidden prospect profile,
// begin the session, and return the prospect's opening line (text + Simon TTS
// audio) bundled together so the client can play it immediately. Mirrors
// POST /api/dashboard/diana/session's prospect-generation logic — kept
// separate rather than refactored into a shared helper (small, orchestration-
// only, and each route's own boundary — Claude-facing vs pure DB — stays clean).

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import {
  startSession,
  appendTurn,
  getRecentGeneratedProspects,
  getTodayAngle,
} from '../../../../../../tools/diana-db'
import { generateProspect, parseGeneratedProspect, prospectDisplay } from '@/lib/diana'
import { textToSpeechBase64 } from '@/lib/elevenlabs'

const WEB_USER = 'web'
const SIMON_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? 'Ln7FbpLNuLn2OdYq2w7S'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { difficulty?: 'warm' | 'neutral' | 'tough' }

  let prospect
  try {
    const recentJson = await getRecentGeneratedProspects(WEB_USER, 8)
    const recentFirstNames = recentJson
      .map(j => parseGeneratedProspect(j)?.firstName)
      .filter((n): n is string => Boolean(n))
    const todayAngle = await getTodayAngle()
    prospect = await generateProspect(recentFirstNames, todayAngle)
  } catch (err) {
    console.error('[diana/start] generateProspect failed:', err)
    return NextResponse.json({ error: 'Could not generate a prospect — try again' }, { status: 500 })
  }

  const session = await startSession({
    slackUser: WEB_USER,
    difficulty: body.difficulty,
    generatedProspect: JSON.stringify(prospect),
  })

  // The prospect "picks up" immediately, before Archie says a word — append
  // the opening line now so /message's history already includes it by the
  // time Archie's first turn arrives.
  await appendTurn(session.id, 'diana', prospect.openingLine)

  const audio = await textToSpeechBase64(prospect.openingLine, SIMON_VOICE_ID)

  return NextResponse.json({
    session: {
      id: session.id,
      difficulty: session.difficulty,
      status: 'active',
      profile: prospectDisplay(prospect),
    },
    openingLine: prospect.openingLine,
    audio,
  })
}
