// POST /api/dashboard/map/company-summary — AI company intelligence brief.
// Generated once and cached forever in map_companies.ai_summary — returns
// the cached value immediately without a Claude call unless force:true
// (the panel's explicit "Refresh intel" button).

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { generateCompanySummary } from '@/lib/map'
import { getCompanyById, updateCompanySummary } from '../../../../../../tools/map-db'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, name, type, sector, area, force } = await req.json().catch(() => ({})) as {
    companyId?: number; name?: string; type?: string; sector?: string | null; area?: string | null; force?: boolean
  }
  if (!companyId || !name?.trim()) {
    return NextResponse.json({ error: 'companyId and name are required' }, { status: 400 })
  }

  try {
    if (!force) {
      const existing = await getCompanyById(companyId)
      if (existing?.ai_summary) {
        return NextResponse.json({ summary: existing.ai_summary })
      }
    }

    const summary = await generateCompanySummary(name.trim(), type ?? 'company', sector ?? null, area ?? null)
    await updateCompanySummary(companyId, summary)
    return NextResponse.json({ summary })
  } catch (err) {
    console.error('[map/company-summary] failed:', err)
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
  }
}
