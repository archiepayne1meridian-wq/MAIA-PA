import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { iris_posts } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function PATCH(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    postId?: string
    impressions?: number
    likes?: number
    comments?: number
    reposts?: number
  }

  if (!body.postId) {
    return NextResponse.json({ error: 'postId is required' }, { status: 400 })
  }

  const db = getDb()
  const [post] = await db.select({ id: iris_posts.id }).from(iris_posts).where(eq(iris_posts.id, body.postId)).limit(1)
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  await db.update(iris_posts)
    .set({
      impressions: Math.max(0, Math.round(body.impressions ?? 0)),
      likes: Math.max(0, Math.round(body.likes ?? 0)),
      comments: Math.max(0, Math.round(body.comments ?? 0)),
      reposts: Math.max(0, Math.round(body.reposts ?? 0)),
    })
    .where(eq(iris_posts.id, body.postId))

  return NextResponse.json({ ok: true })
}
