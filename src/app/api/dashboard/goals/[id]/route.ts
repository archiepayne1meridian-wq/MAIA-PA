import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { updateGoal, deleteGoal } from '../../../../../../tools/goals'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const { goal_text, completed } = await req.json().catch(() => ({})) as {
    goal_text?: string
    completed?: number
  }
  if (goal_text === undefined && completed === undefined) {
    return NextResponse.json({ error: 'goal_text or completed required' }, { status: 400 })
  }
  await updateGoal(id, {
    ...(goal_text !== undefined ? { goal_text } : {}),
    ...(completed !== undefined ? { completed } : {}),
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  await deleteGoal(id)
  return NextResponse.json({ ok: true })
}
