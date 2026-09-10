import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { hermes_script } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { DEFAULT_PERSONAS, DEFAULT_SHARED, DEFAULT_OBJECTIONS } from '@/lib/hermes-default-script'
import { listScenarios, getTodayCallAngle, matchScenarioToAngle, extractCompanyName } from '../../../../../../tools/hermes-db'

const SINGLETON_ID = 'singleton'

// ── GET /api/dashboard/hermes/script ────────────────────────────────────────
// Returns { personas, shared, objections, scenarios, todayAngle,
// matchedScenarioId } — the legacy singleton fields plus the scenario bank
// bundled together, so the workspace can bootstrap everything in one request.

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const [row] = await db.select().from(hermes_script).where(eq(hermes_script.id, SINGLETON_ID)).limit(1)

  const legacy = row
    ? {
        personas: row.personas_json ? JSON.parse(row.personas_json) : DEFAULT_PERSONAS,
        shared: row.shared_json ? JSON.parse(row.shared_json) : DEFAULT_SHARED,
        objections: row.objections_json ? JSON.parse(row.objections_json) : DEFAULT_OBJECTIONS,
      }
    : { personas: DEFAULT_PERSONAS, shared: DEFAULT_SHARED, objections: DEFAULT_OBJECTIONS }

  const scenarios = await listScenarios()
  const todayAngle = await getTodayCallAngle()
  const matchedScenarioId = matchScenarioToAngle(scenarios, todayAngle)

  // Restructuring scenario's opener carries a "[at company name / in your
  // sector]" placeholder — best-effort fill it in when today's angle matches
  // it and a company name can be confidently extracted (see extractCompanyName).
  let scenariosOut = scenarios
  if (matchedScenarioId === 'restructuring-job-loss' && todayAngle) {
    const company = extractCompanyName(todayAngle)
    if (company) {
      scenariosOut = scenarios.map(sc =>
        sc.id === matchedScenarioId
          ? { ...sc, opener: sc.opener.replace('[at company name / in your sector]', `at ${company}`) }
          : sc,
      )
    }
  }

  return NextResponse.json({ ...legacy, scenarios: scenariosOut, todayAngle, matchedScenarioId })
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
