// APOLLO — pure DB functions for apollo_calls. No Claude calls, no Whisper calls.

import { desc, eq, gte, and, isNotNull } from 'drizzle-orm'
import { getDb } from '@/db'
import { apollo_calls } from '@/db/schema'

export type CallOutcome = 'booked' | 'follow_up' | 'drop'
export type CallStage = 'opener' | 'fact_find' | 'enlarge' | 'disturb' | 'close' | 'completed'

export interface ApolloCall {
  id: string
  call_date: string
  prospect_name: string | null
  transcript: string | null
  intelligence_json: string | null
  advisor_brief: string | null   // crm_notes
  client_email: string | null    // confirmation_email
  muse_brief_id: string | null
  muse_email_id: string | null
  muse_case_id: string | null
  coaching_insight: string | null
  outcome: string | null
  stage_reached: string | null
  filler_words_json: string | null
  winning_phrases_json: string | null
  saved_phrase_indices_json: string
  follow_up_notes: string | null
  follow_up_date: string | null
  drop_reason: string | null
  prospect_quality: string | null
  call_summary: string | null
  reminder_set: number
  reminder_type: string | null
  reminder_date: string | null
  email_sent: number
  dropped: number
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

// Only calls that have gone all the way through analysis — the thread shows
// completed call cards, not in-progress uploads (those are client-side only).
export async function getAnalysedCalls(limit = 20): Promise<ApolloCall[]> {
  const rows = await getDb()
    .select()
    .from(apollo_calls)
    .where(isNotNull(apollo_calls.outcome))
    .orderBy(desc(apollo_calls.created_at))
    .limit(limit)
  return rows as ApolloCall[]
}

export async function setReminder(id: string, type: 'show_up' | 'follow_up', date: string | null): Promise<void> {
  await getDb().update(apollo_calls)
    .set({ reminder_set: 1, reminder_type: type, reminder_date: date })
    .where(eq(apollo_calls.id, id))
}

export async function confirmDrop(id: string): Promise<void> {
  await getDb().update(apollo_calls).set({ dropped: 1 }).where(eq(apollo_calls.id, id))
}

export async function markEmailSent(id: string): Promise<void> {
  await getDb().update(apollo_calls).set({ email_sent: 1 }).where(eq(apollo_calls.id, id))
}

export async function markPhraseSaved(id: string, phraseIndex: number): Promise<void> {
  const call = await getCall(id)
  if (!call) return
  let saved: number[] = []
  try { saved = JSON.parse(call.saved_phrase_indices_json) as number[] } catch { /* ignore */ }
  if (!saved.includes(phraseIndex)) saved.push(phraseIndex)
  await getDb().update(apollo_calls).set({ saved_phrase_indices_json: JSON.stringify(saved) }).where(eq(apollo_calls.id, id))
}

// ─── Context panel stats ──────────────────────────────────────────────────────

export async function getCallbacksDue(): Promise<{ id: string; prospect_name: string | null; follow_up_date: string | null }[]> {
  const rows = await getDb()
    .select({ id: apollo_calls.id, prospect_name: apollo_calls.prospect_name, follow_up_date: apollo_calls.follow_up_date })
    .from(apollo_calls)
    .where(and(eq(apollo_calls.outcome, 'follow_up'), isNotNull(apollo_calls.follow_up_date)))
    .orderBy(apollo_calls.follow_up_date)
    .limit(10)
  return rows
}

export async function getRecentWinningPhrases(limit = 5): Promise<string[]> {
  const rows = await getDb()
    .select({ winning_phrases_json: apollo_calls.winning_phrases_json })
    .from(apollo_calls)
    .where(isNotNull(apollo_calls.winning_phrases_json))
    .orderBy(desc(apollo_calls.created_at))
    .limit(limit * 2)
  const phrases: string[] = []
  for (const row of rows) {
    if (!row.winning_phrases_json) continue
    try {
      const arr = JSON.parse(row.winning_phrases_json) as string[]
      phrases.push(...arr)
    } catch { /* ignore */ }
    if (phrases.length >= limit) break
  }
  return phrases.slice(0, limit)
}

// Filler word counts for calls on a given date — used for today-vs-yesterday
// trend comparison in the context panel.
export async function getFillerWordsForDate(dateStr: string): Promise<Record<string, number>> {
  const rows = await getDb()
    .select({ filler_words_json: apollo_calls.filler_words_json })
    .from(apollo_calls)
    .where(and(eq(apollo_calls.call_date, dateStr), isNotNull(apollo_calls.filler_words_json)))
  const totals: Record<string, number> = {}
  for (const row of rows) {
    if (!row.filler_words_json) continue
    try {
      const counts = JSON.parse(row.filler_words_json) as Record<string, number>
      for (const [key, val] of Object.entries(counts)) totals[key] = (totals[key] ?? 0) + val
    } catch { /* ignore */ }
  }
  return totals
}

export async function getCallsSince(sinceSecs: number): Promise<ApolloCall[]> {
  const rows = await getDb()
    .select()
    .from(apollo_calls)
    .where(gte(apollo_calls.created_at, sinceSecs))
    .orderBy(desc(apollo_calls.created_at))
  return rows as ApolloCall[]
}
