// Server-side download proxy — only needed if image_url is ever a raw http(s)
// URL rather than the base64 data URI generateImage() currently always returns.
// Fetches the image server-side and forces Content-Disposition so the browser
// downloads it instead of navigating to it.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getPostById } from '../../../../../../tools/iris'

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const postId = req.nextUrl.searchParams.get('postId')
  if (!postId) {
    return NextResponse.json({ error: 'postId required' }, { status: 400 })
  }

  const post = await getPostById(postId)
  if (!post?.image_url) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  }
  if (!/^https?:\/\//i.test(post.image_url)) {
    return NextResponse.json({ error: 'Image is not a remote URL' }, { status: 400 })
  }

  const imageRes = await fetch(post.image_url)
  if (!imageRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 })
  }

  const buf = Buffer.from(await imageRes.arrayBuffer())
  const contentType = imageRes.headers.get('content-type') ?? 'image/png'
  const ext = contentType.includes('svg') ? 'svg' : contentType.includes('jpeg') ? 'jpg' : 'png'
  const dateStr = new Date(post.created_at * 1000).toISOString().slice(0, 10)

  return new NextResponse(buf, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="iris-post-${dateStr}.${ext}"`,
    },
  })
}
