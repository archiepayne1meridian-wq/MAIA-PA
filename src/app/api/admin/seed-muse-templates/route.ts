// TEMPORARY — one-shot production seed for MUSE's 22-template library.
// Delete this route once production's muse_templates table has been seeded
// (scripts/seed-muse-templates.ts only ran against local dev — Railway has its
// own separate DB volume with no rows yet). Same pattern as the HERMES seed
// route: MAIA_API_KEY Bearer auth (no CRON_SECRET exists in this codebase).

import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { getDb } from '@/db'
import { muse_templates } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { TEMPLATE_SEEDS } from '@/lib/muse-templates-data'

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

  for (const t of TEMPLATE_SEEDS) {
    const existing = await db
      .select({ id: muse_templates.id })
      .from(muse_templates)
      .where(eq(muse_templates.name, t.name))
      .limit(1)

    if (existing.length > 0) continue

    await db.insert(muse_templates).values({
      id: crypto.randomUUID(),
      name: t.name,
      category: t.category,
      scenario: t.scenario,
      angle: null,
      subject: t.subject ?? null,
      body: t.body,
      medium: t.medium,
    })
    inserted++
  }

  return Response.json({ inserted })
}
