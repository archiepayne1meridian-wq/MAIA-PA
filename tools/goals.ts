// Pure DB functions for maia_goals. No Claude calls.

import { eq, asc, like } from 'drizzle-orm'
import { getDb } from '@/db'
import { maia_goals } from '@/db/schema'

export interface Goal {
  id: string
  goal_text: string
  goal_type: 'short_term' | 'long_term'
  completed: number
  sort_order: number
  created_at: number
  updated_at: number
}

export async function getGoals(): Promise<Goal[]> {
  const rows = await getDb()
    .select()
    .from(maia_goals)
    .orderBy(asc(maia_goals.goal_type), asc(maia_goals.sort_order))
  return rows as Goal[]
}

export async function addGoal(text: string, type: 'short_term' | 'long_term'): Promise<Goal> {
  const db = getDb()
  const existing = await db.select({ n: maia_goals.sort_order }).from(maia_goals).where(eq(maia_goals.goal_type, type))
  const nextOrder = existing.length > 0 ? Math.max(...existing.map(r => r.n)) + 1 : 0
  const now = Math.floor(Date.now() / 1000)
  const row = {
    id: crypto.randomUUID(),
    goal_text: text,
    goal_type: type,
    completed: 0,
    sort_order: nextOrder,
    created_at: now,
    updated_at: now,
  }
  await db.insert(maia_goals).values(row)
  return row as Goal
}

export async function updateGoal(id: string, fields: { goal_text?: string; completed?: number }): Promise<void> {
  await getDb().update(maia_goals)
    .set({ ...fields, updated_at: Math.floor(Date.now() / 1000) })
    .where(eq(maia_goals.id, id))
}

export async function deleteGoal(id: string): Promise<void> {
  await getDb().delete(maia_goals).where(eq(maia_goals.id, id))
}

// Fuzzy lookup for MAIA chat commands like "mark goal complete: wake up at 5am" —
// matches on a case-insensitive substring of goal_text. Returns the first match.
export async function findGoalByText(text: string): Promise<Goal | null> {
  const needle = text.trim().toLowerCase()
  if (!needle) return null
  const rows = await getDb().select().from(maia_goals).where(like(maia_goals.goal_text, `%${needle}%`)).limit(1)
  if (rows.length > 0) return rows[0] as Goal
  // SQLite LIKE is case-insensitive for ASCII by default, but the needle may
  // contain characters the caller typed in a different case than stored —
  // fall back to a full scan + manual compare for robustness.
  const all = await getGoals()
  return all.find(g => g.goal_text.toLowerCase().includes(needle) || needle.includes(g.goal_text.toLowerCase())) ?? null
}
