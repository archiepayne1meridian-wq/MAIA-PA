import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { handleMuseConfirm } from '@/lib/muse-handler'
import { env } from '@/lib/env'

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
    const channel = env.SLACK_CHANNEL_ID()
    await handleMuseConfirm(channel, pendingId, decision as 'keep' | 'discard')
    return NextResponse.json({ status: decision === 'keep' ? 'approved' : 'discarded', id: pendingId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Confirm error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
