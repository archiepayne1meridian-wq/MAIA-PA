import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { markPostPosted } from '../../../../../../tools/iris'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { postId } = await req.json().catch(() => ({})) as { postId?: string }
  if (!postId) {
    return NextResponse.json({ error: 'postId is required' }, { status: 400 })
  }

  await markPostPosted(postId)
  return NextResponse.json({ ok: true })
}
