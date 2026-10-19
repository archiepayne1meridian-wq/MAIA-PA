import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getCompaniesWithStats, addCompany } from '../../../../../../tools/map-db'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const companies = await getCompaniesWithStats()
  return NextResponse.json({ companies })
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as {
    name?: string; type?: string; sector?: string | null; employees_est?: number | null
    lat?: number; lng?: number; area?: string | null; hq_location?: string | null
    swiss_offices?: string[]; office_type?: string
  }
  if (!body.name?.trim() || typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return NextResponse.json({ error: 'name, lat, and lng are required' }, { status: 400 })
  }
  const id = await addCompany({
    name: body.name.trim(), type: body.type, sector: body.sector, employees_est: body.employees_est,
    lat: body.lat, lng: body.lng, area: body.area, hq_location: body.hq_location,
    swiss_offices: body.swiss_offices, office_type: body.office_type,
  })
  return NextResponse.json({ id })
}
