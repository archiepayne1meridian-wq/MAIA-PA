import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { setEngagementSignal } from '../../../../../../tools/iris'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { postId, signal } = await req.json().catch(() => ({})) as { postId?: string; signal?: string | null }
  if (!postId) {
    return NextResponse.json({ error: 'postId is required' }, { status: 400 })
  }

  await setEngagementSignal(postId, signal ?? null)
  return NextResponse.json({ ok: true })
}
