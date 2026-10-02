// Marks a cassandra_items row as used — on a call, or sent as a LinkedIn post
// idea. The latter also appends the handoff message into the LinkedIn thread;
// the client is responsible for switching the active agent afterwards so
// Archie sees it land.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { markItemUsedOnCall, sendPostIdeaToLinkedin } from '@/lib/cassandra-handler'

type UsedAction = 'used_on_call' | 'post_idea'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId, action } = await req.json().catch(() => ({})) as { itemId?: string; action?: UsedAction }
  if (!itemId || !action) {
    return NextResponse.json({ error: 'itemId and action are required' }, { status: 400 })
  }

  try {
    if (action === 'used_on_call') {
      await markItemUsedOnCall(itemId)
      return NextResponse.json({ ok: true })
    }
    if (action === 'post_idea') {
      await sendPostIdeaToLinkedin(itemId)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 })
  } catch (err) {
    console.error('[cassandra/used] failed:', err)
    const message = err instanceof Error ? err.message : 'Failed to mark item used'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
