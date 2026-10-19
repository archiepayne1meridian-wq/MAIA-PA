import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { updateCompanyFlags } from '../../../../../../../tools/map-db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: 'Invalid company id' }, { status: 400 })
  }
  const { prospect_priority, avoid_reason, notes } = await req.json().catch(() => ({})) as {
    prospect_priority?: 'high' | 'normal' | 'low' | 'avoid'
    avoid_reason?: string | null
    notes?: string | null
  }
  if (prospect_priority === undefined && avoid_reason === undefined && notes === undefined) {
    return NextResponse.json({ error: 'prospect_priority, avoid_reason, or notes required' }, { status: 400 })
  }
  await updateCompanyFlags(numId, {
    ...(prospect_priority !== undefined ? { prospect_priority } : {}),
    ...(avoid_reason !== undefined ? { avoid_reason } : {}),
    ...(notes !== undefined ? { notes } : {}),
  })
  return NextResponse.json({ ok: true })
}
