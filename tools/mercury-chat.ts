// MERCURY chat persistence — one row per message, scoped by tab. No Claude
// calls here — that's runMercuryChat in src/lib/mercury.ts.

import { desc, eq, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { mercury_chat_messages } from '@/db/schema'
import type { MercuryChatTab, MercuryChatMessage } from '@/lib/mercury'

export interface StoredMercuryMessage extends MercuryChatMessage {
  id: string
  created_at: number
}

export async function getMercuryMessages(tab: MercuryChatTab, limit = 50): Promise<StoredMercuryMessage[]> {
  const rows = await getDb()
    .select()
    .from(mercury_chat_messages)
    .where(eq(mercury_chat_messages.tab, tab))
    // rowid, not created_at — same reasoning as iris_chat_messages/
    // apollo_debrief_messages: second-granularity timestamps collide easily
    // on a fast back-and-forth, rowid is SQLite's true insertion order.
    .orderBy(desc(sql`rowid`))
    .limit(limit)
  return (rows as StoredMercuryMessage[]).reverse()
}

export async function saveMercuryMessage(tab: MercuryChatTab, role: 'user' | 'assistant', content: string): Promise<void> {
  await getDb().insert(mercury_chat_messages).values({
    id: crypto.randomUUID(),
    tab,
    role,
    content,
    created_at: Math.floor(Date.now() / 1000),
  })
}
