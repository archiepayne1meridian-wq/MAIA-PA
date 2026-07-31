import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { refinePending } from '@/lib/muse'
import { getPendingById, updatePendingSuggestion } from '../../../../../../tools/muse'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { pendingId, instruction } = await req.json().catch(() => ({})) as {
    pendingId?: string
    instruction?: string
  }

  if (!pendingId || !instruction?.trim()) {
    return NextResponse.json({ error: 'pendingId and instruction are required' }, { status: 400 })
  }

  const pending = await getPendingById(pendingId)
  if (!pending) {
    return NextResponse.json({ error: 'Pending item not found' }, { status: 404 })
  }

  try {
    const revised = await refinePending(
      { title: pending.suggested_title, summary: pending.suggested_summary, content: pending.suggested_content },
      instruction.trim(),
    )
    await updatePendingSuggestion(pendingId, revised)
    return NextResponse.json({ status: 'revised', ...revised })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refine failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
