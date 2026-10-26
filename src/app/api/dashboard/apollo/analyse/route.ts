import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { askWith } from '@/lib/claude'
import { getDb } from '@/db'
import { activity } from '@/db/schema'
import { getCall, updateCall, type CallStage } from '../../../../../../tools/apollo'
import { getTodayCallAngle } from '../../../../../../tools/hermes-db'
import { upsertPreference } from '@/lib/preferences'
import { extractJson } from '@/lib/format'
import { insertMeetingDayReminder } from '../../../../../../tools/referral-reminders'
import { suggestProspectMatches, type ProspectMatchCandidate } from '@/lib/apollo-prospect-match'

// This agent needs the strongest reasoning — real sales conversations,
// coaching judgement, and now self-classifying the outcome too.
const OPUS = 'claude-opus-5-5'

const SYSTEM_PROMPT = `You are analysing a cold call made by Archie Payne, BDA at deVere and Partners Switzerland.

Archie's goal on every call: book a meeting with Stephen Smith (Senior Wealth Manager).
deVere USP: cross-border financial planning for internationally mobile professionals in Switzerland.
Ideal client: British expats with financial ties back home.

First, classify the call outcome from the transcript itself:
- "booked" — the prospect agreed to a specific future meeting (a date/time was discussed and agreed, even loosely — "how about Tuesday" / "yes that works")
- "follow_up" — not booked, but worth keeping in the CRM (genuine interest, asked to be called back, objection that could be worked)
- "drop" — not booked and not worth keeping (no interest, wrong fit, asked not to be contacted)

ANALYSE THE CALL AND RETURN JSON:

{
  "outcome": "booked | follow_up | drop",

  "prospect_name": "First name + last initial only, as stated or inferred from the transcript, e.g. 'John S.' — never a full surname. Null if genuinely not mentioned.",

  "company_name": "The prospect's employer, if mentioned anywhere in the call. Null if not mentioned.",

  "meeting_date": "Only if outcome is booked. The agreed meeting date as YYYY-MM-DD, resolved against today's date given below (e.g. 'next Tuesday' -> an actual date). Null if no specific date was agreed, even if booked.",

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

  "crm_notes": "Only populate if outcome is booked. Quick, concise notes Stephen can use. Include: what the meeting is about, key personal details (football fan, mentioned kids etc.), any asset values or financial situation mentioned, suggested talking points for Stephen. Max 150 words.",

  "confirmation_email": "Only populate if outcome is booked. Draft email confirming the meeting. Reference something specific from the call — a detail they mentioned, something they said. Warm but professional. From Archie.",

  "follow_up_notes": "Only populate if outcome is follow_up. Why worth keeping. When to call back based on what they said. Max 50 words.",

  "follow_up_date": "ISO date string if they gave a timeframe, computed relative to today's date given below. Null if not.",

  "drop_reason": "Only populate if outcome is drop. One sentence on why not worth the CRM space.",

  "prospect_quality": "high | medium | low — based on what was learned about their situation",

  "call_summary": "Two sentence summary of what happened on the call.",

  "objections_raised": "Only populate if outcome is follow_up or drop (not booked). Array of the specific objections the prospect actually raised, in their own words or close to it. Empty array if none.",

  "tone_notes": "Only populate if outcome is follow_up or drop. One or two sentences on the prospect's tone/engagement — guarded, rushed, warm but non-committal, etc. Specific to this call, not generic.",

  "what_resonated": "Only populate if outcome is follow_up or drop. One or two sentences on what — if anything — the prospect responded well to before the call lost momentum. Null if genuinely nothing landed."
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

type Outcome = 'booked' | 'follow_up' | 'drop'

interface AnalysisResult {
  outcome: Outcome
  prospect_name: string | null
  company_name: string | null
  meeting_date: string | null
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
  objections_raised: string[] | null
  tone_notes: string | null
  what_resonated: string | null
}

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { callId, transcript: editedTranscript } = await req.json().catch(() => ({})) as {
    callId?: string
    transcript?: string
  }
  if (!callId) {
    return NextResponse.json({ error: 'callId required' }, { status: 400 })
  }

  const call = await getCall(callId)
  if (!call || !call.transcript) {
    return NextResponse.json({ error: 'Call or transcript not found' }, { status: 404 })
  }

  const transcript = editedTranscript && editedTranscript.trim() ? editedTranscript : call.transcript
  const startMs = Date.now()

  try {
    const todayAngle = await getTodayCallAngle()
    const today = new Date().toISOString().slice(0, 10)

    const userMessage = [
      `Today's date: ${today}`,
      todayAngle ? `Today's call angle: ${todayAngle}` : '',
      '',
      'TRANSCRIPT:',
      transcript,
    ].filter(Boolean).join('\n')

    const raw = await askWith(SYSTEM_PROMPT, userMessage, 8192, OPUS)
    const result = JSON.parse(extractJson(raw)) as AnalysisResult

    await updateCall(callId, {
      transcript,
      prospect_name: result.prospect_name ?? call.prospect_name,
      company_name: result.company_name ?? call.company_name,
      meeting_date: result.meeting_date ?? call.meeting_date,
      outcome: result.outcome,
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
      objections_raised_json: result.objections_raised ? JSON.stringify(result.objections_raised) : null,
      tone_notes: result.tone_notes ?? null,
      what_resonated: result.what_resonated ?? null,
    })

    // Feed DIANA — today's focus + weak stage, read at the start of her next
    // session. Fire-and-forget; never blocks the response.
    void Promise.all([
      upsertPreference({ category: 'diana', rule_type: 'behaviour', rule_key: 'todays_focus', rule_value: result.coaching_insight, source: 'apollo' }),
      upsertPreference({ category: 'diana', rule_type: 'behaviour', rule_key: 'weak_stage', rule_value: result.stage_reached, source: 'apollo' }),
    ]).catch(err => console.error('[apollo] DIANA preference feed failed:', err))

    let prospectMatches: ProspectMatchCandidate[] = []
    if (result.outcome === 'booked') {
      const who = result.prospect_name ?? call.prospect_name
      const where = result.company_name ?? call.company_name

      if (result.meeting_date && result.meeting_date !== call.meeting_date) {
        const message = `Meeting today with ${who ?? 'the prospect'}${where ? ` — ${where}` : ''}.`
        await insertMeetingDayReminder(result.meeting_date, message, null).catch(err =>
          console.error('[apollo] insertMeetingDayReminder failed:', err))
      }

      if (!call.linked_prospect_id) {
        prospectMatches = await suggestProspectMatches(who).catch(err => {
          console.error('[apollo] suggestProspectMatches failed:', err)
          return []
        })
      }
    }

    await getDb().insert(activity).values({
      id: crypto.randomUUID(),
      event_id: `apollo_analyse_${Date.now()}`,
      type: 'analyse',
      agent: 'APOLLO',
      input: callId,
      output: `analysed call — outcome=${result.outcome}, stage=${result.stage_reached}`,
      status: 'success',
      duration_ms: Date.now() - startMs,
      created_at: Math.floor(Date.now() / 1000),
    })

    return NextResponse.json({ callId, ...result, prospectMatches })
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
