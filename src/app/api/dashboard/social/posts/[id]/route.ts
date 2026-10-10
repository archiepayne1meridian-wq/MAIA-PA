import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getPostById, updatePost, deletePost, type SocialStatus } from '../../../../../../../tools/social-db'
import { slideImageUrl } from '@/lib/social-knowledge'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  try {
    const post = await getPostById(id)
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    const slides = JSON.parse(post.slides) as { slideNumber: number }[]
    const imageUrls: string[] = post.image_urls ? JSON.parse(post.image_urls) : []
    const imageCount = imageUrls.filter(Boolean).length

    return NextResponse.json({
      post: {
        ...post,
        slides,
        images: slides.map((s, i) => (imageUrls[i] ? slideImageUrl(id, s.slideNumber) : null)),
      },
      totalSlides: slides.length,
      imagesReady: imageCount,
    })
  } catch (err) {
    console.error('[social/posts/[id]] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load post' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const { status } = await req.json().catch(() => ({})) as { status?: SocialStatus }
  if (status !== 'draft' && status !== 'approved' && status !== 'posted') {
    return NextResponse.json({ error: "status must be 'draft', 'approved', or 'posted'" }, { status: 400 })
  }

  try {
    await updatePost(id, { status })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[social/posts/[id]] PATCH failed:', err)
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  try {
    await deletePost(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[social/posts/[id]] DELETE failed:', err)
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 })
  }
}
