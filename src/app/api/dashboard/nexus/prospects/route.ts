import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { listProspects, getStats, addProspect, type WashFilter } from '../../../../../../tools/nexus-db'
import { getAllCompanyNameVariants } from '../../../../../../tools/map-db'

const VALID_FILTERS: WashFilter[] = ['all', 'green', 'red', 'dnc', 'unwashed']

const norm = (s: string | null | undefined): string => (s ?? '').toLowerCase().trim()

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const filterParam = searchParams.get('filter') ?? 'all'
  const filter: WashFilter = VALID_FILTERS.includes(filterParam as WashFilter) ? (filterParam as WashFilter) : 'all'

  try {
    const [prospects, stats, companyVariants] = await Promise.all([listProspects(filter), getStats(), getAllCompanyNameVariants()])
    const knownCompanyNames = new Set(companyVariants.map(v => norm(v.variant)))

    // "On the map" is computed here, not stored — it only ever reflects the
    // live map_companies table, never goes stale from an edit on either side.
    const prospectsWithMapFlag = prospects.map(p => ({
      ...p,
      company_on_map: !p.company?.trim() ? null : knownCompanyNames.has(norm(p.company)),
    }))

    return NextResponse.json({
      prospects: prospectsWithMapFlag,
      totals: { total: stats.total, green: stats.green, red: stats.red, dnc: stats.dnc, unwashed: stats.unwashed },
    })
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
    linkedin_url?: string; email?: string; phone?: string
    wash_result?: string | null; wash_reason?: string; date_washed?: string; rewash_after?: string; notes?: string
    batch?: string
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
