// GET /api/dashboard/hub-rail-previews — one live preview string per agent
// (where a live source exists; see src/lib/hub-rail-preview.ts), fetched
// once by AgentRailNew on mount and merged over hub-agents.ts's static
// fallback text.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { buildRailPreviews } from '@/lib/hub-rail-preview'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const previews = await buildRailPreviews()
  return NextResponse.json({ previews })
}
