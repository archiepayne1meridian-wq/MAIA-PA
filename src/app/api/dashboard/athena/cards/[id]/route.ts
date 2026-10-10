import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { deleteCard } from '../../../../../../../tools/athena-db'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  try {
    await deleteCard(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[athena/cards/[id]] DELETE failed:', err)
    return NextResponse.json({ error: 'Failed to delete card' }, { status: 500 })
  }
}
