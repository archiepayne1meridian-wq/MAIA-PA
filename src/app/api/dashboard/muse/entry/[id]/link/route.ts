// Manual "Link to..." — lets the dashboard create a connection between two knowledge
// entries on demand, alongside the existing auto-suggested links from assessValue.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { saveLink, getEntry } from '../../../../../../../../tools/muse'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { targetId } = await req.json().catch(() => ({})) as { targetId?: string }

  if (!targetId) {
    return NextResponse.json({ error: 'targetId required' }, { status: 400 })
  }

  await saveLink(id, targetId, 'related')
  const entry = await getEntry(id)
  return NextResponse.json({ entry })
}
