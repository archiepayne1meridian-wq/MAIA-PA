import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { hermes_script } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { DEFAULT_PERSONAS, DEFAULT_SHARED, DEFAULT_OBJECTIONS } from '@/lib/hermes-default-script'

const SINGLETON_ID = 'singleton'

// ── GET /api/dashboard/hermes/script ────────────────────────────────────────
// Returns { personas, shared, objections } — from the DB row if present,
// otherwise the locked default script.

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const [row] = await db.select().from(hermes_script).where(eq(hermes_script.id, SINGLETON_ID)).limit(1)

  if (!row) {
    return NextResponse.json({ personas: DEFAULT_PERSONAS, shared: DEFAULT_SHARED, objections: DEFAULT_OBJECTIONS })
  }

  return NextResponse.json({
    personas: row.personas_json ? JSON.parse(row.personas_json) : DEFAULT_PERSONAS,
    shared: row.shared_json ? JSON.parse(row.shared_json) : DEFAULT_SHARED,
    objections: row.objections_json ? JSON.parse(row.objections_json) : DEFAULT_OBJECTIONS,
  })
}

// ── POST /api/dashboard/hermes/script ───────────────────────────────────────
// Body: { personas?, shared?, objections? } — partial update supported.
// Upserts the singleton row.

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    personas?: unknown
    shared?: unknown
    objections?: unknown
  }

  const db = getDb()
  const [existing] = await db.select().from(hermes_script).where(eq(hermes_script.id, SINGLETON_ID)).limit(1)

  const personas_json = body.personas !== undefined
    ? JSON.stringify(body.personas)
    : existing?.personas_json ?? JSON.stringify(DEFAULT_PERSONAS)
  const shared_json = body.shared !== undefined
    ? JSON.stringify(body.shared)
    : existing?.shared_json ?? JSON.stringify(DEFAULT_SHARED)
  const objections_json = body.objections !== undefined
    ? JSON.stringify(body.objections)
    : existing?.objections_json ?? JSON.stringify(DEFAULT_OBJECTIONS)

  await db.insert(hermes_script)
    .values({ id: SINGLETON_ID, personas_json, shared_json, objections_json, updated_at: Math.floor(Date.now() / 1000) })
    .onConflictDoUpdate({
      target: hermes_script.id,
      set: { personas_json, shared_json, objections_json, updated_at: Math.floor(Date.now() / 1000) },
    })

  return NextResponse.json({ ok: true })
}
