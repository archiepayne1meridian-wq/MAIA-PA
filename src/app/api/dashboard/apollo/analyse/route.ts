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

Return this exact shape:
{
  "prospect_name": string | null,
  "prospect_location": string | null,
  "age_range": string | null,
  "occupation": string | null,
  "family_situation": string | null,
  "financial_situation": string | null,
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
  "talking_points": string[]
}`

export interface ApolloIntelligence {
  prospect_name: string | null
  prospect_location: string | null
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

  const { callId } = await req.json().catch(() => ({})) as { callId?: string }
  if (!callId) {
    return NextResponse.json({ error: 'callId required' }, { status: 400 })
  }

  const call = await getCall(callId)
  if (!call || !call.transcript) {
    return NextResponse.json({ error: 'Call or transcript not found' }, { status: 404 })
  }

  const startMs = Date.now()

  try {
    const raw = await askWith(APOLLO_EXTRACT_SYSTEM, call.transcript, 2000, OPUS)
    const intelligence = JSON.parse(extractJson(raw)) as ApolloIntelligence

    await updateCall(callId, {
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
