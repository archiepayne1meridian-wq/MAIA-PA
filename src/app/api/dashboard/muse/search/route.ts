import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { query, sector } = await req.json().catch(() => ({})) as {
    query?: string
    sector?: string
  }

  if (!query) {
    return NextResponse.json({ error: 'query required' }, { status: 400 })
  }

  // Stub — searchKnowledge (Claude Haiku) wired in Step 4
  return NextResponse.json({
    status: 'stub',
    message: 'Search will be available from Step 4.',
    query,
    sector: sector ?? null,
    results: [],
  })
}
