// MAIA voice layer — pure DB functions for tasks, intentions, and daily tracking.
// No Claude calls here. All intelligence stays in src/lib/maia-voice.ts.

import { getDb } from '@/db'
import {
  maia_tasks, maia_weekly_intentions, maia_daily_log, maia_config,
  iris_posts, diana_sessions, quiz_sessions,
} from '@/db/schema'
import { eq, asc, desc, gte, and } from 'drizzle-orm'

export interface MaiaTask {
  id: string
  title: string
  due_date: string | null
  completed: number
  completed_at: number | null
  source: string
  created_at: number
}

export interface WeeklyIntentions {
  id: string
  week_start: string
  focus_areas: string   // JSON array
  raw_input: string
  created_at: number
}

export interface DailyLog {
  id: string
  date: string
  linkedin_posts: number
  diana_sessions_count: number
  athena_sessions: number
  tasks_completed: number
  tasks_total: number
  created_at: number
}

export interface DailyNonNegotiables {
  linkedinToday: number
  dianaToday: number
  athenaToday: number
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function todayStartSecs(): number {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

function currentWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

export async function saveTasks(
  tasks: { title: string; dueDate?: string; source?: string }[],
): Promise<void> {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  for (const t of tasks) {
    await db.insert(maia_tasks).values({
      id: crypto.randomUUID(),
      title: t.title,
      due_date: t.dueDate ?? null,
      completed: 0,
      source: t.source ?? 'manual',
      created_at: now,
    })
  }
}

export async function getActiveTasks(): Promise<MaiaTask[]> {
  const db = getDb()
  return db
    .select()
    .from(maia_tasks)
    .where(eq(maia_tasks.completed, 0))
    .orderBy(asc(maia_tasks.created_at))
}

export async function completeTask(id: string): Promise<void> {
  const db = getDb()
  await db
    .update(maia_tasks)
    .set({ completed: 1, completed_at: Math.floor(Date.now() / 1000) })
    .where(eq(maia_tasks.id, id))
}

export async function saveWeeklyIntentions(
  weekStart: string,
  focusAreas: string[],
  rawInput: string,
): Promise<void> {
  const db = getDb()
  await db.insert(maia_weekly_intentions).values({
    id: crypto.randomUUID(),
    week_start: weekStart,
    focus_areas: JSON.stringify(focusAreas),
    raw_input: rawInput,
    created_at: Math.floor(Date.now() / 1000),
  })
}

export async function getThisWeekIntentions(): Promise<WeeklyIntentions | null> {
  const db = getDb()
  const weekStart = currentWeekStart()
  const [row] = await db
    .select()
    .from(maia_weekly_intentions)
    .where(eq(maia_weekly_intentions.week_start, weekStart))
    .orderBy(desc(maia_weekly_intentions.created_at))
    .limit(1)
  return row ?? null
}

export async function getTodayLog(): Promise<DailyLog | null> {
  const db = getDb()
  const [row] = await db
    .select()
    .from(maia_daily_log)
    .where(eq(maia_daily_log.date, todayStr()))
    .limit(1)
  return row ?? null
}

export async function upsertDailyLog(data: Partial<Omit<DailyLog, 'id' | 'date' | 'created_at'>>): Promise<void> {
  const db = getDb()
  const date = todayStr()
  const now = Math.floor(Date.now() / 1000)
  const existing = await getTodayLog()
  if (existing) {
    await db.update(maia_daily_log).set(data).where(eq(maia_daily_log.date, date))
  } else {
    await db.insert(maia_daily_log).values({
      id: crypto.randomUUID(),
      date,
      linkedin_posts: data.linkedin_posts ?? 0,
      diana_sessions_count: data.diana_sessions_count ?? 0,
      athena_sessions: data.athena_sessions ?? 0,
      tasks_completed: data.tasks_completed ?? 0,
      tasks_total: data.tasks_total ?? 0,
      created_at: now,
    })
  }
}

export async function getDailyNonNegotiables(): Promise<DailyNonNegotiables> {
  const db = getDb()
  const tStart = todayStartSecs()

  const linkedinRows = await db
    .select({ id: iris_posts.id })
    .from(iris_posts)
    .where(and(eq(iris_posts.status, 'approved'), gte(iris_posts.created_at, tStart)))
  const linkedinToday = linkedinRows.length

  const dianaRows = await db
    .select({ id: diana_sessions.id })
    .from(diana_sessions)
    .where(gte(diana_sessions.created_at, tStart))
  const dianaToday = dianaRows.length

  const athenaRows = await db
    .select({ id: quiz_sessions.id })
    .from(quiz_sessions)
    .where(gte(quiz_sessions.created_at, tStart))
  const athenaToday = athenaRows.length

  return { linkedinToday, dianaToday, athenaToday }
}

// ── Config key-value store ────────────────────────────────────────────────────

export async function getConfig(key: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ value: maia_config.value })
    .from(maia_config)
    .where(eq(maia_config.key, key))
    .limit(1)
  return row?.value ?? null
}

export async function setConfig(key: string, value: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await getDb()
    .insert(maia_config)
    .values({ key, value, updated_at: now })
    .onConflictDoUpdate({ target: maia_config.key, set: { value, updated_at: now } })
}
