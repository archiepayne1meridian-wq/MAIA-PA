import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { askWith } from '@/lib/claude'
import { getDb } from '@/db'
import { activity } from '@/db/schema'
import { getCall, updateCall, type CallOutcome, type CallStage } from '../../../../../../tools/apollo'
import { getTodayCallAngle } from '../../../../../../tools/hermes-db'
import { upsertPreference } from '@/lib/preferences'
import { extractJson } from '@/lib/format'

const SONNET = 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are analysing a cold call made by Archie Payne, BDA at deVere and Partners Switzerland.

Archie's goal on every call: book a meeting with Stephen Smith (Senior Wealth Manager).
deVere USP: cross-border financial planning for internationally mobile professionals in Switzerland.
Ideal client: British expats with financial ties back home.

ANALYSE THE CALL AND RETURN JSON:

{
  "coaching_insight": "One specific, actionable coaching point. What to do differently next time or what worked well. Max 2 sentences.",

  "stage_reached": "opener | fact_find | enlarge | disturb | close | completed",

  "filler_words": {
    "you_know": 0,
    "sort_of": 0,
    "basically": 0,
    "kind_of": 0,
    "obviously": 0
  },

  "winning_phrases": [
    "Exact phrase that landed well — only include if genuinely effective"
  ],

  "crm_notes": "Only populate if outcome is meeting_booked. Quick, concise notes Stephen can use. Include: what the meeting is about, key personal details (football fan, mentioned kids etc.), any asset values or financial situation mentioned, suggested talking points for Stephen. Max 150 words.",

  "confirmation_email": "Only populate if outcome is meeting_booked. Draft email confirming the meeting. Reference something specific from the call — a detail they mentioned, something they said. Warm but professional. From Archie.",

  "follow_up_notes": "Only populate if outcome is follow_up. Why worth keeping. When to call back based on what they said. Max 50 words.",

  "follow_up_date": "ISO date string if they gave a timeframe, computed relative to today's date given below. Null if not.",

  "drop_reason": "Only populate if outcome is drop. One sentence on why not worth the CRM space.",

  "prospect_quality": "high | medium | low — based on what was learned about their situation",

  "call_summary": "Two sentence summary of what happened on the call."
}

IMPORTANT:
- coaching_insight must be specific — not generic. Reference what actually happened on this call.
- winning_phrases only if genuinely effective. Empty array if none.
- crm_notes are for Stephen — include anything personal that helps build rapport.
- Never include the prospect's full surname anywhere.
- British English throughout.`

interface FillerWords {
  you_know: number
  sort_of: number
  basically: number
  kind_of: number
  obviously: number
}

interface AnalysisResult {
  coaching_insight: string
  stage_reached: CallStage
  filler_words: FillerWords
  winning_phrases: string[]
  crm_notes: string | null
  confirmation_email: string | null
  follow_up_notes: string | null
  follow_up_date: string | null
  drop_reason: string | null
  prospect_quality: 'high' | 'medium' | 'low'
  call_summary: string
}

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { callId, transcript: editedTranscript, prospectName, outcome } = await req.json().catch(() => ({})) as {
    callId?: string
    transcript?: string
    prospectName?: string
    outcome?: CallOutcome
  }
  if (!callId) {
    return NextResponse.json({ error: 'callId required' }, { status: 400 })
  }
  if (outcome !== 'booked' && outcome !== 'follow_up' && outcome !== 'drop') {
    return NextResponse.json({ error: 'outcome must be booked, follow_up, or drop' }, { status: 400 })
  }

  const call = await getCall(callId)
  if (!call || !call.transcript) {
    return NextResponse.json({ error: 'Call or transcript not found' }, { status: 404 })
  }

  const transcript = editedTranscript && editedTranscript.trim() ? editedTranscript : call.transcript
  const startMs = Date.now()

  try {
    const todayAngle = await getTodayCallAngle()
    const outcomeLabel = outcome === 'booked' ? 'meeting_booked' : outcome

    const userMessage = [
      `Today's date: ${new Date().toISOString().slice(0, 10)}`,
      `Call outcome: ${outcomeLabel}`,
      prospectName ? `Prospect name: ${prospectName}` : '',
      todayAngle ? `Today's call angle: ${todayAngle}` : '',
      '',
      'TRANSCRIPT:',
      transcript,
    ].filter(Boolean).join('\n')

    const raw = await askWith(SYSTEM_PROMPT, userMessage, 2000, SONNET)
    const result = JSON.parse(extractJson(raw)) as AnalysisResult

    await updateCall(callId, {
      transcript,
      prospect_name: prospectName ?? call.prospect_name,
      outcome,
      coaching_insight: result.coaching_insight,
      stage_reached: result.stage_reached,
      filler_words_json: JSON.stringify(result.filler_words),
      winning_phrases_json: JSON.stringify(result.winning_phrases ?? []),
      advisor_brief: result.crm_notes ?? null,       // repurposed field — see schema.ts
      client_email: result.confirmation_email ?? null, // repurposed field — see schema.ts
      follow_up_notes: result.follow_up_notes ?? null,
      follow_up_date: result.follow_up_date ?? null,
      drop_reason: result.drop_reason ?? null,
      prospect_quality: result.prospect_quality,
      call_summary: result.call_summary,
    })

    // Feed DIANA — today's focus + weak stage, read at the start of her next
    // session. Fire-and-forget; never blocks the response.
    void Promise.all([
      upsertPreference({ category: 'diana', rule_type: 'behaviour', rule_key: 'todays_focus', rule_value: result.coaching_insight, source: 'apollo' }),
      upsertPreference({ category: 'diana', rule_type: 'behaviour', rule_key: 'weak_stage', rule_value: result.stage_reached, source: 'apollo' }),
    ]).catch(err => console.error('[apollo] DIANA preference feed failed:', err))

    await getDb().insert(activity).values({
      id: crypto.randomUUID(),
      event_id: `apollo_analyse_${Date.now()}`,
      type: 'analyse',
      agent: 'APOLLO',
      input: callId,
      output: `analysed call — outcome=${outcome}, stage=${result.stage_reached}`,
      status: 'success',
      duration_ms: Date.now() - startMs,
      created_at: Math.floor(Date.now() / 1000),
    })

    return NextResponse.json({ callId, outcome, ...result })
  } catch (err) {
    console.error('[apollo] analysis failed:', err)
    await getDb().insert(activity).values({
      id: crypto.randomUUID(),
      event_id: `apollo_analyse_${Date.now()}`,
      type: 'analyse',
      agent: 'APOLLO',
      input: callId,
      output: err instanceof Error ? err.message : String(err),
      status: 'error',
      duration_ms: Date.now() - startMs,
      created_at: Math.floor(Date.now() / 1000),
    }).catch(() => {})
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
