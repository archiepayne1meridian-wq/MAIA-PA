// POST /api/dashboard/apollo/link-prospect — Archie confirms "yes, this
// booked call is [prospect]". One-click, always explicit — never set
// silently by the analyse pipeline itself, however confident the match.
// Sets apollo_calls.linked_prospect_id AND flips nexus_prospects.booked.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getCall, updateCall } from '../../../../../../tools/apollo'
import { getProspectById, updateProspect } from '../../../../../../tools/nexus-db'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { callId, prospectId } = await req.json().catch(() => ({})) as { callId?: string; prospectId?: string }
  if (!callId || !prospectId) {
    return NextResponse.json({ error: 'callId and prospectId are required' }, { status: 400 })
  }

  const [call, prospect] = await Promise.all([getCall(callId), getProspectById(prospectId)])
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })

  await Promise.all([
    updateCall(callId, { linked_prospect_id: prospectId }),
    updateProspect(prospectId, { booked: true }),
  ])

  return NextResponse.json({ ok: true })
}
