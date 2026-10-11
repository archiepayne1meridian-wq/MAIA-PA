// Conversational chat endpoint for MERCURY's LinkedIn Messages / Quick
// Replies tabs — the client keeps the full message history and resends it
// each turn; this route just picks the right system prompt + model and asks
// Claude for the next reply.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { runMercuryChat, type MercuryChatTab, type MercuryChatMessage } from '@/lib/mercury'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tab, messages } = await req.json().catch(() => ({})) as {
    tab?: MercuryChatTab
    messages?: MercuryChatMessage[]
  }

  if (tab !== 'linkedin_messages' && tab !== 'quick_replies') {
    return NextResponse.json({ error: 'tab must be "linkedin_messages" or "quick_replies"' }, { status: 400 })
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 })
  }

  try {
    const reply = await runMercuryChat(tab, messages)
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[mercury:chat] failed:', err)
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
