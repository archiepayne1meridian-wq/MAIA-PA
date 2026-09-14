// Lightweight "what does MUSE know about this" lookup — used by HERMES's
// Related Knowledge panel (and available to any other agent wanting the same).
// Tier 1 only: this is a read surface, never an AI call, but the entries
// returned are titles/ids that get displayed straight in another agent's UI —
// keeping it Tier-1-only means a locked entry never leaks into that context.
//
// Callers pass free text (e.g. a HERMES scenario's name + angle), not MUSE tag
// slugs directly — those are two different vocabularies. This route bridges
// them by running the same autoTag() classifier used when filing an entry, so
// "New to Switzerland" (scenario) and an entry tagged 'new-to-switzerland' (from
// autoTag on its own content) actually meet in the middle.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getEntriesByTags } from '../../../../../../tools/muse'
import { autoTag } from '@/lib/muse'

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const text = req.nextUrl.searchParams.get('text') ?? ''
  const limitParam = req.nextUrl.searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) || 3 : 3

  const tags = autoTag(text, '')
  if (tags.length === 0) {
    return NextResponse.json({ entries: [] })
  }

  const entries = await getEntriesByTags(tags, limit)
  return NextResponse.json({
    entries: entries.map(e => ({ id: e.id, title: e.title, sector: e.sector })),
  })
}
