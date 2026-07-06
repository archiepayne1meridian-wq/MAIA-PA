import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { generateDraft, type MercuryMedium } from '@/lib/mercury'
import { saveDraft } from '../../../../../../tools/mercury'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { medium, context, incomingMessage } = await req.json().catch(() => ({})) as {
    medium?: string
    context?: string
    incomingMessage?: string
  }

  if (!medium || !context) {
    return NextResponse.json({ error: 'medium and context required' }, { status: 400 })
  }

  try {
    const result = await generateDraft(medium as MercuryMedium, context, incomingMessage)
    const id = await saveDraft(medium, context, result.body, incomingMessage)
    return NextResponse.json({ id, subject: result.subject, body: result.body, medium, status: 'draft' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
