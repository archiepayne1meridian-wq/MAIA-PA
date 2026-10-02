import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getConversation, appendMessage, appendMessages, type ConversationAgent, type ConversationMessage } from '../../../../../../tools/maia-conversations'
import { buildMorningBriefMessage, handleHubMessage } from '@/lib/maia-hub-handler'
import { ensureTodaysBriefInThread, handleCassandraChat } from '@/lib/cassandra-handler'
import type { ChatTurn } from '@/lib/cassandra'
import { getCurrentDraft } from '../../../../../../tools/iris'

const VALID_AGENTS = new Set<ConversationAgent>([
  'hub', 'news', 'calls', 'linkedin', 'social', 'practice', 'outreach', 'study', 'prospects', 'pipeline',
])

function isValidAgent(agent: string): agent is ConversationAgent {
  return VALID_AGENTS.has(agent as ConversationAgent)
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function isToday(timestamp: number): boolean {
  return new Date(timestamp * 1000).toISOString().slice(0, 10) === todayDateString()
}

// First-load auto-population, one per agent that has something real to show.
// Each is independent and never throws past this point — a failure here should
// degrade to "no auto message" rather than breaking the whole thread load.
async function autoPopulate(agent: ConversationAgent, existing: ConversationMessage[]): Promise<ConversationMessage[]> {
  if (agent === 'hub') {
    const alreadyBriefedToday = existing.some(m => m.type === 'morning_brief' && isToday(m.timestamp))
    if (alreadyBriefedToday) return []
    try {
      const brief = await buildMorningBriefMessage()
      await appendMessage(agent, brief)
      return [brief]
    } catch (err) {
      console.error('[conversations/hub] morning brief auto-populate failed:', err)
      return []
    }
  }

  if (agent === 'news') {
    try {
      // ensureTodaysBriefInThread does its own "already briefed today" check
      // and appends the messages itself — this is a fallback for when the
      // 7am cron hasn't fired yet (or failed), not the primary path.
      return await ensureTodaysBriefInThread()
    } catch (err) {
      console.error('[conversations/news] auto-brief failed:', err)
      return []
    }
  }

  if (agent === 'linkedin') {
    try {
      const draft = await getCurrentDraft()
      if (!draft) return []
      const alreadyReferenced = existing.some(m => m.type === 'draft' && m.metadata?.draftPostId === draft.id)
      if (alreadyReferenced) return []
      const draftMsg: ConversationMessage = {
        id: crypto.randomUUID(),
        role: 'maia',
        type: 'draft',
        content: draft.copy,
        metadata: { platformTag: 'LINKEDIN DRAFT', postType: draft.post_type, draftPostId: draft.id },
        timestamp: Math.floor(Date.now() / 1000),
      }
      await appendMessage(agent, draftMsg)
      return [draftMsg]
    } catch (err) {
      console.error('[conversations/linkedin] draft auto-populate failed:', err)
      return []
    }
  }

  return []
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { agent } = await params
  if (!isValidAgent(agent)) {
    return NextResponse.json({ error: 'Unknown agent' }, { status: 400 })
  }

  try {
    const existing = await getConversation(agent)
    const added = await autoPopulate(agent, existing)
    const messages = added.length > 0 ? [...existing, ...added] : existing
    return NextResponse.json({ messages })
  } catch (err) {
    console.error(`[conversations/${agent}] GET failed:`, err)
    const message = err instanceof Error ? err.message : 'Failed to load conversation'
    return NextResponse.json({ error: message }, { status: 500 })
  }
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

    if (agent === 'news') {
      // Prior plain-text exchanges today become chat history context; news_brief/
      // news_card messages are structured data, not conversational turns, so they're
      // excluded here — handleCassandraChat is given today's items separately.
      const existingBefore = await getConversation(agent)
      const history: ChatTurn[] = existingBefore
        .filter(m => m.type === 'text')
        .map(m => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.content }))
      history.push({ role: 'user', content: content.trim() })

      const { text } = await handleCassandraChat(history)
      const maiaMessage: ConversationMessage = {
        id: crypto.randomUUID(),
        role: 'maia',
        type: 'text',
        content: text,
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
