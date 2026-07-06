// Pure DB functions for MERCURY. No Claude calls, no Slack calls.

import { desc, gte, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { mercury_drafts } from '@/db/schema'

export interface MercuryDraft {
  id: string
  medium: string
  context: string
  incoming_message: string | null
  draft: string
  status: string
  slack_ts: string | null
  created_at: number
}

export async function saveDraft(
  medium: string,
  context: string,
  draft: string,
  incoming?: string,
  slack_ts?: string,
): Promise<string> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(mercury_drafts).values({
    id,
    medium,
    context,
    incoming_message: incoming ?? null,
    draft,
    status: 'draft',
    slack_ts: slack_ts ?? null,
    created_at: now,
  })
  return id
}

export async function updateDraftStatus(id: string, status: string): Promise<void> {
  await getDb().update(mercury_drafts).set({ status }).where(eq(mercury_drafts.id, id))
}

export async function updateDraftContent(id: string, draft: string): Promise<void> {
  await getDb().update(mercury_drafts).set({ draft }).where(eq(mercury_drafts.id, id))
}

export async function updateDraftSlackTs(id: string, slack_ts: string): Promise<void> {
  await getDb().update(mercury_drafts).set({ slack_ts }).where(eq(mercury_drafts.id, id))
}

export async function getRecentDrafts(days: number): Promise<MercuryDraft[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400
  const rows = await getDb()
    .select()
    .from(mercury_drafts)
    .where(gte(mercury_drafts.created_at, since))
    .orderBy(desc(mercury_drafts.created_at))
  return rows as MercuryDraft[]
}

export async function getActiveDraft(slack_ts: string): Promise<MercuryDraft | null> {
  const rows = await getDb()
    .select()
    .from(mercury_drafts)
    .where(eq(mercury_drafts.slack_ts, slack_ts))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return row as MercuryDraft
}
