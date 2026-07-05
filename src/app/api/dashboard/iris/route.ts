import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getRecentPosts, getVoicePreferences, updatePostStatus } from '../../../../../tools/iris'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const [posts, preferences] = await Promise.all([
    getRecentPosts(7),
    getVoicePreferences(),
  ])
  const draft = posts.find(p => p.status === 'draft') ?? null
  return NextResponse.json({ posts, draft, preferences })
}

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, action } = await req.json().catch(() => ({})) as { id?: string; action?: string }
  if (!id || action !== 'approve') {
    return NextResponse.json({ error: 'id and action=approve required' }, { status: 400 })
  }
  await updatePostStatus(id, 'approved')
  return NextResponse.json({ ok: true })
}
