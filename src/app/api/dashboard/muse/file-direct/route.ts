// Dashboard-first filing — no approval loop. The user picked the sector, wrote context,
// and clicked submit: they know what they're filing. Saves straight to muse_entries with
// status: 'active'. The existing pending/approvals flow (auto-harvest, Slack brain dumps,
// Slack "file this") is untouched — this is a second, deliberate-filing path alongside it.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { generateDirectFiling, autoTag, findRelatedEntries } from '@/lib/muse'
import { saveEntry, saveLink, getEntryIdsByTitles, getAllEntryTitles, updateEntryTags, updateEntryLinkedEntries } from '../../../../../../tools/muse'

function inferDepth(content: string): 'simple' | 'medium' | 'detailed' {
  if (content.length < 1000) return 'simple'
  if (content.length < 4000) return 'medium'
  return 'detailed'
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { content, sector, title, context, entryType, privacyTier, sourceScenario, tags: tagsOverride } = await req.json().catch(() => ({})) as {
    content?: string
    sector?: string
    title?: string
    context?: string
    entryType?: string
    privacyTier?: 1 | 2
    sourceScenario?: string
    tags?: string[]
  }

  if (!content?.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }
  if (!sector?.trim()) {
    return NextResponse.json({ error: 'sector required' }, { status: 400 })
  }

  try {
    const existingTitles = await getAllEntryTitles()
    const meta = await generateDirectFiling(content, context, existingTitles)

    const finalTitle = title?.trim() || meta.title
    const now = Math.floor(Date.now() / 1000)
    const tags = Array.isArray(tagsOverride) ? tagsOverride : autoTag(content, finalTitle)

    const entryId = await saveEntry({
      sector,
      title: finalTitle,
      summary: meta.summary,
      content,
      brief_depth: inferDepth(content),
      source: entryType === 'case' ? 'dashboard_direct_case' : 'dashboard_direct',
      source_agent: null,
      status: 'active',
      date_filed: now,
      last_updated: now,
      privacy_tier: privacyTier === 2 ? 2 : 1,
      entry_type: entryType ?? 'knowledge',
      source_scenario: sourceScenario ?? null,
    })

    await updateEntryTags(entryId, tags)

    let linkedTitles: string[] = []
    if (meta.links.length > 0) {
      const resolved = await getEntryIdsByTitles(meta.links)
      await Promise.all(resolved.map(r => saveLink(entryId, r.id, 'related')))
      linkedTitles = resolved.map(r => r.title)
    }

    // Auto-link via tag overlap, alongside the LLM-suggested title links above —
    // findRelatedEntries only considers Tier 1 entries, so a Tier 2 filing never
    // gets auto-linked to (or discovered from) other entries this way.
    const relatedIds = await findRelatedEntries(entryId, tags, 5)
    if (relatedIds.length > 0) {
      await updateEntryLinkedEntries(entryId, relatedIds)
    }

    return NextResponse.json({ id: entryId, title: finalTitle, sector, links: linkedTitles, tags })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Filing failed'
    console.error('[muse] file-direct failed:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
