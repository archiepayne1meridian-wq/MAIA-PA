import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { handleCassandraChat } from '@/lib/cassandra-handler'
import { appendMessages, type ConversationMessage } from '../../../../../../tools/maia-conversations'
import type { ChatTurn } from '@/lib/cassandra'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { content, history } = await req.json().catch(() => ({})) as { content?: string; history?: ChatTurn[] }
  if (!content?.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const userMessage: ConversationMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    type: 'text',
    content: content.trim(),
    timestamp: Math.floor(Date.now() / 1000),
  }

  try {
    const turns: ChatTurn[] = [...(history ?? []), { role: 'user', content: content.trim() }]
    const { text, ranFreshSearch } = await handleCassandraChat(turns)
    console.log(`[cassandra/chat] ranFreshSearch=${ranFreshSearch}`)

    const maiaMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'maia',
      type: 'text',
      content: text,
      metadata: { ranFreshSearch },
      timestamp: Math.floor(Date.now() / 1000),
    }

    await appendMessages('news', [userMessage, maiaMessage])
    return NextResponse.json({ messages: [userMessage, maiaMessage] })
  } catch (err) {
    console.error('[cassandra/chat] failed:', err)
    const message = err instanceof Error ? err.message : 'Failed to respond'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
