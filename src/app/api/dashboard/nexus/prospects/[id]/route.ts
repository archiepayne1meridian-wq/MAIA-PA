import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { updateProspect, softDeleteProspect } from '../../../../../../../tools/nexus-db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({})) as Record<string, string | null>

  try {
    await updateProspect(id, body)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[nexus/prospects/[id]] PATCH failed:', err)
    return NextResponse.json({ error: 'Failed to update prospect' }, { status: 500 })
  }
}

// Never hard-deletes — DNCs the prospect and notes why, per the Prospects
// agent's "never lose a name" rule.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  try {
    await softDeleteProspect(id, 'Removed by Archie (soft delete — set to Do Not Contact)')
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[nexus/prospects/[id]] DELETE failed:', err)
    return NextResponse.json({ error: 'Failed to remove prospect' }, { status: 500 })
  }
}
