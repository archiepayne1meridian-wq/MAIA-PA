// POST /api/dashboard/nexus/parse-wash — same two-mode pattern as parse-salesnav.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { parseWashResults, type WashUpdateCandidate } from '@/lib/nexus'
import { getAllNamesLower, updateProspect } from '../../../../../../tools/nexus-db'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    text?: string
    confirm?: boolean
    candidates?: WashUpdateCandidate[]
  }

  try {
    if (body.confirm) {
      const matched = (body.candidates ?? []).filter(c => c.matched && c.id)
      await Promise.all(matched.map(c => updateProspect(c.id!, { wash_result: c.washResult })))
      const green = matched.filter(c => c.washResult === 'Green').length
      const red = matched.filter(c => c.washResult === 'Red').length
      const dnc = matched.filter(c => c.washResult === 'Do Not Contact').length
      return NextResponse.json({ updated: matched.length, green, red, dnc })
    }

    if (!body.text?.trim()) {
      return NextResponse.json({ error: 'text required' }, { status: 400 })
    }

    const existing = await getAllNamesLower()
    const candidates = parseWashResults(body.text, existing)
    const matchedCount = candidates.filter(c => c.matched).length

    return NextResponse.json({
      candidates,
      found: candidates.length,
      matched: matchedCount,
      unmatched: candidates.length - matchedCount,
      green: candidates.filter(c => c.matched && c.washResult === 'Green').length,
      red: candidates.filter(c => c.matched && c.washResult === 'Red').length,
      dnc: candidates.filter(c => c.matched && c.washResult === 'Do Not Contact').length,
    })
  } catch (err) {
    console.error('[nexus/parse-wash] failed:', err)
    return NextResponse.json({ error: 'Failed to process paste' }, { status: 500 })
  }
}
