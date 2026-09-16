import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { approvePost, getTopVoiceLearnings, incrementLearningsApplied } from '../../../../../../tools/iris'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { postId } = await req.json().catch(() => ({})) as { postId?: string }
  if (!postId) {
    return NextResponse.json({ error: 'postId is required' }, { status: 400 })
  }

  await approvePost(postId)

  // The learnings this draft was generated with are, in practice, the current
  // top-10 (generateDraft() reads the same query) — see incrementLearningsApplied's
  // doc comment for why there's no per-post learning-id tracking.
  const learnings = await getTopVoiceLearnings(10)
  await incrementLearningsApplied(learnings.map(l => l.id))

  return NextResponse.json({ ok: true })
}
