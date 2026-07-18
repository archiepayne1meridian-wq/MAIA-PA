import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { research_briefs } from '@/db/schema'
import { desc } from 'drizzle-orm'

interface HeadlineRecord {
  title: string
  digest: string | null
  link: string
  source: string
  section: 'regulatory' | 'headlines'
}

// Legacy shape (pre digest/section headlines_json): { regulatory: FeedItem[], news: FeedItem[] }.
// Older research_briefs rows are still in this shape — flatten them so the dashboard
// keeps working for briefs generated before this format changed.
function parseHeadlines(json: string): HeadlineRecord[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  if (Array.isArray(parsed)) return parsed as HeadlineRecord[]
  if (parsed && typeof parsed === 'object') {
    const legacy = parsed as { regulatory?: { title: string; link: string; source: string }[]; news?: { title: string; link: string; source: string }[] }
    return [
      ...(legacy.regulatory ?? []).map(item => ({ ...item, digest: null, section: 'regulatory' as const })),
      ...(legacy.news ?? []).map(item => ({ ...item, digest: null, section: 'headlines' as const })),
    ]
  }
  return []
}

export async function GET(request: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))

  const db = getDb()
  const [row] = await db
    .select()
    .from(research_briefs)
    .orderBy(desc(research_briefs.created_at))
    .limit(1)
    .offset(offset)

  if (!row) {
    return NextResponse.json({ brief: null })
  }

  let markets: { indices: unknown[]; fx: unknown[] } = { indices: [], fx: [] }
  try { markets = JSON.parse(row.markets_json) } catch { /* malformed — use empty */ }
  const headlines = parseHeadlines(row.headlines_json)

  return NextResponse.json({
    brief: {
      id: row.id,
      type: row.type,
      briefTime: new Date(row.created_at * 1000).toTimeString().slice(0, 5),
      briefDate: new Date(row.created_at * 1000).toLocaleDateString('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short',
      }),
      indices: markets.indices,
      fx: markets.fx,
      headlines,
      summary: row.summary,
    },
  })
}
