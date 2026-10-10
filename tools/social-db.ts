// Social (Instagram & Facebook) — pure DB functions. No Claude/DALL-E calls.

import { getDb } from '@/db'
import { social_posts } from '@/db/schema'
import { eq, desc, gte } from 'drizzle-orm'

export type SocialStatus = 'draft' | 'approved' | 'posted'
export type SocialSourceType = 'linkedin' | 'idea' | 'news'

export interface SocialPost {
  id: string
  source_type: SocialSourceType
  source_content: string
  hook_text: string
  slides: string          // JSON
  caption: string
  hashtags: string
  image_urls: string | null  // JSON array of file paths
  status: SocialStatus
  created_at: string
  updated_at: string
}

export interface NewSocialPostInput {
  sourceType: SocialSourceType
  sourceContent: string
  hookText: string
  slides: unknown[]
  caption: string
  hashtags: string
  imageUrls?: string[]
}

export async function createPost(input: NewSocialPostInput): Promise<string> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await getDb().insert(social_posts).values({
    id,
    source_type: input.sourceType,
    source_content: input.sourceContent,
    hook_text: input.hookText,
    slides: JSON.stringify(input.slides),
    caption: input.caption,
    hashtags: input.hashtags,
    image_urls: input.imageUrls ? JSON.stringify(input.imageUrls) : null,
    status: 'draft',
    created_at: now,
    updated_at: now,
  })
  return id
}

export async function listPosts(status?: SocialStatus): Promise<SocialPost[]> {
  const rows = await getDb().select().from(social_posts).orderBy(desc(social_posts.created_at))
  const all = rows as SocialPost[]
  return status ? all.filter(p => p.status === status) : all
}

export async function getPostById(id: string): Promise<SocialPost | null> {
  const [row] = await getDb().select().from(social_posts).where(eq(social_posts.id, id)).limit(1)
  return (row as SocialPost) ?? null
}

export interface SocialPostUpdate {
  slides?: unknown[]
  imageUrls?: string[]
  status?: SocialStatus
}

export async function updatePost(id: string, update: SocialPostUpdate): Promise<void> {
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (update.slides) fields.slides = JSON.stringify(update.slides)
  if (update.imageUrls) fields.image_urls = JSON.stringify(update.imageUrls)
  if (update.status) fields.status = update.status
  await getDb().update(social_posts).set(fields).where(eq(social_posts.id, id))
}

export async function deletePost(id: string): Promise<void> {
  await getDb().delete(social_posts).where(eq(social_posts.id, id))
}

// Consecutive days (walking back from today) with at least one post approved
// or posted — "approved" per spec's "Post streak" definition.
export async function getApprovedStreakDays(): Promise<number> {
  const rows = await getDb().select({ status: social_posts.status, updated_at: social_posts.updated_at })
    .from(social_posts)
  const activeDays = new Set(
    rows.filter(r => r.status === 'approved' || r.status === 'posted').map(r => r.updated_at.slice(0, 10)),
  )
  let streak = 0
  const cursor = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

// Content mix (source_type breakdown) over the last N days — for the right panel.
export async function getContentMix(days: number): Promise<Record<SocialSourceType, number>> {
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString()
  const rows = await getDb().select({ source_type: social_posts.source_type, created_at: social_posts.created_at })
    .from(social_posts).where(gte(social_posts.created_at, since))
  const mix: Record<SocialSourceType, number> = { linkedin: 0, idea: 0, news: 0 }
  for (const r of rows) mix[r.source_type as SocialSourceType]++
  return mix
}
