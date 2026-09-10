// TEMPORARY — one-shot production seed for HERMES's scenario bank.
// Delete this route once production's hermes_scenarios table has been seeded
// (scripts/seed-hermes-scenarios.ts only ran against local dev — Railway has
// its own separate DB volume with no rows yet).
//
// Auth: reuses MAIA_API_KEY (same Bearer pattern as /api/cron/iris and every
// other cron/admin route) rather than a new CRON_SECRET — no such var exists
// anywhere in this codebase, and inventing one would mean asking for a manual
// Railway dashboard step before this route could even be called.

import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { getDb } from '@/db'
import { hermes_scenarios } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { ALL_SEED_SCENARIOS } from '@/lib/hermes-scenarios-data'

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

  for (const scenario of ALL_SEED_SCENARIOS) {
    const existing = await db
      .select({ id: hermes_scenarios.id })
      .from(hermes_scenarios)
      .where(eq(hermes_scenarios.id, scenario.id))
      .limit(1)

    if (existing.length > 0) continue

    await db.insert(hermes_scenarios).values({
      id: scenario.id,
      name: scenario.name,
      angle: scenario.angle,
      opener: scenario.opener,
      fact_find_questions: JSON.stringify(scenario.fact_find_questions),
      enlarge_points: JSON.stringify(scenario.enlarge_points),
      disturb_points: JSON.stringify(scenario.disturb_points),
      product_pathway: scenario.product_pathway,
      product_questions: JSON.stringify(scenario.product_questions),
      close_script: scenario.close_script,
      soft_landing: scenario.soft_landing,
      objections: JSON.stringify(scenario.objections),
      active: 1,
    })
    inserted++
  }

  return Response.json({ inserted })
}
