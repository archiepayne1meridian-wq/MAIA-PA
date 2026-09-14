// Live auto-tag preview for the Add Knowledge form — same autoTag() classifier
// file-direct uses at save time, exposed here so the UI can show the tags
// before the user commits, without duplicating the keyword table client-side.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { autoTag } from '@/lib/muse'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { title, content } = await req.json().catch(() => ({})) as { title?: string; content?: string }
  const tags = autoTag(content ?? '', title ?? '')
  return NextResponse.json({ tags })
}
