import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { askWith } from '@/lib/claude'
import { getDb } from '@/db'
import { activity } from '@/db/schema'
import { getCall, updateCall } from '../../../../../../tools/apollo'
import { saveEntry, searchEntries } from '../../../../../../tools/muse'
import { findCase, createCase, updateCase, addCaseEvent, linkCaseToMuse } from '../../../../../../tools/muse-cases'
import type { ApolloIntelligence } from '../analyse/route'

const HAIKU = 'claude-haiku-4-5-20251001'

const ADVISOR_BRIEF_SYSTEM = `You are APOLLO. Write a professional meeting brief email for a financial
adviser at deVere Group based on the extracted prospect intelligence.

Format exactly as shown below. Use the MEETING BRIEF template.
Be specific — name the objections, name the goals, give concrete talking points.
Never give financial advice or projections.
Never invent facts not in the intelligence data.
Write in plain text suitable for email — no markdown.

Template:
MEETING BRIEF — [Prospect Name]
Prepared by APOLLO | [date]

ABOUT THE PROSPECT
[personal background — name, location, occupation, family]

FINANCIAL PICTURE
[what they have, what they're worried about, gaps identified]

GOALS & TIMELINE
[what they want, when they want it, life events mentioned]

OBJECTIONS ON THE CALL
[each objection raised + how it was handled + whether resolved]

WHAT GOT THEM TO THE MEETING
[specific triggers — what resonated, what they responded to]

RECOMMENDED APPROACH
[tone, opening, topics to lead with, things to avoid]

TALKING POINTS
1. [specific point from the call]
2. [specific point from the call]
3. [specific point from the call]

MEETING DETAILS
[date, time, format, any logistics mentioned]`

const CLIENT_EMAIL_SYSTEM = `You are APOLLO. Write a friendly but professional confirmation email
from Archie Payne to the prospect confirming their upcoming meeting
with a deVere adviser.

Rules:
- Reference something specific from the call to make it personal
- Confirm the meeting details (date, time, format)
- Remind them briefly why the meeting made sense (what they said they wanted)
- Build anticipation — make them feel good about the decision
- Keep it to 3-4 short paragraphs
- Sign off as Archie Payne, deVere Group
- Never give financial advice or projections
- Never invent facts not in the transcript
- Friendly but professional tone
- Write in plain text suitable for pasting into an email client — no markdown,
  no asterisks, no headers. A "Subject:" line on its own first line is fine.`

