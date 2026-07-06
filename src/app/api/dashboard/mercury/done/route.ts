import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { updateDraftStatus } from '../../../../../../tools/mercury'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { draftId } = await req.json().catch(() => ({})) as { draftId?: string }

  if (!draftId) {
    return NextResponse.json({ error: 'draftId required' }, { status: 400 })
  }

  await updateDraftStatus(draftId, 'approved')
  return NextResponse.json({ status: 'approved' })
}
