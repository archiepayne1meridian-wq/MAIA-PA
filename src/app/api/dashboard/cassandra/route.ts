import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { research_briefs } from '@/db/schema'
import { desc } from 'drizzle-orm'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const [row] = await db
    .select()
    .from(research_briefs)
    .orderBy(desc(research_briefs.created_at))
    .limit(1)

  if (!row) {
    return NextResponse.json({ brief: null })
  }

  let markets: { indices: unknown[]; fx: unknown[] } = { indices: [], fx: [] }
  let headlines: { regulatory: unknown[]; news: unknown[] } = { regulatory: [], news: [] }
  try { markets = JSON.parse(row.markets_json) } catch { /* malformed — use empty */ }
  try { headlines = JSON.parse(row.headlines_json) } catch { /* malformed — use empty */ }

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
      regulatory: headlines.regulatory,
      news: headlines.news,
      summary: row.summary,
    },
  })
}
