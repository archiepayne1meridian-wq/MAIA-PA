import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { askWith } from '@/lib/claude'
import { getDb } from '@/db'
import { activity } from '@/db/schema'
import { getCall, updateCall } from '../../../../../../tools/apollo'
import { saveEntry } from '../../../../../../tools/muse'
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
    void (async () => {
      try {
        const now = Math.floor(Date.now() / 1000)

        const transcriptEntryId = await saveEntry({
          sector: 'Sales & Prospecting',
          title: `Call Transcript — ${prospectName} ${dateStr}`,
          summary: `Call transcript from ${dateStr}`,
          content: transcript,
          brief_depth: 'detailed',
          source: 'apollo',
          source_agent: 'APOLLO',
          status: 'active',
          date_filed: now,
          last_updated: now,
        })

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

        await updateCall(callId, {
          muse_transcript_id: transcriptEntryId,
          muse_brief_id: briefEntryId,
          muse_email_id: emailEntryId,
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
