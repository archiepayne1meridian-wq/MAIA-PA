import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { updateScenario, deleteScenario, type ScenarioInput } from '../../../../../../../tools/hermes-db'

// ── PATCH /api/dashboard/hermes/scenarios/[id] ──────────────────────────────
// Body: Partial<ScenarioInput>. Used by the autosave loop — only changed
// fields need to be sent.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const patch = await req.json().catch(() => ({})) as Partial<ScenarioInput>

  const scenario = await updateScenario(id, patch)
  if (!scenario) {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 })
  }
  return NextResponse.json({ scenario })
}

// ── DELETE /api/dashboard/hermes/scenarios/[id] ─────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  await deleteScenario(id)
  return NextResponse.json({ ok: true })
}
