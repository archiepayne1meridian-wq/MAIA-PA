import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { getDb } from '@/db'
import { nexus_prospects } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { deleteProspectsByBatch, getAllNamesLower } from '../../../../../tools/nexus-db'

// POST /api/admin/nexus-maintenance — one-off cleanup + Google Sheet merge
// for the Prospects list. Bearer auth via MAIA_API_KEY. Temporary — delete
// this route once both actions below have been run and confirmed, per the
// standing "temporary admin routes, deleted after use" rule.
//
// Two actions:
//   { action: 'delete-batch', batch: string }
//     Hard-deletes every row with that batch label — for undoing a bad
//     Sales Nav import, not normal prospect lifecycle management.
//   { action: 'merge-seed', rows: [{firstName,lastName,jobRole,company}] }
//     Upsert, NOT wipe-and-replace: for each row (in array order), if a
//     prospect with the same first+last name already exists, update only
//     job_role/company/created_at — wash_result, notes, email, phone,
//     linkedin_url etc. are left untouched. If no match, insert a new row.
//     created_at is set to encode the array's order (row 0 = most recent
//     among the seeded rows, last row = least recent), all dated "2 days
//     ago" so genuine new Sales Nav imports (created_at = now) always sort
//     above the whole seeded block. Nothing is deleted by this action —
//     prospects not present in `rows` are left exactly as they are.

interface SeedRow {
  firstName?: string
  lastName?: string
  jobRole?: string | null
  company?: string | null
}

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization') ?? ''
  const apiKey = env.MAIA_API_KEY()

  if (!apiKey) {
    return new Response('Service unavailable — MAIA_API_KEY not configured', { status: 503 })
  }

  const expected = `Bearer ${apiKey}`
  const isValid = (() => {
    try {
      const a = Buffer.from(expected, 'utf8')
      const b = Buffer.from(authHeader.padEnd(expected.length, '\0').slice(0, expected.length), 'utf8')
      return authHeader.length === expected.length && timingSafeEqual(a, b)
    } catch {
      return false
    }
  })()

  if (!isValid) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as {
    action?: string
    batch?: string
    rows?: SeedRow[]
  }

  if (body.action === 'delete-batch') {
    if (!body.batch) return Response.json({ error: 'batch required' }, { status: 400 })
    const deleted = await deleteProspectsByBatch(body.batch)
    return Response.json({ action: 'delete-batch', batch: body.batch, deleted })
  }

  if (body.action === 'merge-seed') {
    const rows = body.rows ?? []
    const existing = await getAllNamesLower()
    const existingMap = new Map(existing.map(e => [`${e.firstLower} ${e.lastLower}`, e.id]))

    // Anchor just below "right now" (not some fixed "N days ago" — every
    // prior seed/import batch already sits at its own real insertion
    // timestamp, which could itself be anywhere from minutes to a day old,
    // so a fixed offset risks landing BELOW older rows it should sort
    // above). A genuinely new import gets created_at = the literal moment
    // it's inserted, which is always later than "now" at the time this
    // route ran, so it still sorts above the whole reseeded block.
    const now = Math.floor(Date.now() / 1000)
    const base = now - 1

    let updated = 0
    let inserted = 0
    let skippedBlank = 0

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!
      const first = (r.firstName ?? '').trim()
      const last = (r.lastName ?? '').trim()
      if (!first && !last) { skippedBlank++; continue }

      const createdAt = base - i
      const key = `${first.toLowerCase()} ${last.toLowerCase()}`
      const existingId = existingMap.get(key)

      if (existingId) {
        await getDb().update(nexus_prospects).set({
          job_role: r.jobRole?.trim() || null,
          company: r.company?.trim() || null,
          created_at: createdAt,
          updated_at: now,
        }).where(eq(nexus_prospects.id, existingId))
        updated++
      } else {
        await getDb().insert(nexus_prospects).values({
          id: crypto.randomUUID(),
          first_name: first || null,
          last_name: last || null,
          job_role: r.jobRole?.trim() || null,
          company: r.company?.trim() || null,
          employment_status: 'Employee',
          lead_channel: 'Cold - LinkedIn',
          country: 'Switzerland',
          batch: 'sheet-reseed-2026-10-11',
          created_at: createdAt,
          updated_at: now,
        })
        inserted++
      }
    }

    return Response.json({ action: 'merge-seed', totalRows: rows.length, updated, inserted, skippedBlank })
  }

  return Response.json({ error: 'unknown action' }, { status: 400 })
}
