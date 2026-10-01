// Single dispatch endpoint for the LinkedIn chat UI's free-text input — rough
// ideas, refinement instructions, and direct commands all come through here.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { dispatchChatMessage } from '@/lib/iris-handler'
import type { PostType } from '@/lib/iris'
import { getPostById } from '../../../../../../tools/iris'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { message, postType } = await req.json().catch(() => ({})) as {
    message?: string
    postType?: PostType | 'auto'
  }

  if (!message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  try {
    const result = await dispatchChatMessage(message.trim(), postType)

    if (result.kind === 'draft') {
      const post = await getPostById(result.postId)
      return NextResponse.json({ kind: 'draft', maiaMessage: result.maiaMessage, post })
    }

    if (result.maiaMessage === '__show_history__') {
      return NextResponse.json({ kind: 'show_history' })
    }

    return NextResponse.json({ kind: 'text', maiaMessage: result.maiaMessage })
  } catch (err) {
    console.error('[iris] chat dispatch failed:', err)
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
