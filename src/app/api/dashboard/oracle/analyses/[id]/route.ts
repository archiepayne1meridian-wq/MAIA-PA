import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getAnalysis } from '../../../../../../../tools/oracle'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const row = await getAnalysis(id)
  if (!row) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })

  return NextResponse.json({
    id: row.id,
    prospect_name: row.prospect_name,
    current_employer: row.current_employer,
    current_role: row.current_role,
    current_location: row.current_location,
    muse_case_id: row.muse_case_id,
    created_at: row.created_at,
    analysis: JSON.parse(row.analysis_json),
  })
}
