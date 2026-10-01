import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getConversation, appendMessage, appendMessages, type ConversationAgent, type ConversationMessage } from '../../../../../../tools/maia-conversations'
import { buildMorningBriefMessage, handleHubMessage } from '@/lib/maia-hub-handler'

const VALID_AGENTS = new Set<ConversationAgent>([
  'hub', 'news', 'calls', 'linkedin', 'social', 'practice', 'outreach', 'study', 'prospects', 'pipeline',
])

function isValidAgent(agent: string): agent is ConversationAgent {
  return VALID_AGENTS.has(agent as ConversationAgent)
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { agent } = await params
  if (!isValidAgent(agent)) {
    return NextResponse.json({ error: 'Unknown agent' }, { status: 400 })
  }

  let messages = await getConversation(agent)

  // Hub gets exactly one morning-brief card per calendar day, injected lazily
  // on first load rather than via a separate cron — simplest way to guarantee
  // it reflects whatever's true the moment Archie actually opens the dashboard.
  if (agent === 'hub') {
    const todayStr = todayDateString()
    const alreadyBriefedToday = messages.some(m =>
      m.type === 'morning_brief' && new Date(m.timestamp * 1000).toISOString().slice(0, 10) === todayStr,
    )
    if (!alreadyBriefedToday) {
      const brief = await buildMorningBriefMessage()
      await appendMessage(agent, brief)
      messages = [...messages, brief]
    }
  }

  return NextResponse.json({ messages })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { agent } = await params
  if (!isValidAgent(agent)) {
    return NextResponse.json({ error: 'Unknown agent' }, { status: 400 })
  }

  const { content } = await req.json().catch(() => ({})) as { content?: string }
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
    if (agent === 'hub') {
      const { replyText } = await handleHubMessage(content.trim())
      const maiaMessage: ConversationMessage = {
        id: crypto.randomUUID(),
        role: 'maia',
        type: 'text',
        content: replyText,
        timestamp: Math.floor(Date.now() / 1000),
      }
      await appendMessages(agent, [userMessage, maiaMessage])
      return NextResponse.json({ messages: [userMessage, maiaMessage] })
    }

    // Other agents' real conversation logic isn't connected yet (next phase) —
    // persist the message and say so plainly rather than fabricating a reply.
    const stubMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'maia',
      type: 'text',
      content: "Noted — this agent's conversation logic isn't connected yet.",
      timestamp: Math.floor(Date.now() / 1000),
    }
    await appendMessages(agent, [userMessage, stubMessage])
    return NextResponse.json({ messages: [userMessage, stubMessage] })
  } catch (err) {
    console.error(`[conversations/${agent}] POST failed:`, err)
    const message = err instanceof Error ? err.message : 'Failed to send message'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
