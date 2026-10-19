import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getProspectsForCompany } from '../../../../../../tools/map-db'

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const company = req.nextUrl.searchParams.get('company')
  if (!company?.trim()) {
    return NextResponse.json({ error: 'company is required' }, { status: 400 })
  }
  const prospects = await getProspectsForCompany(company.trim())
  return NextResponse.json({ prospects })
}
