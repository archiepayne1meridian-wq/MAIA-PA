import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { updateSession } from '../../../../../../../tools/athena-db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { cardsReviewed?: number; correctCount?: number; ended?: boolean }

  try {
    await updateSession(id, body)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[athena/sessions/[id]] PATCH failed:', err)
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }
}
