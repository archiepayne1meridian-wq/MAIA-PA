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
      intelligence: call.intelligence_json ? JSON.parse(call.intelligence_json) : null,
      advisorBrief: call.advisor_brief,
      clientEmail: call.client_email,
      museSaved: Boolean(call.muse_transcript_id && call.muse_brief_id && call.muse_email_id),
    },
  })
}
