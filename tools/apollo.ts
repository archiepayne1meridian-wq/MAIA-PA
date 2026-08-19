// APOLLO — pure DB functions for apollo_calls. No Claude calls, no Whisper calls.

import { desc, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { apollo_calls } from '@/db/schema'

export interface ApolloCall {
  id: string
  call_date: string
  prospect_name: string | null
  transcript: string | null
  intelligence_json: string | null
  advisor_brief: string | null
  client_email: string | null
  muse_transcript_id: string | null
  muse_brief_id: string | null
  muse_email_id: string | null
  muse_case_id: string | null
  created_at: number
}

export async function saveCall(
  data: { call_date: string; transcript: string; prospect_name?: string | null },
): Promise<string> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(apollo_calls).values({
    id,
    call_date: data.call_date,
    prospect_name: data.prospect_name ?? null,
    transcript: data.transcript,
    created_at: now,
  })
  return id
}

export async function updateCall(
  id: string,
  fields: Partial<Omit<ApolloCall, 'id' | 'created_at'>>,
): Promise<void> {
  await getDb().update(apollo_calls).set(fields).where(eq(apollo_calls.id, id))
}

export async function getCall(id: string): Promise<ApolloCall | null> {
  const rows = await getDb().select().from(apollo_calls).where(eq(apollo_calls.id, id)).limit(1)
  return (rows[0] as ApolloCall) ?? null
}

export async function getRecentCalls(limit = 10): Promise<ApolloCall[]> {
  const rows = await getDb()
    .select()
    .from(apollo_calls)
    .orderBy(desc(apollo_calls.created_at))
    .limit(limit)
  return rows as ApolloCall[]
}
