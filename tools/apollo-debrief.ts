// APOLLO debrief — per-call chat history + the cross-call coaching profile.
// No Claude calls here — that's src/lib/apollo-debrief.ts.

import { desc, eq, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { apollo_debrief_messages, apollo_coaching_profile } from '@/db/schema'

export interface DebriefMessage {
  id: string
  call_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: number
}

export async function getDebriefMessages(callId: string, limit = 20): Promise<DebriefMessage[]> {
  const rows = await getDb()
    .select()
    .from(apollo_debrief_messages)
    .where(eq(apollo_debrief_messages.call_id, callId))
    .orderBy(desc(sql`rowid`)) // true insertion order — see tools/iris.ts's getChatMessages for why, same fix applied up front here
    .limit(limit)
  return (rows as DebriefMessage[]).reverse()
}

export async function countDebriefMessages(callId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(apollo_debrief_messages)
    .where(eq(apollo_debrief_messages.call_id, callId))
  return row?.count ?? 0
}

export async function saveDebriefMessage(callId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  await getDb().insert(apollo_debrief_messages).values({
    id: crypto.randomUUID(),
    call_id: callId,
    role,
    content,
    created_at: Math.floor(Date.now() / 1000),
  })
}

export interface CoachingProfile {
  common_objections: { objection: string; count: number; what_works: string; what_doesnt: string }[]
  opener_notes: string
  what_lands: string[]
  what_kills_calls: string[]
  call_count: number
  last_updated: string
}

export const EMPTY_COACHING_PROFILE: CoachingProfile = {
  common_objections: [],
  opener_notes: '',
  what_lands: [],
  what_kills_calls: [],
  call_count: 0,
  last_updated: '',
}

export async function getCoachingProfile(): Promise<CoachingProfile> {
  const [row] = await getDb().select().from(apollo_coaching_profile).where(eq(apollo_coaching_profile.id, 'singleton')).limit(1)
  if (!row) return EMPTY_COACHING_PROFILE
  try {
    return { ...EMPTY_COACHING_PROFILE, ...JSON.parse(row.profile_json) as Partial<CoachingProfile> }
  } catch {
    return EMPTY_COACHING_PROFILE
  }
}

export async function saveCoachingProfile(profile: CoachingProfile): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await getDb()
    .insert(apollo_coaching_profile)
    .values({ id: 'singleton', profile_json: JSON.stringify(profile), updated_at: now })
    .onConflictDoUpdate({
      target: apollo_coaching_profile.id,
      set: { profile_json: JSON.stringify(profile), updated_at: now },
    })
}
