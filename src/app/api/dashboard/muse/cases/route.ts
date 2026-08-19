import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getRecentCases, searchCases, createCase } from '../../../../../../tools/muse-cases'

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = req.nextUrl.searchParams.get('q')?.trim()
  const cases = q ? await searchCases(q) : await getRecentCases(20)
  return NextResponse.json({ cases })
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { display_name, company, location, occupation, financial_profile } = await req.json().catch(() => ({})) as {
    display_name?: string
    company?: string
    location?: string
    occupation?: string
    financial_profile?: string
  }

  if (!display_name?.trim()) {
    return NextResponse.json({ error: 'display_name required' }, { status: 400 })
  }

  const id = await createCase({
    display_name: display_name.trim(),
    company: company?.trim() || null,
    location: location?.trim() || null,
    occupation: occupation?.trim() || null,
    financial_profile: financial_profile?.trim() || null,
  })

  return NextResponse.json({ id })
}
