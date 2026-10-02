import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getCall } from '../../../../../../tools/apollo'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const call = await getCall(id)
  if (!call) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    call: {
      id: call.id,
      call_date: call.call_date,
      prospect_name: call.prospect_name,
      transcript: call.transcript,
      outcome: call.outcome,
      stageReached: call.stage_reached,
      callSummary: call.call_summary,
      crmNotes: call.advisor_brief,            // repurposed field — see schema.ts
      confirmationEmail: call.client_email,    // repurposed field — see schema.ts
      followUpNotes: call.follow_up_notes,
      followUpDate: call.follow_up_date,
      winningPhrases: call.winning_phrases_json ? JSON.parse(call.winning_phrases_json) as string[] : [],
    },
  })
}
