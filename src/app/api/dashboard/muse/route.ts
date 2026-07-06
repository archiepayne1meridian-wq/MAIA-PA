import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getEntries } from '../../../../../tools/muse'
import { getDb } from '@/db'
import { muse_links } from '@/db/schema'

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sector = req.nextUrl.searchParams.get('sector') ?? undefined
  const entries = await getEntries(sector)

  let links: { id: string; entry_id_a: string; entry_id_b: string; link_type: string }[] = []
  if (!sector) {
    links = await getDb().select().from(muse_links)
  }

  return NextResponse.json({ entries, links })
}
