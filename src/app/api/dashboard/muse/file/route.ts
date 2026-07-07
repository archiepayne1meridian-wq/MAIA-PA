import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { processInput } from '@/lib/muse'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { content, sector } = await req.json().catch(() => ({})) as {
    content?: string
    sector?: string
  }

  if (!content) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }

  try {
    const { pendingIds, assessment } = await processInput(content, 'file', sector)

    if (assessment.isLowValue) {
      return NextResponse.json({
        status: 'low_value',
        reason: assessment.lowValueReason,
        pendingIds: [],
      })
    }

    return NextResponse.json({ status: 'pending', pendingIds })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Filing error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
