import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { confirmProposal } from '@/lib/preferences'

// POST — confirm a pending proposal: promotes it to a confirmed preference
// (applied immediately — every getPreferences() call picks it up from then on)
// and marks the proposal row confirmed so it's never surfaced again.
export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { proposalId } = await req.json().catch(() => ({})) as { proposalId?: string }
  if (!proposalId) {
    return NextResponse.json({ error: 'proposalId is required' }, { status: 400 })
  }
  const newPreferenceId = await confirmProposal(proposalId)
  if (!newPreferenceId) {
    return NextResponse.json({ error: 'proposal not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, preferenceId: newPreferenceId })
}
