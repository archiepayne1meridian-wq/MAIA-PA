import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { inferEmploymentType } from '@/lib/nexus-employment'
import { countNeedingEmploymentBackfill, getProspectsNeedingEmploymentBackfill, setEmploymentType } from '../../../../../tools/nexus-db'

// POST /api/admin/backfill-employment-types — one-off, run once after
// deploying the new employment_type rule set. Bearer auth via MAIA_API_KEY.
// Temporary — delete this route once run against production and confirmed,
// per the standing "temporary admin routes, deleted after use" rule.
//
// Classifies every prospect with employment_type IS NULL or still holding
// the old invalid 'Managing Director' value (never an already-valid
// classification — a manual override always sticks). Classification is a
// pure deterministic function (src/lib/nexus-employment.ts, no Claude call),
// so this runs to completion synchronously in one request rather than
// draining a queue over many page loads — batched in groups of 50 purely to
// avoid one giant single-statement update on a large table.
//
// Re-runnable safely: finishes with 0 reclassified once nothing matches the
// backfill criteria any more.

const BATCH_SIZE = 50

const EXPECTED_PREFIX = 'Bearer '

function checkAuth(request: Request): boolean {
  const authHeader = request.headers.get('Authorization') ?? ''
  const apiKey = env.MAIA_API_KEY()
  if (!apiKey) return false
  const expected = `${EXPECTED_PREFIX}${apiKey}`
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

  const startingCount = await countNeedingEmploymentBackfill()
  let classified = 0

  for (;;) {
    const batch = await getProspectsNeedingEmploymentBackfill(BATCH_SIZE)
    if (batch.length === 0) break
    for (const p of batch) {
      const type = inferEmploymentType(p.job_role, p.company)
      await setEmploymentType(p.id, type)
      classified++
    }
  }

  return Response.json({ startingCount, classified })
}
