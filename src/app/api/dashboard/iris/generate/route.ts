// Manual dashboard generation — generates a draft directly from a topic/idea
// and post type, bypassing the chat classifier. Superseded as the primary
// generation path by POST /api/dashboard/iris/chat, but kept working.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { generateDraft, type PostType } from '@/lib/iris'
import { getTodaysBrief, savePost, getCurrentDraft, supersedeDraft, saveChatMessage } from '../../../../../../tools/iris'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { ideaText, postType } = await req.json().catch(() => ({})) as {
    ideaText?: string
    postType?: PostType | 'auto'
  }

  try {
    const brief = await getTodaysBrief()
    const draft = await generateDraft({ topic: ideaText?.trim() || undefined, postType: postType ?? 'auto', todayAngle: brief })

    const current = await getCurrentDraft()
    if (current) await supersedeDraft(current.id)

    const now = new Date()
    const slot: 'morning' | 'evening' = now.getHours() < 13 ? 'morning' : 'evening'

    const postId = await savePost({
      slot,
      pillar: 1,
      topic: draft.topic,
      copy: draft.copy,
      status: 'draft',
      post_type: draft.postType,
    })
    await saveChatMessage('maia', "Here's a draft:", postId)

    return NextResponse.json({
      id: postId,
      post_type: draft.postType,
      topic: draft.topic,
      copy: draft.copy,
    })
  } catch (err) {
    console.error('[iris] manual generate failed:', err)
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
