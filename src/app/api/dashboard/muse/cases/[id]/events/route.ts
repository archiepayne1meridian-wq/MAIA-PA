import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { addCaseEvent, getCaseWithEvents } from '../../../../../../../../tools/muse-cases'

const VALID_EVENT_TYPES = ['call', 'meeting_booked', 'meeting_sat', 'adviser_note', 'outcome', 'follow_up']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({})) as {
    event_type?: string
    date?: string
    summary?: string
    what_suggested?: string
    adviser_recommendation?: string
    worked?: string
    apollo_call_id?: string
  }

  if (!body.event_type || !VALID_EVENT_TYPES.includes(body.event_type)) {
    return NextResponse.json({ error: `event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}` }, { status: 400 })
  }
  if (!body.summary?.trim()) {
    return NextResponse.json({ error: 'summary required' }, { status: 400 })
  }

  const eventId = await addCaseEvent(id, {
    event_type: body.event_type,
    date: body.date?.trim() || new Date().toISOString().slice(0, 10),
    summary: body.summary.trim(),
    what_suggested: body.what_suggested?.trim() || null,
    adviser_recommendation: body.adviser_recommendation?.trim() || null,
    worked: body.worked?.trim() || null,
    apollo_call_id: body.apollo_call_id ?? null,
  })

  const caseData = await getCaseWithEvents(id)
  return NextResponse.json({ eventId, case: caseData })
}
