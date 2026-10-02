// Pure DB functions for maia_conversations. No Claude calls.

import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { maia_conversations } from '@/db/schema'

export type ConversationAgent =
  | 'hub' | 'news' | 'calls' | 'linkedin' | 'social'
  | 'practice' | 'outreach' | 'study' | 'prospects' | 'pipeline'

export type MessageRole = 'maia' | 'user'
export type MessageType =
  | 'text' | 'draft' | 'news' | 'crm_notes' | 'flashcard'
  | 'morning_brief' | 'action_buttons' | 'news_brief' | 'news_card'

export interface ConversationMessage {
  id: string
  role: MessageRole
  type: MessageType
  content: string
  metadata?: Record<string, unknown>
  timestamp: number
  approved?: boolean
}

export async function getConversation(agent: ConversationAgent): Promise<ConversationMessage[]> {
  const [row] = await getDb()
    .select({ messages: maia_conversations.messages })
    .from(maia_conversations)
    .where(eq(maia_conversations.agent, agent))
    .limit(1)
  if (!row) return []
  try {
    const parsed = JSON.parse(row.messages) as unknown
    return Array.isArray(parsed) ? (parsed as ConversationMessage[]) : []
  } catch {
    return []
  }
}

// Upsert — the row is created on first message for a given agent.
export async function appendMessage(agent: ConversationAgent, message: ConversationMessage): Promise<void> {
  const db = getDb()
  const existing = await getConversation(agent)
  const updated = [...existing, message]
  const now = Math.floor(Date.now() / 1000)

  const [row] = await db
    .select({ id: maia_conversations.id })
    .from(maia_conversations)
    .where(eq(maia_conversations.agent, agent))
    .limit(1)

  if (row) {
    await db.update(maia_conversations)
      .set({ messages: JSON.stringify(updated), last_updated: now })
      .where(eq(maia_conversations.agent, agent))
  } else {
    await db.insert(maia_conversations).values({
      id: crypto.randomUUID(),
      agent,
      messages: JSON.stringify(updated),
      last_updated: now,
    })
  }
}

export async function appendMessages(agent: ConversationAgent, messages: ConversationMessage[]): Promise<void> {
  const db = getDb()
  const existing = await getConversation(agent)
  const updated = [...existing, ...messages]
  const now = Math.floor(Date.now() / 1000)

  const [row] = await db
    .select({ id: maia_conversations.id })
    .from(maia_conversations)
    .where(eq(maia_conversations.agent, agent))
    .limit(1)

  if (row) {
    await db.update(maia_conversations)
      .set({ messages: JSON.stringify(updated), last_updated: now })
      .where(eq(maia_conversations.agent, agent))
  } else {
    await db.insert(maia_conversations).values({
      id: crypto.randomUUID(),
      agent,
      messages: JSON.stringify(updated),
      last_updated: now,
    })
  }
}
