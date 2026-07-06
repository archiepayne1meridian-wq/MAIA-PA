import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { content } = await req.json().catch(() => ({})) as { content?: string }

  if (!content) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }

  // Stub — processInput (Claude Haiku) wired in Step 3
  return NextResponse.json({
    status: 'stub',
    message: 'Brain dump pipeline will be available from Step 3. Input received.',
    pendingIds: [],
  })
}
