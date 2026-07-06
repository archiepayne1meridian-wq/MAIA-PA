import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getPendingById, updatePending } from '../../../../../../tools/muse'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { pendingId, decision } = await req.json().catch(() => ({})) as {
    pendingId?: string
    decision?: string
  }

  if (!pendingId || !decision) {
    return NextResponse.json({ error: 'pendingId and decision required' }, { status: 400 })
  }
  if (decision !== 'keep' && decision !== 'discard') {
    return NextResponse.json({ error: 'decision must be keep or discard' }, { status: 400 })
  }

  const pending = await getPendingById(pendingId)
  if (!pending) {
    return NextResponse.json({ error: 'Pending item not found' }, { status: 404 })
  }

  const status = decision === 'keep' ? 'approved' : 'discarded'
  await updatePending(pendingId, status)

  return NextResponse.json({ status, id: pendingId })
}
