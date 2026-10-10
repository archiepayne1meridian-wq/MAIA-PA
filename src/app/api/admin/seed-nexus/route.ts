// TEMPORARY — seeds the 379 existing prospects (NEXUS_Prospect_Tracker.xlsx,
// Master List sheet) to production. Delete this route once the seed has run
// and been verified; same pattern used for the earlier HERMES/MUSE/CII seeds.

import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { getDb } from '@/db'
import { nexus_prospects } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { NEXUS_SEED } from '@/lib/nexus-seed-data'

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization') ?? ''
  const apiKey = env.MAIA_API_KEY()

  if (!apiKey) {
    return new Response('Service unavailable — MAIA_API_KEY not configured', { status: 503 })
  }

  const expected = `Bearer ${apiKey}`
  const valid = (() => {
    try {
      const a = Buffer.from(expected, 'utf8')
      const b = Buffer.from(authHeader.padEnd(expected.length, '\0').slice(0, expected.length), 'utf8')
      return authHeader.length === expected.length && timingSafeEqual(a, b)
    } catch { return false }
  })()

  if (!valid) return new Response('Unauthorized', { status: 401 })

  const db = getDb()
  let inserted = 0
  let skipped = 0
  const batch = `initial-seed-${new Date().toISOString().slice(0, 10)}`

  for (const p of NEXUS_SEED) {
    const existing = await db.select({ id: nexus_prospects.id }).from(nexus_prospects)
      .where(and(eq(nexus_prospects.first_name, p.firstName), eq(nexus_prospects.last_name, p.lastName)))
      .limit(1)

    if (existing.length > 0) {
      skipped++
      continue
    }

    await db.insert(nexus_prospects).values({
      id: crypto.randomUUID(),
      first_name: p.firstName || null,
      last_name: p.lastName || null,
      job_role: p.jobRole || null,
      company: p.company || null,
      linkedin_url: p.linkedinUrl || null,
      wash_result: p.washResult,
      batch,
    })
    inserted++
  }

  return Response.json({ inserted, skipped, total: NEXUS_SEED.length })
}
