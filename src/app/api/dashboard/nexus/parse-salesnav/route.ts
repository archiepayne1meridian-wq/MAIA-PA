// POST /api/dashboard/nexus/parse-salesnav
// Two modes in one route (no server-side "pending preview" state to manage):
//   { text } → preview only, returns parsed candidates + duplicate flags
//   { confirm: true, candidates } → inserts exactly the given candidates
// The client re-sends the reviewed candidate list back on confirm — simpler
// than persisting a half-finished import server-side between the two steps.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { parseSalesNav, type SalesNavCandidate } from '@/lib/nexus'
import { getAllNamesLower, addProspectsBulk, recordImport } from '../../../../../../tools/nexus-db'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    text?: string
    confirm?: boolean
    candidates?: SalesNavCandidate[]
  }

  try {
    if (body.confirm) {
      const all = body.candidates ?? []
      const toAdd = all.filter(c => !c.isDuplicate)
      const skipped = all.length - toAdd.length
      const flagged = toAdd.filter(c => c.flagged).length
      const added = await addProspectsBulk(toAdd.map(c => ({
        first_name: c.firstName,
        last_name: c.lastName,
        company: c.company,
        job_role: c.jobRole,
        flagged: c.flagged,
        batch: `salesnav-${new Date().toISOString().slice(0, 10)}`,
      })))
      await recordImport(added, skipped)
      return NextResponse.json({ added, skipped, flagged })
    }

    if (!body.text?.trim()) {
      return NextResponse.json({ error: 'text required' }, { status: 400 })
    }

    const existing = await getAllNamesLower()
    const candidates = parseSalesNav(body.text, existing)
    const duplicateCount = candidates.filter(c => c.isDuplicate).length

    return NextResponse.json({
      candidates,
      found: candidates.length,
      duplicates: duplicateCount,
      readyToAdd: candidates.length - duplicateCount,
    })
  } catch (err) {
    console.error('[nexus/parse-salesnav] failed:', err)
    return NextResponse.json({ error: 'Failed to process paste' }, { status: 500 })
  }
}
