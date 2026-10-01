import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getGoals, addGoal } from '../../../../../tools/goals'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const goals = await getGoals()
  return NextResponse.json({
    short_term: goals.filter(g => g.goal_type === 'short_term'),
    long_term: goals.filter(g => g.goal_type === 'long_term'),
  })
}

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { goal_text, goal_type } = await req.json().catch(() => ({})) as {
    goal_text?: string
    goal_type?: 'short_term' | 'long_term'
  }
  if (!goal_text?.trim() || (goal_type !== 'short_term' && goal_type !== 'long_term')) {
    return NextResponse.json({ error: 'goal_text and goal_type (short_term|long_term) are required' }, { status: 400 })
  }
  const goal = await addGoal(goal_text.trim(), goal_type)
  return NextResponse.json({ goal })
}
