import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { podcastPath } from '@/lib/athena-knowledge'
import fs from 'fs/promises'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ productId: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { productId } = await params

  try {
    const buffer = await fs.readFile(podcastPath(productId))
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Podcast audio not found' }, { status: 404 })
  }
}
