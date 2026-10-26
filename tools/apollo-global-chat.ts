// APOLLO — global chat thread (not scoped per call). Pure DB access.

import { getDb } from '@/db'
import { apollo_global_chat_messages } from '@/db/schema'
import { asc } from 'drizzle-orm'

export interface GlobalChatMessage { role: 'user' | 'assistant'; content: string }

export async function getGlobalChatMessages(limit = 50): Promise<GlobalChatMessage[]> {
  const rows = await getDb().select().from(apollo_global_chat_messages).orderBy(asc(apollo_global_chat_messages.created_at)).limit(limit)
  return rows.map(r => ({ role: r.role as 'user' | 'assistant', content: r.content }))
}

export async function saveGlobalChatMessage(role: 'user' | 'assistant', content: string): Promise<void> {
  await getDb().insert(apollo_global_chat_messages).values({ id: crypto.randomUUID(), role, content })
}
