// Conversational chat endpoint for MERCURY's LinkedIn Messages / Quick
// Replies tabs. History is now persisted per tab in mercury_chat_messages —
// the server is the source of truth (loads history, saves every turn), not
// the client resending its own in-memory copy, so a refresh (or closing the
// browser entirely) doesn't lose it.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { runMercuryChat, type MercuryChatTab } from '@/lib/mercury'
import { getMercuryMessages, saveMercuryMessage } from '../../../../../../tools/mercury-chat'

function isValidTab(tab: unknown): tab is MercuryChatTab {
  return tab === 'linkedin_messages' || tab === 'quick_replies'
}

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tab = req.nextUrl.searchParams.get('tab')
  if (!isValidTab(tab)) {
    return NextResponse.json({ error: 'tab must be "linkedin_messages" or "quick_replies"' }, { status: 400 })
  }
  const messages = await getMercuryMessages(tab, 50)
  return NextResponse.json({ messages })
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tab, message } = await req.json().catch(() => ({})) as { tab?: MercuryChatTab; message?: string }

  if (!isValidTab(tab)) {
    return NextResponse.json({ error: 'tab must be "linkedin_messages" or "quick_replies"' }, { status: 400 })
  }
  if (!message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  try {
    await saveMercuryMessage(tab, 'user', message.trim())

    const recent = await getMercuryMessages(tab, 20)
    const history = recent.map(m => ({ role: m.role, content: m.content }))

    const reply = await runMercuryChat(tab, history)
    await saveMercuryMessage(tab, 'assistant', reply)

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[mercury:chat] failed:', err)
    const message2 = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message2 }, { status: 500 })
  }
}
