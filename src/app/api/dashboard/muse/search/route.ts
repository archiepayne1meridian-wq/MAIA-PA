import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { searchKnowledge } from '@/lib/muse'

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

  try {
    const result = await searchKnowledge(query, sector)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
