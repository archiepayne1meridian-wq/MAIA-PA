import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { applyCardReview } from '../../../../../../../../tools/athena-db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { quality?: number }
  if (body.quality !== 1 && body.quality !== 3 && body.quality !== 5) {
    return NextResponse.json({ error: 'quality must be 1, 3, or 5' }, { status: 400 })
  }

  try {
    const { card, intervalDays } = await applyCardReview(id, body.quality)
    return NextResponse.json({ card, intervalDays })
  } catch (err) {
    console.error('[athena/cards/[id]/review] PATCH failed:', err)
    const message = err instanceof Error ? err.message : 'Failed to apply review'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
