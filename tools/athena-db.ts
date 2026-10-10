// ATHENA — pure DB functions for the R01 flashcard deck + product knowledge
// base. No Claude/ElevenLabs calls here — those live in src/lib/athena.ts.

import { getDb } from '@/db'
import { athena_cards, athena_products, athena_sessions } from '@/db/schema'
import { eq, and, lte, desc, sql } from 'drizzle-orm'
import { sm2 } from './sm2'

export type AthenaTab = 'r01' | 'product'

export interface AthenaCard {
  id: string
  tab: AthenaTab
  front: string
  back: string
  note: string | null
  product_id: string | null
  difficulty: number
  interval: number
  ease_factor: number
  next_review: string
  total_reviews: number
  correct_streak: number
  created_at: string
  updated_at: string
}

export interface AthenaProduct {
  id: string
  name: string
  summary: string
  sales_angles: string
  mcqs: string
  podcast_script: string | null
  podcast_audio_url: string | null
  source_filename: string
  mcq_count: number
  card_count: number
  created_at: string
  updated_at: string
}

export interface AthenaSession {
  id: string
  tab: AthenaTab
  cards_reviewed: number
  correct_count: number
  started_at: string
  ended_at: string | null
}

// ISO 'YYYY-MM-DD' — UTC-based so "today" means the same calendar day
// regardless of server-vs-browser timezone offsets (the DIANA week/streak bug
// earlier this session was exactly a local-midnight vs UTC mismatch).
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── Cards ────────────────────────────────────────────────────────────────────

export async function listCards(opts: { tab?: AthenaTab; due?: boolean; productId?: string } = {}): Promise<AthenaCard[]> {
  const conditions = []
  if (opts.tab) conditions.push(eq(athena_cards.tab, opts.tab))
  if (opts.productId) conditions.push(eq(athena_cards.product_id, opts.productId))
  if (opts.due) conditions.push(lte(athena_cards.next_review, todayISO()))

  const query = getDb().select().from(athena_cards)
  const rows = conditions.length > 0 ? await query.where(and(...conditions)) : await query
  return rows.sort((a, b) => a.next_review.localeCompare(b.next_review)) as AthenaCard[]
}

export async function getCardById(id: string): Promise<AthenaCard | null> {
  const [row] = await getDb().select().from(athena_cards).where(eq(athena_cards.id, id)).limit(1)
  return (row as AthenaCard) ?? null
}

export interface NewCardInput {
  tab: AthenaTab
  front: string
  back: string
  note?: string | null
  product_id?: string | null
  next_review?: string   // defaults to today — new cards are due immediately
}

export async function createCard(input: NewCardInput): Promise<string> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await getDb().insert(athena_cards).values({
    id,
    tab: input.tab,
    front: input.front,
    back: input.back,
    note: input.note ?? null,
    product_id: input.product_id ?? null,
    difficulty: 0,
    interval: 1,
    ease_factor: 2.5,
    next_review: input.next_review ?? todayISO(),
    total_reviews: 0,
    correct_streak: 0,
    created_at: now,
    updated_at: now,
  })
  return id
}

export async function createCardsBulk(inputs: NewCardInput[]): Promise<number> {
  if (inputs.length === 0) return 0
  const now = new Date().toISOString()
  await getDb().insert(athena_cards).values(
    inputs.map(input => ({
      id: crypto.randomUUID(),
      tab: input.tab,
      front: input.front,
      back: input.back,
      note: input.note ?? null,
      product_id: input.product_id ?? null,
      difficulty: 0,
      interval: 1,
      ease_factor: 2.5,
      next_review: input.next_review ?? todayISO(),
      total_reviews: 0,
      correct_streak: 0,
      created_at: now,
      updated_at: now,
    })),
  )
  return inputs.length
}

export interface ReviewResult {
  card: AthenaCard
  intervalDays: number
}

// quality: 1 (Missed it) | 3 (Got it) | 5 (Nailed it) — standard SM2, applied
// strictly (no softening). correct_streak feeds SM2's "repetitions" concept
// (resets to 0 on a miss); total_reviews is a separate lifetime counter that
// always increments regardless of outcome.
export async function applyCardReview(id: string, quality: 1 | 3 | 5): Promise<ReviewResult> {
  const card = await getCardById(id)
  if (!card) throw new Error(`athena_cards row not found: ${id}`)

  const result = sm2({ ef: card.ease_factor, intervalDays: card.interval, repetitions: card.correct_streak }, quality)
  const now = new Date().toISOString()
  const next_review = addDaysISO(todayISO(), result.intervalDays)

  await getDb().update(athena_cards).set({
    interval: result.intervalDays,
    ease_factor: result.ef,
    next_review,
    total_reviews: card.total_reviews + 1,
    correct_streak: result.repetitions,
    updated_at: now,
  }).where(eq(athena_cards.id, id))

  const updated = await getCardById(id)
  return { card: updated!, intervalDays: result.intervalDays }
}

export async function deleteCard(id: string): Promise<void> {
  await getDb().delete(athena_cards).where(eq(athena_cards.id, id))
}

export async function deleteCardsByProduct(productId: string): Promise<void> {
  await getDb().delete(athena_cards).where(eq(athena_cards.product_id, productId))
}

