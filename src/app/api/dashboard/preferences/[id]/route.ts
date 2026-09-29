import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { updatePreferenceValue, deletePreference } from '@/lib/preferences'

// PATCH — update a preference's rule_value (inline edit).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const { rule_value } = await req.json().catch(() => ({})) as { rule_value?: string }
  if (!rule_value?.trim()) {
    return NextResponse.json({ error: 'rule_value is required' }, { status: 400 })
  }
  await updatePreferenceValue(id, rule_value.trim())
  return NextResponse.json({ ok: true })
}

// DELETE — remove a preference.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  await deletePreference(id)
  return NextResponse.json({ ok: true })
}
