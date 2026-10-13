// POST /api/dashboard/apollo/update-profile — explicitly fold one call's
// debrief into the coaching profile. The chat route already does this
// automatically every 3 exchanges; this exists for an explicit "end debrief"
// action (or manual re-sync) rather than waiting for the next threshold.
// Body: { callId: string }

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { updateCoachingProfile } from '@/lib/apollo-debrief'
import { getCall } from '../../../../../../tools/apollo'
import { getDebriefMessages, getCoachingProfile, saveCoachingProfile } from '../../../../../../tools/apollo-debrief'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { callId } = await req.json().catch(() => ({})) as { callId?: string }
  if (!callId) {
    return NextResponse.json({ error: 'callId is required' }, { status: 400 })
  }

  const call = await getCall(callId)
  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  try {
    const [history, profile] = await Promise.all([getDebriefMessages(callId, 50), getCoachingProfile()])
    const updated = await updateCoachingProfile(profile, history, call.call_summary)
    await saveCoachingProfile(updated)
    return NextResponse.json({ profile: updated })
  } catch (err) {
    console.error('[apollo/update-profile] failed:', err)
    return NextResponse.json({ error: 'Profile update failed' }, { status: 500 })
  }
}
