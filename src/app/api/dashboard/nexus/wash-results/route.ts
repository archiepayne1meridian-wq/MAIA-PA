// POST /api/dashboard/nexus/wash-results — rich, Claude-based wash sheet
// import. Two-mode pattern (preview then confirm), same as parse-salesnav
// and parse-wash: first call parses the paste and returns candidates for
// Archie to review; a second call with confirm:true commits them. Richer
// than import-wash-paste (which stays in place, unlinked, as the old
// deterministic 3-column fallback) because this reads the Comments column
// to tell DNC / another advisor's client / pool conflict / redlisted
// company apart, rather than collapsing them all into "Red".

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { parseWashResultsRich, type WashResultCandidate, type WashCategory } from '@/lib/nexus'
import { getAllNamesLower, applyWashCategoryUpgrade } from '../../../../../../tools/nexus-db'

// The paste carries no date column — today's date is the correct "date
// washed" for a result being processed right now. Same convention as
// import-wash-paste's todayFormatted.
function todayFormatted(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    text?: string
    confirm?: boolean
    candidates?: WashResultCandidate[]
  }

  try {
    if (body.confirm) {
      const matched = (body.candidates ?? []).filter(c => c.matched && c.id)
      const unmatched = (body.candidates ?? []).filter(c => !c.matched).map(c => c.name)
      const dateWashed = todayFormatted()

      const counts: Record<WashCategory, number> = {
        ok_to_contact: 0, dnc: 0, others_client: 0, pool_conflict: 0, redlisted_company: 0,
      }

      await Promise.all(matched.map(async c => {
        const applied = await applyWashCategoryUpgrade(c.id!, {
          category: c.category,
          reason: c.reason,
          conflictingAdvisor: c.conflictingAdvisor,
          dateWashed,
        })
        if (applied) counts[c.category]++
      }))

      return NextResponse.json({
        matched: matched.length,
        unmatched,
        ok_to_contact: counts.ok_to_contact,
        dnc: counts.dnc,
        others_client: counts.others_client,
        pool_conflict: counts.pool_conflict,
        redlisted_company: counts.redlisted_company,
      })
    }

    if (!body.text?.trim()) {
      return NextResponse.json({ error: 'text required' }, { status: 400 })
    }

    const existing = await getAllNamesLower()
    const candidates = await parseWashResultsRich(body.text, existing)

    return NextResponse.json({
      candidates,
      found: candidates.length,
      matched: candidates.filter(c => c.matched).length,
    })
  } catch (err) {
    console.error('[nexus/wash-results] failed:', err)
    const message = err instanceof Error ? err.message : 'Failed to process the wash sheet paste'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
