import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { extractStyleReference } from '@/lib/iris'
import { getPostById, saveVoiceLearning } from '../../../../../../tools/iris'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { postId } = await req.json().catch(() => ({})) as { postId?: string }
  if (!postId) {
    return NextResponse.json({ error: 'postId is required' }, { status: 400 })
  }

  const post = await getPostById(postId)
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const learnings = await extractStyleReference(post.copy)
  for (const l of learnings) {
    await saveVoiceLearning(l.learning, null, l.after)
  }

  return NextResponse.json({ ok: true, learnings: learnings.map(l => l.learning) })
}
