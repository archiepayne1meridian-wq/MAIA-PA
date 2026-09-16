import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { analyseEdit } from '@/lib/iris'
import { saveEditedPost, saveVoiceLearning } from '../../../../../../tools/iris'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { postId, originalContent, editedContent } = await req.json().catch(() => ({})) as {
    postId?: string
    originalContent?: string
    editedContent?: string
  }

  if (!postId || typeof originalContent !== 'string' || typeof editedContent !== 'string') {
    return NextResponse.json({ error: 'postId, originalContent, and editedContent are required' }, { status: 400 })
  }

  try {
    const learnings = originalContent.trim() === editedContent.trim()
      ? []
      : await analyseEdit(originalContent, editedContent)

    const editNotes = learnings.map(l => l.learning).join('; ')
    await saveEditedPost(postId, editedContent, originalContent, editNotes)

    for (const l of learnings) {
      await saveVoiceLearning(l.learning, l.before, l.after)
    }

    return NextResponse.json({ ok: true, learnings: learnings.map(l => l.learning) })
  } catch (err) {
    console.error('[iris] edit route failed:', err)
    const message = err instanceof Error ? err.message : 'Edit tracking failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
