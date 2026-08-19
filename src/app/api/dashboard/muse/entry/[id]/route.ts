import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getEntry, updateEntryFields } from '../../../../../../../tools/muse'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const entry = await getEntry(id)
  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ entry })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { content, title, sector } = await req.json().catch(() => ({})) as {
    content?: string
    title?: string
    sector?: string
  }

  if (content === undefined && title === undefined && sector === undefined) {
    return NextResponse.json({ error: 'At least one of content, title, sector required' }, { status: 400 })
  }

  try {
    await updateEntryFields(id, { content, title, sector })
    const entry = await getEntry(id)
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ entry })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