async function logApolloActivity(
  type: string, callId: string, output: string, status: 'success' | 'error', startMs: number,
) {
  await getDb().insert(activity).values({
    id: crypto.randomUUID(),
    event_id: `apollo_${type}_${Date.now()}`,
    type,
    agent: 'APOLLO',
    input: callId,
    output,
    status,
    duration_ms: Date.now() - startMs,
    created_at: Math.floor(Date.now() / 1000),
  }).catch(() => {})
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
  if (!call || !call.transcript || !call.intelligence_json) {
    return NextResponse.json({ error: 'Call, transcript, or intelligence not found — run analyse first' }, { status: 404 })
  }

  const startMs = Date.now()
  const intelligence = JSON.parse(call.intelligence_json) as ApolloIntelligence
  const transcript = call.transcript
  const dateStr = new Date().toISOString().slice(0, 10)
  const prospectName = intelligence.prospect_name ?? 'Unknown Prospect'

  try {
    const [advisorBrief, clientEmail] = await Promise.all([
      askWith(
        ADVISOR_BRIEF_SYSTEM,
        `Today's date: ${dateStr}\n\nExtracted intelligence:\n${JSON.stringify(intelligence, null, 2)}`,
        1200,
        HAIKU,
      ),
      askWith(
        CLIENT_EMAIL_SYSTEM,
        `Meeting details: ${intelligence.meeting_details ?? 'not specified on the call'}\n\n` +
        `Extracted intelligence:\n${JSON.stringify(intelligence, null, 2)}\n\n` +
        `Transcript excerpt (for specific reference):\n${transcript.slice(0, 2000)}`,
        700,
        HAIKU,
      ),
    ])

    await updateCall(callId, { advisor_brief: advisorBrief, client_email: clientEmail })

    // Auto-save to MUSE — fire and forget, never blocks the response.
    // Structured outputs from a known source (APOLLO) — auto-commit, no
    // Approvals-queue review (Archie's explicit call, 2026-08-13).
    //
    // The prospect is filed as one case (find-or-create + an event), not three flat
    // documents — intelligence is already anonymised to "First L." + company by the
    // extraction prompt. The transcript itself is no longer copied into MUSE (it stays
    // in apollo_calls only); the advisor brief and client email remain separate
    // muse_entries under Sales & Prospecting since they're documents, not case data.
    void (async () => {
      try {
        const now = Math.floor(Date.now() / 1000)
        const company = intelligence.company

        const briefEntryId = await saveEntry({
          sector: 'Sales & Prospecting',
          title: `Advisor Brief — ${prospectName} ${dateStr}`,
          summary: `Advisor meeting brief prepared from call on ${dateStr}`,
          content: advisorBrief,
          brief_depth: 'detailed',
          source: 'apollo',
          source_agent: 'APOLLO',
          status: 'active',
          date_filed: now,
          last_updated: now,
        })

        const emailEntryId = await saveEntry({
          sector: 'Sales & Prospecting',
          title: `Client Email — ${prospectName} ${dateStr}`,
          summary: `Client confirmation email drafted from call on ${dateStr}`,
          content: clientEmail,
          brief_depth: 'simple',
          source: 'apollo',
          source_agent: 'APOLLO',
          status: 'active',
          date_filed: now,
          last_updated: now,
        })

        // Find-or-create the case for this prospect (matched on anonymised name + company).
        const existing = await findCase(prospectName, company)
        const caseId = existing
          ? existing.id
          : await createCase({
              display_name: prospectName,
              company,
              location: intelligence.prospect_location,
              occupation: intelligence.occupation,
              financial_profile: intelligence.financial_situation,
            })

        if (existing) {
          // Refresh with the latest known state — a later call usually has more
          // complete information than an earlier one.
          await updateCase(caseId, {
            location: intelligence.prospect_location ?? existing.location,
            occupation: intelligence.occupation ?? existing.occupation,
            financial_profile: intelligence.financial_situation ?? existing.financial_profile,
          })
        }

        const callSummary = [intelligence.financial_concerns, intelligence.future_goals]
          .filter(Boolean)
          .join(' ') || `Call on ${dateStr}.`

        await addCaseEvent(caseId, {
          event_type: 'call',
          date: dateStr,
          summary: callSummary,
          what_suggested: intelligence.suggested_approach,
          adviser_recommendation: null,
          worked: 'pending',
          apollo_call_id: callId,
        })

        // Link the case to relevant existing knowledge (regulations, products, training).
        // searchEntries does a single substring LIKE match, so a whole sentence never
        // matches anything — extract short distinctive keywords and search per-keyword.
        const keywordSource = [intelligence.financial_concerns, intelligence.occupation, intelligence.objections_raised]
          .filter(Boolean)
          .join(' ')
        const stopwords = new Set(['their', 'about', 'which', 'never', 'reviewed', 'sitting', 'working', 'holdings'])
        const keywords = Array.from(new Set(
          keywordSource
            .toLowerCase()
            .split(/[^a-z]+/)
            .filter(w => w.length >= 5 && !stopwords.has(w)),
        )).slice(0, 5)

        if (keywords.length > 0) {
          const perKeyword = await Promise.all(keywords.map(k => searchEntries(k)))
          const excludeIds = new Set([briefEntryId, emailEntryId])
          const seen = new Map<string, { id: string }>()
          for (const results of perKeyword) {
            for (const r of results) if (!excludeIds.has(r.id) && !seen.has(r.id)) seen.set(r.id, r)
          }
          await Promise.all(Array.from(seen.values()).slice(0, 3).map(r => linkCaseToMuse(caseId, r.id)))
        }

        await updateCall(callId, {
          muse_brief_id: briefEntryId,
          muse_email_id: emailEntryId,
          muse_case_id: caseId,
        })
      } catch (err) {
        console.error('[apollo] MUSE auto-save failed:', err)
      }
    })()

    await logApolloActivity('generate', callId, `brief + email generated for ${prospectName}`, 'success', startMs)

    return NextResponse.json({ advisorBrief, clientEmail })
  } catch (err) {
    console.error('[apollo] generation failed:', err)
    await logApolloActivity('generate', callId, err instanceof Error ? err.message : String(err), 'error', startMs)
    return NextResponse.json({ error: 'Output generation failed' }, { status: 500 })
  }
}
