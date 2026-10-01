// Pure DB functions for IRIS. No Claude calls, no Slack calls.

import { desc, gte, eq, and } from 'drizzle-orm'
import { getDb } from '@/db'
import { iris_posts, voice_preferences, research_briefs, iris_voice_learnings, iris_chat_messages, maia_preferences } from '@/db/schema'

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
  impressions: number
  likes: number
  comments: number
  reposts: number
  user_edited: number
  edit_delta: string | null
  edit_notes: string | null
  approved: number
  post_type: string | null
  engagement_signal: string | null
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

type SavePostInput = Pick<IrisPost, 'slot' | 'pillar' | 'topic' | 'copy' | 'status'> &
  Partial<Pick<IrisPost, 'image_prompt' | 'image_url' | 'format' | 'slack_ts' | 'post_type'>>

export async function savePost(post: SavePostInput): Promise<string> {
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
    post_type: post.post_type ?? null,
    created_at: now,
  })
  return id
}

// ─── Voice learning loop ────────────────────────────────────────────────────

export interface VoiceLearning {
  id: string
  learning: string
  example_before: string | null
  example_after: string | null
  applied_count: number
  created_at: number
}

export async function getTopVoiceLearnings(limit = 10): Promise<VoiceLearning[]> {
  const rows = await getDb()
    .select()
    .from(iris_voice_learnings)
    .orderBy(desc(iris_voice_learnings.applied_count))
    .limit(limit)
  return rows as VoiceLearning[]
}

export async function saveVoiceLearning(
  learning: string,
  exampleBefore: string | null,
  exampleAfter: string | null,
): Promise<string> {
  const id = crypto.randomUUID()
  await getDb().insert(iris_voice_learnings).values({
    id,
    learning,
    example_before: exampleBefore,
    example_after: exampleAfter,
  })
  return id
}

// Increments applied_count on the learnings a draft was generated with. There's
// no column tracking exactly which learning IDs fed a given generation, so this
// takes the current top-N (the same query generateDraft() itself reads) as the
// practical proxy — correct in the normal flow where approval follows
// generation within the same session, before any new learnings are added.
export async function incrementLearningsApplied(learningIds: string[]): Promise<void> {
  for (const id of learningIds) {
    const [existing] = await getDb().select().from(iris_voice_learnings).where(eq(iris_voice_learnings.id, id)).limit(1)
    if (existing) {
      await getDb().update(iris_voice_learnings).set({ applied_count: existing.applied_count + 1 }).where(eq(iris_voice_learnings.id, id))
    }
  }
}

export async function resetVoiceLearnings(): Promise<void> {
  await getDb().delete(iris_voice_learnings)
}

// ─── Edit tracking, approval, engagement ────────────────────────────────────

export async function saveEditedPost(
  id: string,
  editedContent: string,
  originalContent: string,
  editNotes: string,
): Promise<void> {
  await getDb().update(iris_posts).set({
    copy: editedContent,
    user_edited: 1,
    edit_delta: JSON.stringify({ original: originalContent, edited: editedContent }),
    edit_notes: editNotes,
  }).where(eq(iris_posts.id, id))
}

export async function approvePost(id: string): Promise<void> {
  await getDb().update(iris_posts).set({ approved: 1, status: 'approved' }).where(eq(iris_posts.id, id))
}

export async function markPostPosted(id: string): Promise<void> {
  await getDb().update(iris_posts).set({ status: 'posted' }).where(eq(iris_posts.id, id))
}

export async function setEngagementSignal(id: string, signal: string | null): Promise<void> {
  await getDb().update(iris_posts).set({ engagement_signal: signal }).where(eq(iris_posts.id, id))
}

export async function getApprovedPosts(limit = 7): Promise<IrisPost[]> {
  const rows = await getDb()
    .select()
    .from(iris_posts)
    .where(eq(iris_posts.approved, 1))
    .orderBy(desc(iris_posts.created_at))
    .limit(limit)
  return rows as IrisPost[]
}

export async function updatePostStatus(id: string, status: string): Promise<void> {
  await getDb().update(iris_posts).set({ status }).where(eq(iris_posts.id, id))
}

export async function updatePostSlackTs(id: string, slack_ts: string): Promise<void> {
  await getDb().update(iris_posts).set({ slack_ts }).where(eq(iris_posts.id, id))
}

export async function getPostById(id: string): Promise<IrisPost | null> {
  const rows = await getDb()
    .select()
    .from(iris_posts)
    .where(eq(iris_posts.id, id))
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
export const CASSANDRA_SIGNALS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bipo\b|\bfloated\b|\binitial public offer/i,                          label: 'IPO' },
  { pattern: /\brate (?:decision|cut|hike|hold)\b|\bfed funds rate\b|\bbase rate\b/i, label: 'Rate decision' },
  { pattern: /\bearnings?\b|\bprofit warning\b|\brevenue miss\b/i,                    label: 'Earnings' },
  { pattern: /\bnew (?:regulation|rule|guidance)\b|\bregulatory (?:change|update|ruling|fine|ban)\b/i, label: 'Regulatory change' },
  { pattern: /\bcrypto\b|\bbitcoin\b|\bbtc\b|\bethereum\b|\beth\b/i,                 label: 'Crypto' },
]

// Return the earliest 'suggested' iris_post from today, or null if none.
// Read by MAIA's voice status summary (src/lib/maia-voice.ts). Nothing writes
// 'suggested' rows automatically any more — only the Slack "flag_iris_topic"
// command (src/lib/cassandra-handler.ts's handleFlagIrisTopic) still can.
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

// ─── LinkedIn chat thread ─────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'maia' | 'archie'
  content: string
  draft_post_id: string | null
  created_at: number
}

export async function saveChatMessage(
  role: 'maia' | 'archie',
  content: string,
  draftPostId?: string | null,
): Promise<string> {
  const id = crypto.randomUUID()
  await getDb().insert(iris_chat_messages).values({
    id,
    role,
    content,
    draft_post_id: draftPostId ?? null,
    created_at: Math.floor(Date.now() / 1000),
  })
  return id
}

export async function getChatMessages(limit = 50): Promise<ChatMessage[]> {
  const rows = await getDb()
    .select()
    .from(iris_chat_messages)
    .orderBy(desc(iris_chat_messages.created_at))
    .limit(limit)
  return (rows as ChatMessage[]).reverse()
}

// The most recent iris_posts row still in 'draft' status — refinements create a
// new row and mark the previous one 'superseded', so there is at most one live
// draft at a time; everything older stays in the thread as read-only history.
export async function getCurrentDraft(): Promise<IrisPost | null> {
  const rows = await getDb()
    .select()
    .from(iris_posts)
    .where(eq(iris_posts.status, 'draft'))
    .orderBy(desc(iris_posts.created_at))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return row as IrisPost
}

export async function supersedeDraft(id: string): Promise<void> {
  await getDb().update(iris_posts).set({ status: 'superseded' }).where(eq(iris_posts.id, id))
}

// Reads the configured morning-draft time directly (bypassing getPreferences'
// confirmed-only prompt-injection path — this is a schedule config value, not a
// voice rule, and must never be formatted into the generation system prompt).
export async function getMorningGenerationTime(): Promise<string> {
  const rows = await getDb()
    .select({ value: maia_preferences.rule_value })
    .from(maia_preferences)
    .where(and(eq(maia_preferences.category, 'iris'), eq(maia_preferences.rule_key, 'morning_generation_time')))
    .limit(1)
  return rows[0]?.value ?? '07:00'
}
