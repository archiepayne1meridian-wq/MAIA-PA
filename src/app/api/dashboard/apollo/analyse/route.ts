import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { askWith } from '@/lib/claude'
import { getDb } from '@/db'
import { activity } from '@/db/schema'
import { getCall, updateCall } from '../../../../../../tools/apollo'

const OPUS = 'claude-opus-4-6'

const APOLLO_EXTRACT_SYSTEM = `You are APOLLO, an intelligence extraction agent for a financial adviser
at deVere Group. Analyse this prospect call transcript and extract every
useful detail about the prospect.

Return JSON only — no prose outside the JSON. Extract every detail mentioned,
infer carefully where appropriate, never invent. If something isn't mentioned,
return null for that field.

Also identify at which stage the call ended:

STAGES:
- opener: call ended before fact find started
- fact_find: call ended during fact find
- enlarge: call ended during enlarge/problem surfacing
- disturb: call ended during disturb
- close: call ended during close/funnel
- completed: meeting booked, call completed successfully
- voicemail: reached voicemail, no conversation

Add to your JSON response:
"call_stage_reached": one of the above values
"call_stage_note": one sentence — what specifically happened at that stage
  e.g. "Prospect said not interested after opener, before any fact find questions"
  e.g. "Good fact find, lost momentum when asking for meeting — ask softened"
  e.g. "Meeting booked successfully after handling send me an email objection"

PRIVACY RULES — apply to all extracted fields:
- Names: first name + last initial only. "John Smith" → "John S."
- Never store: full surname, phone, email, home address, children's details
  (a general mention that they have children is fine — never names or ages)
- Keep: company, location, occupation, financial situation (general terms)
- Financial amounts: keep if relevant to the case (e.g. "pension not reviewed
  since 2017", "significant cash holdings across two currencies") — never
  store specific account numbers or precise balances unless essential

Return this exact shape:
{
  "prospect_name": string | null,   // "John S." format — see PRIVACY RULES
  "prospect_location": string | null,   // city + country
  "company": string | null,   // employer name
  "age_range": string | null,
  "occupation": string | null,
  "family_situation": string | null,   // general terms only — never children's names/ages
  "financial_situation": string | null,   // general terms — see PRIVACY RULES on amounts
  "income_indicators": string | null,
  "financial_concerns": string | null,
  "future_goals": string | null,
  "timeline": string | null,
  "objections_raised": string | null,
  "what_resonated": string | null,
  "meeting_details": string | null,
  "advisor_name": string | null,
  "tone_notes": string | null,
  "suggested_approach": string | null,
  "talking_points": string[],
  "call_stage_reached": "opener" | "fact_find" | "enlarge" | "disturb" | "close" | "completed" | "voicemail",
  "call_stage_note": string
}`

export type CallStage = 'opener' | 'fact_find' | 'enlarge' | 'disturb' | 'close' | 'completed' | 'voicemail'

export interface FillerWordAnalysis {
  total: number
  breakdown: Record<string, number>
  worst_offender: string | null  // the most used filler word
}

export interface ApolloIntelligence {
  prospect_name: string | null
  prospect_location: string | null
  company: string | null
  age_range: string | null
  occupation: string | null
  family_situation: string | null
  financial_situation: string | null
  income_indicators: string | null
  financial_concerns: string | null
  future_goals: string | null
  timeline: string | null
  objections_raised: string | null
  what_resonated: string | null
  meeting_details: string | null
  advisor_name: string | null
  tone_notes: string | null
  suggested_approach: string | null
  talking_points: string[]
  call_stage_reached: CallStage | null
  call_stage_note: string | null
  filler_words: FillerWordAnalysis
}

// ── Filler word counter — simple string match, no extra API call ────────────

const FILLER_WORDS = [
  'you know', 'sort of', 'kind of', 'basically',
  'literally', 'obviously', 'right', 'yeah so',
  'i mean', 'like i said', 'to be honest',
  'at the end of the day', 'if you know what i mean',
]

function countFillerWords(transcript: string): Record<string, number> {
  const lower = transcript.toLowerCase()
  const counts: Record<string, number> = {}
  for (const filler of FILLER_WORDS) {
    const matches = lower.match(new RegExp(filler, 'g'))
    if (matches && matches.length > 0) {
      counts[filler] = matches.length
    }
  }
  return counts
}

function totalFillerCount(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0)
}

// Only Archie's turns count — never the prospect's. Transcript lines look like
// "[MM:SS] Archie: ..." (see formatTranscript in transcribe/route.ts) or, after
// manual editing in the workspace, "Archie: ..." with no timestamp — match both.
function extractArchieText(transcript: string): string {
  const lines: string[] = []
  for (const line of transcript.split('\n')) {
    const match = line.match(/^(?:\[\d{1,2}:\d{2}\]\s*)?([^:]+):\s*(.*)$/)
    if (match && /^archie$/i.test(match[1].trim())) {
      lines.push(match[2])
    }
  }
  return lines.join(' ')
}

function analyseFillerWords(transcript: string): FillerWordAnalysis {
  const counts = countFillerWords(extractArchieText(transcript))
  const total = totalFillerCount(counts)
  const worstOffender = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { total, breakdown: counts, worst_offender: worstOffender }
}

// Robust JSON extraction — Opus is instructed to return JSON only, but models
// occasionally wrap it in a fenced code block anyway.
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenced?.[1]) return fenced[1].trim()
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) return raw.slice(first, last + 1)
  return raw.trim()
}

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { callId, transcript: editedTranscript } = await req.json().catch(() => ({})) as {
    callId?: string
    transcript?: string  // current edited state from the workspace, if the transcript was corrected before analysing
  }
  if (!callId) {
    return NextResponse.json({ error: 'callId required' }, { status: 400 })
  }

  const call = await getCall(callId)
  if (!call || !call.transcript) {
    return NextResponse.json({ error: 'Call or transcript not found' }, { status: 404 })
  }

  // Edited transcript (if supplied) always wins — corrections feed the analysis,
  // and get persisted so later views/generation see the corrected version too.
  const transcript = editedTranscript && editedTranscript.trim() ? editedTranscript : call.transcript

  const startMs = Date.now()

  try {
    const raw = await askWith(APOLLO_EXTRACT_SYSTEM, transcript, 2000, OPUS)
    const intelligence = JSON.parse(extractJson(raw)) as ApolloIntelligence
    intelligence.filler_words = analyseFillerWords(transcript)

    await updateCall(callId, {
      transcript,
      intelligence_json: JSON.stringify(intelligence),
      prospect_name: intelligence.prospect_name ?? null,
    })

    await getDb().insert(activity).values({
      id: crypto.randomUUID(),
      event_id: `apollo_analyse_${Date.now()}`,
      type: 'analyse',
      agent: 'APOLLO',
      input: callId,
      output: `extracted intelligence for ${intelligence.prospect_name ?? 'unknown prospect'}`,
      status: 'success',
      duration_ms: Date.now() - startMs,
      created_at: Math.floor(Date.now() / 1000),
    })

    return NextResponse.json({ callId, intelligence })
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
