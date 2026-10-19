import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getProspectsForCompany } from '../../../../../../tools/map-db'

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const companyId = Number(req.nextUrl.searchParams.get('companyId'))
  if (!Number.isInteger(companyId)) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }
  const prospects = await getProspectsForCompany(companyId)
  return NextResponse.json({ prospects })
}
