import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getCaseWithEvents, updateCase } from '../../../../../../../tools/muse-cases'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const caseData = await getCaseWithEvents(id)
  if (!caseData) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ case: caseData })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const fields = await req.json().catch(() => ({})) as {
    display_name?: string
    company?: string | null
    location?: string | null
    occupation?: string | null
    financial_profile?: string | null
    status?: string
    outcome?: string | null
  }

  await updateCase(id, fields)
  const caseData = await getCaseWithEvents(id)
  if (!caseData) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ case: caseData })
}
