import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { declineProposal } from '@/lib/preferences'

// POST — decline a pending proposal. Marks it 'declined' — never proposed again.
export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { proposalId } = await req.json().catch(() => ({})) as { proposalId?: string }
  if (!proposalId) {
    return NextResponse.json({ error: 'proposalId is required' }, { status: 400 })
  }
  await declineProposal(proposalId)
  return NextResponse.json({ ok: true })
}
