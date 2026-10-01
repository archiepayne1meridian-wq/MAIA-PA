import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { iris_posts } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { refinePost, getVoiceLearnings } from '@/lib/iris'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    draftId?: string
    feedback?: string
  }

  if (!body.draftId || !body.feedback?.trim()) {
    return NextResponse.json({ error: 'draftId and feedback are required' }, { status: 400 })
  }

  const db = getDb()
  const [post] = await db.select().from(iris_posts).where(eq(iris_posts.id, body.draftId)).limit(1)
  if (!post) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  try {
    const voiceLearnings = await getVoiceLearnings(10)
    const newCopy = await refinePost({ currentDraft: post.copy, instruction: body.feedback.trim(), voiceLearnings })

    if (!newCopy) {
      return NextResponse.json({ error: 'Failed to generate refined copy' }, { status: 500 })
    }

    await db.update(iris_posts).set({ copy: newCopy }).where(eq(iris_posts.id, body.draftId))

    return NextResponse.json({ copy: newCopy })
  } catch (err) {
    console.error('[iris] refine route failed:', err)
    const message = err instanceof Error ? err.message : 'Refine failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
