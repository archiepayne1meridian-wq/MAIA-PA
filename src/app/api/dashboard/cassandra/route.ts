import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { research_briefs } from '@/db/schema'
import { desc } from 'drizzle-orm'

type ImpactLevel = 'direct' | 'watch' | 'awareness'
const VALID_IMPACT: ImpactLevel[] = ['direct', 'watch', 'awareness']

interface HeadlineRecord {
  summary: string
  angle: string | null
  source: string
  url: string | null
  section: string
  sectionLabel: string
  impact: ImpactLevel | null  // Regulatory / Tax & Legislation items only
}

const OLD_SECTION_LABELS: Record<string, string> = { regulatory: 'Regulatory', headlines: 'Headlines' }

// headlines_json has gone through three shapes across CASSANDRA's evolution:
//   1. { regulatory: FeedItem[], news: FeedItem[] }               — title/link/source only
//   2. [{ title, digest, link, source, section: 'regulatory'|'headlines' }]
//   3. [{ summary, angle, source, url, section, sectionLabel }]   — current (web-search brief)
// normalizeHeadlineItem detects shape per-item so old research_briefs rows keep
// rendering in the dashboard's "Previous brief" browser rather than breaking.
function normalizeHeadlineItem(raw: Record<string, unknown>): HeadlineRecord | null {
  const source = typeof raw.source === 'string' ? raw.source : null
  if (!source) return null

  // Shape 3 (current): summary/angle/url/section/sectionLabel(/impact).
  if (typeof raw.summary === 'string') {
    return {
      summary: raw.summary,
      angle: typeof raw.angle === 'string' ? raw.angle : null,
      source,
      url: typeof raw.url === 'string' ? raw.url : null,
      section: typeof raw.section === 'string' ? raw.section : 'general',
      sectionLabel: typeof raw.sectionLabel === 'string' ? raw.sectionLabel : 'Brief',
      impact: typeof raw.impact === 'string' && VALID_IMPACT.includes(raw.impact as ImpactLevel)
        ? (raw.impact as ImpactLevel) : null,
    }
  }

  // Shapes 1/2: title/digest/link/source/section ('regulatory'|'headlines'). Predate the
  // impact field entirely — always null here.
  if (typeof raw.title === 'string') {
    const section = typeof raw.section === 'string' ? raw.section : 'regulatory'
    return {
      summary: typeof raw.digest === 'string' ? raw.digest : raw.title,
      angle: null,
      source,
      url: typeof raw.link === 'string' ? raw.link : null,
      section,
      sectionLabel: OLD_SECTION_LABELS[section] ?? section,
      impact: null,
    }
  }

  return null
}

function parseHeadlines(json: string): HeadlineRecord[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }

  if (Array.isArray(parsed)) {
    return (parsed as Record<string, unknown>[])
      .map(normalizeHeadlineItem)
      .filter((r): r is HeadlineRecord => r !== null)
  }

  // Shape 1: { regulatory: [...], news: [...] }
  if (parsed && typeof parsed === 'object') {
    const legacy = parsed as { regulatory?: Record<string, unknown>[]; news?: Record<string, unknown>[] }
    const regulatory = (legacy.regulatory ?? []).map(item => normalizeHeadlineItem({ ...item, section: 'regulatory' }))
    const news = (legacy.news ?? []).map(item => normalizeHeadlineItem({ ...item, section: 'headlines' }))
    return [...regulatory, ...news].filter((r): r is HeadlineRecord => r !== null)
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
