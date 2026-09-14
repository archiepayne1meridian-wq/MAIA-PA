import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { searchKnowledge } from '@/lib/muse'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { query, sector, privacyTier, entryType, limit } = await req.json().catch(() => ({})) as {
    query?: string
    sector?: string
    privacyTier?: 1 | 2 | 'all'
    entryType?: string
    limit?: number
  }

  if (!query) {
    return NextResponse.json({ error: 'query required' }, { status: 400 })
  }

  try {
    const result = await searchKnowledge(query, { privacyTier, entryType, limit })
    const knowledge = sector ? result.knowledge.filter(k => k.sector === sector) : result.knowledge
    return NextResponse.json({ ...result, knowledge })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
