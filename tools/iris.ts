// Pure DB functions for IRIS. No Claude calls, no Slack calls.

import { desc, gte, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { iris_posts, voice_preferences, research_briefs } from '@/db/schema'

export interface IrisPost {
  id: string
  slot: string
  pillar: number
  topic: string
  copy: string
  image_prompt: string | null
  image_url: string | null
  format: string | null
  status: string
  slack_ts: string | null
  created_at: number
}

export interface VoicePref {
  id: string
  preference_type: string
  value: string
  source: string
  created_at: number
}

export async function getRecentTopics(days: number): Promise<string[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400
  const rows = await getDb()
    .select({ topic: iris_posts.topic })
    .from(iris_posts)
    .where(gte(iris_posts.created_at, since))
    .orderBy(desc(iris_posts.created_at))
  return rows.map(r => r.topic)
}

export async function getPillarBalance(): Promise<Record<number, number>> {
  const rows = await getDb()
    .select({ pillar: iris_posts.pillar })
    .from(iris_posts)
    .orderBy(desc(iris_posts.created_at))
    .limit(10)
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
  for (const r of rows) {
    const p = r.pillar as 1 | 2 | 3
    counts[p] = (counts[p] ?? 0) + 1
  }
  return counts
}

export async function getLastThreePillars(): Promise<number[]> {
  const rows = await getDb()
    .select({ pillar: iris_posts.pillar })
    .from(iris_posts)
    .orderBy(desc(iris_posts.created_at))
    .limit(3)
  return rows.map(r => r.pillar)
}

export async function savePost(
  post: Omit<IrisPost, 'id' | 'created_at'>,
): Promise<string> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(iris_posts).values({
    id,
    slot: post.slot,
    pillar: post.pillar,
    topic: post.topic,
    copy: post.copy,
    image_prompt: post.image_prompt ?? null,
    image_url: post.image_url ?? null,
    format: post.format ?? null,
    status: post.status,
    slack_ts: post.slack_ts ?? null,
    created_at: now,
  })
  return id
}

export async function updatePostStatus(id: string, status: string): Promise<void> {
  await getDb().update(iris_posts).set({ status }).where(eq(iris_posts.id, id))
}

export async function updatePostSlackTs(id: string, slack_ts: string): Promise<void> {
  await getDb().update(iris_posts).set({ slack_ts }).where(eq(iris_posts.id, id))
}

export async function getActiveIrisDraft(slack_ts: string): Promise<IrisPost | null> {
  const rows = await getDb()
    .select()
    .from(iris_posts)
    .where(eq(iris_posts.slack_ts, slack_ts))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return row as IrisPost
}

export async function getVoicePreferences(): Promise<VoicePref[]> {
  const rows = await getDb()
    .select()
    .from(voice_preferences)
    .orderBy(desc(voice_preferences.created_at))
  return rows as VoicePref[]
}

export async function saveVoicePreference(
  preference_type: string,
  value: string,
  source: string,
): Promise<void> {
  await getDb().insert(voice_preferences).values({
    id: crypto.randomUUID(),
    preference_type,
    value,
    source,
    created_at: Math.floor(Date.now() / 1000),
  })
}

export async function getTodaysBrief(): Promise<string | null> {
  const since = Math.floor(Date.now() / 1000) - 86400
  const rows = await getDb()
    .select({ summary: research_briefs.summary })
    .from(research_briefs)
    .where(gte(research_briefs.created_at, since))
    .orderBy(desc(research_briefs.created_at))
    .limit(1)
  return rows[0]?.summary ?? null
}

export async function getRecentPosts(days: number): Promise<IrisPost[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400
  const rows = await getDb()
    .select()
    .from(iris_posts)
    .where(gte(iris_posts.created_at, since))
    .orderBy(desc(iris_posts.created_at))
  return rows as IrisPost[]
}
