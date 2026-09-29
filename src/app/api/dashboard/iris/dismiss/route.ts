// Dismisses an IRIS draft as not relevant — new capability, no equivalent existed
// before (approve/posted/skipped were the only status transitions). Feeds MAIA's
// pattern-detection tracker: 3+ dismissals surface as a proposed preference.
import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { updatePostStatus, getPostById } from '../../../../../../tools/iris'
import { trackRejection } from '@/lib/preferences'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { postId } = await req.json().catch(() => ({})) as { postId?: string }
  if (!postId) {
    return NextResponse.json({ error: 'postId is required' }, { status: 400 })
  }

  const post = await getPostById(postId)
  if (!post) {
    return NextResponse.json({ error: 'post not found' }, { status: 404 })
  }

  await updatePostStatus(postId, 'dismissed')

  const result = await trackRejection('irrelevant_topic', 'iris', `Dismissed IRIS draft as not relevant: "${post.topic}"`)

  return NextResponse.json({ ok: true, proposalTriggered: result.shouldPropose })
}
