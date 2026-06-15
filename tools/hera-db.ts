// HERA — database CRUD for reflections and weekly reviews.
// Pure data access: no Claude, no Slack. All reasoning stays in hera-handler.ts.

import { getDb } from '@/db'
import { reflections, weekly_reviews } from '@/db/schema'
import { gte, desc, and, lte } from 'drizzle-orm'

export interface Reflection {
  id: string
  body: string
  source: string
  sentiment: string | null
  distress_flagged: number
  created_at: number
}

export interface WeeklyReview {
  id: string
  period_start: number
  period_end: number
  summary: string
  created_at: number
}

export interface AddReflectionOpts {
  body: string
  source?: 'text' | 'voice'
  sentiment?: 'positive' | 'neutral' | 'low' | null
  distressFlagged?: boolean
}

export async function addReflection(opts: AddReflectionOpts): Promise<Reflection> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const row = {
    id,
    body: opts.body,
    source: opts.source ?? 'text',
    sentiment: opts.sentiment ?? null,
    distress_flagged: opts.distressFlagged ? 1 : 0,
    created_at: now,
  }
  await getDb().insert(reflections).values(row)
  return row
}

// Returns reflections from the last `days` calendar days (from midnight UTC today backwards).
export async function getReflections(days: number): Promise<Reflection[]> {
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400
  return getDb()
    .select()
    .from(reflections)
    .where(gte(reflections.created_at, cutoff))
    .orderBy(desc(reflections.created_at))
    .all() as Reflection[]
}

// Returns reflections created at or after `sinceTs` (unix seconds).
export async function getReflectionsSince(sinceTs: number): Promise<Reflection[]> {
  return getDb()
    .select()
    .from(reflections)
    .where(gte(reflections.created_at, sinceTs))
    .orderBy(desc(reflections.created_at))
    .all() as Reflection[]
}

// Returns reflections from today (midnight UTC to now).
export async function getTodayReflections(): Promise<Reflection[]> {
  const startOfDay = Math.floor(Date.now() / 1000)
  const midnight = startOfDay - (startOfDay % 86400)
  return getDb()
    .select()
    .from(reflections)
    .where(gte(reflections.created_at, midnight))
    .orderBy(desc(reflections.created_at))
    .all() as Reflection[]
}

// Pure streak calculation — exported for testing.
// daySet: set of midnight-UTC timestamps that had at least one reflection.
// todayMidnight: the midnight-UTC timestamp for "today".
export function calcStreak(daySet: Set<number>, todayMidnight: number): number {
  let streak = 0
  let day = todayMidnight
  while (daySet.has(day)) {
    streak++
    day -= 86400
  }
  return streak
}

// Consecutive-day streak: how many days in a row (ending today) had at least one reflection.
export async function getStreak(): Promise<number> {
  const nowSec = Math.floor(Date.now() / 1000)
  const todayMidnight = nowSec - (nowSec % 86400)

  // Fetch up to 90 days of reflections — enough for any realistic streak.
  const cutoff = todayMidnight - 90 * 86400
  const rows = await getDb()
    .select({ created_at: reflections.created_at })
    .from(reflections)
    .where(gte(reflections.created_at, cutoff))
    .orderBy(desc(reflections.created_at))
    .all()

  if (rows.length === 0) return 0

  const days = new Set(rows.map(r => r.created_at - (r.created_at % 86400)))
  return calcStreak(days, todayMidnight)
}

export async function saveWeeklyReview(
  periodStart: number,
  periodEnd: number,
  summary: string,
): Promise<WeeklyReview> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const row = { id, period_start: periodStart, period_end: periodEnd, summary, created_at: now }
  await getDb().insert(weekly_reviews).values(row)
  return row
}

export async function getLatestWeeklyReview(): Promise<WeeklyReview | null> {
  const rows = await getDb()
    .select()
    .from(weekly_reviews)
    .orderBy(desc(weekly_reviews.created_at))
    .limit(1)
    .all()
  return (rows[0] as WeeklyReview) ?? null
}