export async function countR01Cards(): Promise<number> {
  const [row] = await getDb().select({ n: sql<number>`count(*)` }).from(athena_cards).where(eq(athena_cards.tab, 'r01'))
  return row?.n ?? 0
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function listProducts(): Promise<AthenaProduct[]> {
  return (await getDb().select().from(athena_products).orderBy(desc(athena_products.created_at))) as AthenaProduct[]
}

export async function getProductById(id: string): Promise<AthenaProduct | null> {
  const [row] = await getDb().select().from(athena_products).where(eq(athena_products.id, id)).limit(1)
  return (row as AthenaProduct) ?? null
}

export interface NewProductInput {
  name: string
  summary: string
  salesAngles: string[]
  mcqs: unknown[]
  podcastScript: string | null
  sourceFilename: string
  cardCount: number
}

export async function createProduct(input: NewProductInput): Promise<string> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await getDb().insert(athena_products).values({
    id,
    name: input.name,
    summary: input.summary,
    sales_angles: JSON.stringify(input.salesAngles),
    mcqs: JSON.stringify(input.mcqs),
    podcast_script: input.podcastScript,
    podcast_audio_url: null,
    source_filename: input.sourceFilename,
    mcq_count: input.mcqs.length,
    card_count: input.cardCount,
    created_at: now,
    updated_at: now,
  })
  return id
}

export async function setProductPodcastAudio(id: string, audioUrl: string): Promise<void> {
  await getDb().update(athena_products).set({ podcast_audio_url: audioUrl, updated_at: new Date().toISOString() }).where(eq(athena_products.id, id))
}

export async function deleteProduct(id: string): Promise<void> {
  await deleteCardsByProduct(id)
  await getDb().delete(athena_products).where(eq(athena_products.id, id))
}

// Avg ease factor per product, for the right panel's green/red indicator.
export async function getProductAvgEase(): Promise<Record<string, number>> {
  const rows = await getDb().select({ product_id: athena_cards.product_id, ease_factor: athena_cards.ease_factor })
    .from(athena_cards).where(eq(athena_cards.tab, 'product'))
  const byProduct = new Map<string, number[]>()
  for (const r of rows) {
    if (!r.product_id) continue
    const arr = byProduct.get(r.product_id) ?? []
    arr.push(r.ease_factor)
    byProduct.set(r.product_id, arr)
  }
  const result: Record<string, number> = {}
  for (const [pid, efs] of byProduct) result[pid] = efs.reduce((a, b) => a + b, 0) / efs.length
  return result
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function listSessions(limit = 20): Promise<AthenaSession[]> {
  return (await getDb().select().from(athena_sessions).orderBy(desc(athena_sessions.started_at)).limit(limit)) as AthenaSession[]
}

export async function createSession(tab: AthenaTab): Promise<string> {
  const id = crypto.randomUUID()
  await getDb().insert(athena_sessions).values({
    id,
    tab,
    cards_reviewed: 0,
    correct_count: 0,
    started_at: new Date().toISOString(),
    ended_at: null,
  })
  return id
}

export interface SessionUpdateInput {
  cardsReviewed?: number
  correctCount?: number
  ended?: boolean
}

export async function updateSession(id: string, input: SessionUpdateInput): Promise<void> {
  const fields: Record<string, unknown> = {}
  if (input.cardsReviewed !== undefined) fields.cards_reviewed = input.cardsReviewed
  if (input.correctCount !== undefined) fields.correct_count = input.correctCount
  if (input.ended) fields.ended_at = new Date().toISOString()
  if (Object.keys(fields).length === 0) return
  await getDb().update(athena_sessions).set(fields).where(eq(athena_sessions.id, id))
}

// Today's stats — summed across every session started today (not a single
// long-lived session object), so a page reload mid-study doesn't lose the
// running tally.
export async function getTodayStats(): Promise<{ cardsReviewed: number; correctCount: number; accuracyPct: number }> {
  const today = todayISO()
  const rows = await getDb().select({ cards_reviewed: athena_sessions.cards_reviewed, correct_count: athena_sessions.correct_count, started_at: athena_sessions.started_at })
    .from(athena_sessions)
  const todays = rows.filter(r => r.started_at.slice(0, 10) === today)
  const cardsReviewed = todays.reduce((sum, r) => sum + r.cards_reviewed, 0)
  const correctCount = todays.reduce((sum, r) => sum + r.correct_count, 0)
  const accuracyPct = cardsReviewed > 0 ? Math.round((correctCount / cardsReviewed) * 100) : 0
  return { cardsReviewed, correctCount, accuracyPct }
}

// Consecutive days (walking back from today) with at least one reviewed card.
export async function getStreakDays(): Promise<number> {
  const rows = await getDb().select({ cards_reviewed: athena_sessions.cards_reviewed, started_at: athena_sessions.started_at })
    .from(athena_sessions)
  const activeDays = new Set(rows.filter(r => r.cards_reviewed > 0).map(r => r.started_at.slice(0, 10)))

  let streak = 0
  const cursor = new Date(`${todayISO()}T00:00:00Z`)
  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

// R01 progress for the right panel: totals, due today, mastered (interval >= 21 days).
export async function getR01Progress(): Promise<{ totalCards: number; dueToday: number; masteredCards: number }> {
  const rows = await getDb().select({ next_review: athena_cards.next_review, interval: athena_cards.interval })
    .from(athena_cards).where(eq(athena_cards.tab, 'r01'))
  const today = todayISO()
  return {
    totalCards: rows.length,
    dueToday: rows.filter(r => r.next_review <= today).length,
    masteredCards: rows.filter(r => r.interval >= 21).length,
  }
}
