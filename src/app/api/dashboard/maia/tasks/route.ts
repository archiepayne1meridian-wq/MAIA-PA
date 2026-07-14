import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getActiveTasks, saveTasks, completeTask, getDailyNonNegotiables } from '../../../../../../tools/maia-voice'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const [tasks, nonNegotiables] = await Promise.all([getActiveTasks(), getDailyNonNegotiables()])
  return NextResponse.json({ tasks, nonNegotiables })
}

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as { title?: string; dueDate?: string }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 })
  }
  await saveTasks([{ title: body.title.trim(), dueDate: body.dueDate, source: 'manual' }])
  const tasks = await getActiveTasks()
  return NextResponse.json({ tasks })
}

export async function PATCH(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as { id?: string }
  if (!body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  await completeTask(body.id)
  const tasks = await getActiveTasks()
  return NextResponse.json({ tasks })
}
