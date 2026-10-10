import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { listProspects, addProspect, type WashFilter } from '../../../../../../tools/nexus-db'

const VALID_FILTERS: WashFilter[] = ['all', 'green', 'red', 'dnc', 'unwashed']

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const filterParam = searchParams.get('filter') ?? 'all'
  const filter: WashFilter = VALID_FILTERS.includes(filterParam as WashFilter) ? (filterParam as WashFilter) : 'all'

  try {
    const prospects = await listProspects(filter)
    return NextResponse.json({ prospects })
  } catch (err) {
    console.error('[nexus/prospects] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load prospects' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    last_name?: string; first_name?: string; company?: string; job_role?: string
    employment_status?: string; lead_channel?: string; country?: string
    linkedin_url?: string; wash_result?: string | null; batch?: string
  }

  if (!body.first_name?.trim() && !body.last_name?.trim()) {
    return NextResponse.json({ error: 'first_name or last_name required' }, { status: 400 })
  }

  try {
    const id = await addProspect(body)
    return NextResponse.json({ id })
  } catch (err) {
    console.error('[nexus/prospects] POST failed:', err)
    return NextResponse.json({ error: 'Failed to add prospect' }, { status: 500 })
  }
}
