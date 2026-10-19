// POST /api/dashboard/apollo/chat — debrief chat, scoped to one call.
// Body: { callId: string, message: string }

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { chatWithApolloDebrief, updateCoachingProfile, extractBookingFields, needsMapFields } from '@/lib/apollo-debrief'
import { getCall, updateCall } from '../../../../../../tools/apollo'
import {
  getDebriefMessages, saveDebriefMessage, countDebriefMessages,
  getCoachingProfile, saveCoachingProfile,
} from '../../../../../../tools/apollo-debrief'

// After this many exchanges, fold the debrief into the coaching profile —
// fire-and-forget, never blocks the reply. "Exchanges" = user turns, so this
// fires once after the 3rd thing Archie says in this debrief.
const PROFILE_UPDATE_AFTER_TURNS = 3

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const callId = req.nextUrl.searchParams.get('callId')
  if (!callId) {
    return NextResponse.json({ error: 'callId is required' }, { status: 400 })
  }
  const messages = await getDebriefMessages(callId, 50)
  return NextResponse.json({ messages })
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { callId, message } = await req.json().catch(() => ({})) as { callId?: string; message?: string }
  if (!callId || !message?.trim()) {
    return NextResponse.json({ error: 'callId and message are required' }, { status: 400 })
  }

  const call = await getCall(callId)
  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  try {
    await saveDebriefMessage(callId, 'user', message.trim())

    const [recent, profile] = await Promise.all([getDebriefMessages(callId, 20), getCoachingProfile()])
    const history = recent.map(m => ({ role: m.role, content: m.content }))

    const reply = await chatWithApolloDebrief(call, profile, history)
    await saveDebriefMessage(callId, 'assistant', reply)

    const userTurns = history.filter(m => m.role === 'user').length
    if (userTurns > 0 && userTurns % PROFILE_UPDATE_AFTER_TURNS === 0) {
      void (async () => {
        const fullHistory = await getDebriefMessages(callId, 50)
        const updated = await updateCoachingProfile(profile, fullHistory, call.call_summary)
        await saveCoachingProfile(updated)
      })().catch(err => console.error('[apollo/chat] background profile update failed:', err))
    }

    // Booked debriefs weave in three questions feeding MAP (lead source,
    // nationality, company/office) — extract after every exchange until
    // all three are captured, then stop (avoids re-running the extraction
    // call once there's nothing left to find).
    if (call.outcome === 'booked' && needsMapFields(call)) {
      void (async () => {
        const fullHistory = await getDebriefMessages(callId, 50)
        const extracted = await extractBookingFields(fullHistory)
        await updateCall(callId, {
          company_name: extracted.company_name ?? call.company_name,
          prospect_nationality: extracted.prospect_nationality ?? call.prospect_nationality,
          lead_source: extracted.lead_source ?? call.lead_source,
          rapport_notes: extracted.rapport_notes ?? call.rapport_notes,
        })
      })().catch(err => console.error('[apollo/chat] background map-fields extraction failed:', err))
    }

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[apollo/chat] failed:', err)
    const msg = err instanceof Error ? err.message : 'Debrief failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
