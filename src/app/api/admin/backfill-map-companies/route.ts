import { timingSafeEqual } from 'crypto'
import { sql } from 'drizzle-orm'
import { env } from '@/lib/env'
import { getDb } from '@/db'
import { map_companies } from '@/db/schema'
import { getUnmatchedProspectCompanies, ensureCompanyOnMap, ensureSelfEmployedMarker, ensureDevereOfficeMarker, cleanupPlaceholderCompanies } from '../../../../../tools/map-db'

// POST /api/admin/backfill-map-companies — one-off, run once after
// deploying the new auto-add-to-map behaviour. Bearer auth via MAIA_API_KEY.
// Temporary — delete this route once run against production and confirmed,
// per the standing "temporary admin routes, deleted after use" rule.
//
// ensureCompanyOnMap (wired into addProspect/addProspectsBulk/updateProspect)
// only auto-adds a company going FORWARD, at the moment a prospect with that
// company is saved — it never touches the existing backlog of prospects
// already in the CRM before this feature shipped. This route is that one-time
// catch-up: every distinct company already in the prospect list that doesn't
// match a mapped company (same name+alias+fuzzy lookup as everywhere else)
// gets a basic map_companies row, Geneva-centre coordinates, no threshold.
// Also ensures the two special markers exist (Self Employed / Independent
// aggregate, DeVere's own Geneva office) — both are no-ops if already present,
// so this stays safely re-runnable.

function checkAuth(request: Request): boolean {
  const authHeader = request.headers.get('Authorization') ?? ''
  const apiKey = env.MAIA_API_KEY()
  if (!apiKey) return false
  const expected = `Bearer ${apiKey}`
  try {
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(authHeader.padEnd(expected.length, '\0').slice(0, expected.length), 'utf8')
    return authHeader.length === expected.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!checkAuth(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const cleaned = await cleanupPlaceholderCompanies()

  const [{ count: before }] = await getDb().select({ count: sql<number>`count(*)` }).from(map_companies)

  await ensureSelfEmployedMarker()
  await ensureDevereOfficeMarker()

  // Unbounded — this is a one-off catch-up, not a per-page-load fetch, so
  // the display-oriented cap on getUnmatchedProspectCompanies doesn't apply.
  const { names } = await getUnmatchedProspectCompanies(100000)
  for (const name of names) {
    await ensureCompanyOnMap(name)
  }

  const [{ count: after }] = await getDb().select({ count: sql<number>`count(*)` }).from(map_companies)
  return Response.json({ added: after - before, unmatchedSeen: names.length, cleanedPlaceholders: cleaned })
}
