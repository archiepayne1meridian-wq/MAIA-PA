// Pure DB functions for IRIS. No Claude calls, no Slack calls.

import { desc, gte, eq, and } from 'drizzle-orm'
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
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const startOfToday = Math.floor(d.getTime() / 1000)
  const rows = await getDb()
    .select({ summary: research_briefs.summary })
    .from(research_briefs)
    .where(gte(research_briefs.created_at, startOfToday))
    .orderBy(desc(research_briefs.created_at))
    .limit(1)
  return rows[0]?.summary ?? null
}

// ─── CASSANDRA → IRIS signal detection ───────────────────────────────────────

// Patterns for postable LinkedIn moments. Only WHOLE-WORD / meaningful phrases
// to avoid matching section headers ("Regulatory" alone, "FX" table row, etc.).
const CASSANDRA_SIGNALS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bipo\b|\bfloated\b|\binitial public offer/i,                          label: 'IPO' },
  { pattern: /\brate (?:decision|cut|hike|hold)\b|\bfed funds rate\b|\bbase rate\b/i, label: 'Rate decision' },
  { pattern: /\bearnings?\b|\bprofit warning\b|\brevenue miss\b/i,                    label: 'Earnings' },
  { pattern: /\bnew (?:regulation|rule|guidance)\b|\bregulatory (?:change|update|ruling|fine|ban)\b/i, label: 'Regulatory change' },
  { pattern: /\bcrypto\b|\bbitcoin\b|\bbtc\b|\bethereum\b|\beth\b/i,                 label: 'Crypto' },
]

// Scan the CASSANDRA brief and save up to 3 strong signals as 'suggested' iris_posts.
// Never throws — errors are logged and swallowed.
export async function flagIrisTopics(brief: string): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000)
    let flagCount = 0

    for (const signal of CASSANDRA_SIGNALS) {
      if (flagCount >= 3) break
      const m = signal.pattern.exec(brief)
      if (!m) continue

      const snippet = brief
        .slice(Math.max(0, m.index - 30), Math.min(brief.length, m.index + 120))
        .replace(/\n/g, ' ')
        .trim()
      const topic = `${signal.label}: ${snippet.slice(0, 100)}`

      await getDb().insert(iris_posts).values({
        id: crypto.randomUUID(),
        slot: '',
        pillar: 1,
        topic,
        copy: '',
        image_prompt: null,
        image_url: null,
        format: null,
        status: 'suggested',
        slack_ts: null,
        created_at: now,
      })

      console.log(`[iris] flagged topic: ${topic}`)
      flagCount++
    }
  } catch (err) {
    console.error('[iris] flagIrisTopics failed:', err)
  }
}

// Return the earliest 'suggested' iris_post from today, or null if none.
// Called by buildScheduledDraft before falling back to the topic bank.
export async function getSuggestedTopic(): Promise<IrisPost | null> {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const startOfToday = Math.floor(d.getTime() / 1000)

  const rows = await getDb()
    .select()
    .from(iris_posts)
    .where(and(eq(iris_posts.status, 'suggested'), gte(iris_posts.created_at, startOfToday)))
    .orderBy(iris_posts.created_at)
    .limit(1)

  const row = rows[0]
  if (!row) return null
  return row as IrisPost
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
