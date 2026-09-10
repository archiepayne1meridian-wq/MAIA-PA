import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { listScenarios, createScenario, type ScenarioInput } from '../../../../../../tools/hermes-db'

// ── GET /api/dashboard/hermes/scenarios ─────────────────────────────────────
// Returns the full scenario list.

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const scenarios = await listScenarios()
  return NextResponse.json({ scenarios })
}

// ── POST /api/dashboard/hermes/scenarios ────────────────────────────────────
// Body: ScenarioInput. Creates a new blank/custom scenario ("+ New Scenario").

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as Partial<ScenarioInput>

  const input: ScenarioInput = {
    name: body.name ?? 'New Scenario',
    angle: body.angle ?? null,
    opener: body.opener ?? '',
    fact_find_questions: body.fact_find_questions ?? [],
    enlarge_points: body.enlarge_points ?? [],
    disturb_points: body.disturb_points ?? [],
    product_pathway: body.product_pathway ?? '',
    product_questions: body.product_questions ?? [],
    close_script: body.close_script ?? '',
    soft_landing: body.soft_landing ?? '',
    objections: body.objections ?? [],
  }

  const scenario = await createScenario(input)
  return NextResponse.json({ scenario })
}
