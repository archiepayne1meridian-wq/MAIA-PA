// Saves a winning phrase identified in a call analysis to MUSE as a reusable
// call-technique entry, and marks it saved on the call row so the UI doesn't
// offer to save it again.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getCall, markPhraseSaved } from '../../../../../../tools/apollo'
import { saveEntry, updateEntryTags } from '../../../../../../tools/muse'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { callId, phraseIndex, phrase } = await req.json().catch(() => ({})) as {
    callId?: string
    phraseIndex?: number
    phrase?: string
  }
  if (!callId || typeof phraseIndex !== 'number' || !phrase?.trim()) {
    return NextResponse.json({ error: 'callId, phraseIndex, and phrase are required' }, { status: 400 })
  }
  const call = await getCall(callId)
  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  const dateStr = new Date().toISOString().slice(0, 10)
  const now = Math.floor(Date.now() / 1000)

  const entryId = await saveEntry({
    sector: 'Training',
    title: `Winning phrase — ${dateStr}`,
    summary: phrase.trim(),
    content: phrase.trim(),
    brief_depth: 'simple',
    source: 'apollo',
    source_agent: 'APOLLO',
    status: 'active',
    date_filed: now,
    last_updated: now,
  })
  await updateEntryTags(entryId, ['call_technique', 'winning_phrase'])
  await markPhraseSaved(callId, phraseIndex)

  return NextResponse.json({ ok: true, entryId })
}
