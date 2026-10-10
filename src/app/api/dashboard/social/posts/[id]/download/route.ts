import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getPostById } from '../../../../../../../../tools/social-db'
import { buildSlidesZip } from '@/lib/social-knowledge'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  try {
    const post = await getPostById(id)
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    const zipBuffer = await buildSlidesZip(post)
    const dateStr = post.created_at.slice(0, 10)

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="post_${dateStr}.zip"`,
        'Content-Length': String(zipBuffer.length),
      },
    })
  } catch (err) {
    console.error('[social/posts/[id]/download] failed:', err)
    return NextResponse.json({ error: 'Failed to build zip' }, { status: 500 })
  }
}
