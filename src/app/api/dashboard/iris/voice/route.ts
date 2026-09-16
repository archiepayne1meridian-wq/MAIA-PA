import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getTopVoiceLearnings, resetVoiceLearnings } from '../../../../../../tools/iris'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const learnings = await getTopVoiceLearnings(10)
  return NextResponse.json({ learnings })
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { action } = await req.json().catch(() => ({})) as { action?: string }
  if (action !== 'reset') {
    return NextResponse.json({ error: 'action must be "reset"' }, { status: 400 })
  }
  await resetVoiceLearnings()
  return NextResponse.json({ ok: true })
}
