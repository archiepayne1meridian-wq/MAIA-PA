import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { listPosts, type SocialStatus } from '../../../../../../tools/social-db'
import { slideImageUrl } from '@/lib/social-knowledge'

const VALID_STATUSES = new Set<SocialStatus>(['draft', 'approved', 'posted'])

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const statusParam = req.nextUrl.searchParams.get('status')
  const status = statusParam && VALID_STATUSES.has(statusParam as SocialStatus) ? (statusParam as SocialStatus) : undefined

  try {
    const posts = await listPosts(status)
    const withThumbnails = posts.map(p => {
      const imageUrls: string[] = p.image_urls ? JSON.parse(p.image_urls) : []
      return {
        ...p,
        slides: JSON.parse(p.slides),
        thumbnailUrl: imageUrls[0] ? slideImageUrl(p.id, 1) : null,
      }
    })
    return NextResponse.json({ posts: withThumbnails })
  } catch (err) {
    console.error('[social/posts] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load posts' }, { status: 500 })
  }
}
