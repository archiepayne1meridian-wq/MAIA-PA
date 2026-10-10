// Not in the literal route list given, but necessary plumbing: the carousel
// needs some way to actually display each slide image in the browser, and
// storing them as files on disk (per spec) means something has to stream
// them back — same role as ATHENA's podcast route and IRIS's hero-image route.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { slideImagePath } from '@/lib/social-knowledge'
import fs from 'fs/promises'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; slideNumber: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, slideNumber } = await params
  const n = Number(slideNumber)
  if (!Number.isInteger(n) || n < 1) {
    return NextResponse.json({ error: 'Invalid slide number' }, { status: 400 })
  }

  try {
    const buffer = await fs.readFile(slideImagePath(id, n))
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Slide image not found' }, { status: 404 })
  }
}
