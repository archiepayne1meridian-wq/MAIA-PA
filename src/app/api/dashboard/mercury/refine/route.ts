import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { generateDraft, type MercuryMedium } from '@/lib/mercury'
import { getRecentDrafts, updateDraftContent } from '../../../../../../tools/mercury'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { draftId, feedback } = await req.json().catch(() => ({})) as {
    draftId?: string
    feedback?: string
  }

  if (!draftId || !feedback) {
    return NextResponse.json({ error: 'draftId and feedback required' }, { status: 400 })
  }

  // Load the draft to get medium/context/incoming
  const all = await getRecentDrafts(7)
  const draft = all.find(d => d.id === draftId)
  if (!draft) {
    return NextResponse.json({ error: 'draft not found' }, { status: 404 })
  }

  try {
    const result = await generateDraft(
      draft.medium as MercuryMedium,
      draft.context,
      draft.incoming_message ?? undefined,
      feedback,
    )
    await updateDraftContent(draftId, result.body)
    return NextResponse.json({ id: draftId, subject: result.subject, body: result.body, status: 'draft' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
