// POST /api/dashboard/meetings/book-followup — one-click "book this as a
// follow-up call" from an extracted FOLLOW-UP date, creating a future-dated
// apollo_calls row (meeting_type distinguishes it from a diarised phone call).

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { createMeetingCallRecord } from '../../../../../../tools/apollo'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { prospectName, date, type, companyName } = await req.json().catch(() => ({})) as {
    prospectName?: string | null; date?: string; type?: string | null; companyName?: string | null
  }
  if (!date?.trim()) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 })
  }

  try {
    const meetingType = type?.toLowerCase().includes('fact find') ? 'fact_find' : 'meeting'
    const callId = await createMeetingCallRecord({
      call_date: date.trim(),
      prospect_name: prospectName?.trim() || null,
      meeting_type: meetingType,
      company_name: companyName?.trim() || null,
    })
    return NextResponse.json({ callId })
  } catch (err) {
    console.error('[meetings/book-followup] failed:', err)
    const msg = err instanceof Error ? err.message : 'Booking failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
