// GET/POST /api/dashboard/apollo/global-chat — the pinned chat bar at the
// bottom of the Calls page. One global thread (apollo_global_chat_messages),
// not scoped per call — replaces the old per-call DebriefChat entirely.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getGlobalChatMessages, saveGlobalChatMessage } from '../../../../../../tools/apollo-global-chat'
import { getAnalysedCalls } from '../../../../../../tools/apollo'
import { answerGlobalChat } from '@/lib/apollo-global-chat'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const messages = await getGlobalChatMessages(50)
  return NextResponse.json({ messages })
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { message } = await req.json().catch(() => ({})) as { message?: string }
  if (!message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  try {
    const [history, recentCalls] = await Promise.all([getGlobalChatMessages(50), getAnalysedCalls(50)])
    await saveGlobalChatMessage('user', message.trim())
    const reply = await answerGlobalChat(recentCalls, history, message.trim())
    await saveGlobalChatMessage('assistant', reply)
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[apollo/global-chat] failed:', err)
    const msg = err instanceof Error ? err.message : 'Chat failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
