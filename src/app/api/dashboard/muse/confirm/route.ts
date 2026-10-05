import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { handleMuseConfirm } from '@/lib/muse-handler'

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

  try {
    const result = await handleMuseConfirm(pendingId, decision as 'keep' | 'discard')
    if (result.status === 'not_found') {
      return NextResponse.json({ error: result.message }, { status: 404 })
    }
    return NextResponse.json({ ...result, id: pendingId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Confirm error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
