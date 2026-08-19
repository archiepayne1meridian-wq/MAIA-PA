import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { linkCaseToMuse, getCaseWithEvents } from '../../../../../../../../tools/muse-cases'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { museEntryId } = await req.json().catch(() => ({})) as { museEntryId?: string }

  if (!museEntryId) {
    return NextResponse.json({ error: 'museEntryId required' }, { status: 400 })
  }

  await linkCaseToMuse(id, museEntryId)
  const caseData = await getCaseWithEvents(id)
  return NextResponse.json({ case: caseData })
}
