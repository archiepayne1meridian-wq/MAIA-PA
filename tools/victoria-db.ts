// VICTORIA — database layer: daily tally logs and weekly scorecard storage.

import { eq, gte, lte, desc, and } from 'drizzle-orm'
import { getDb } from '@/db'
import { kpi_logs, kpi_weekly } from '@/db/schema'
import type { DailyMetrics, WeeklyTotals } from './kpi'

// ── Date helpers ──────────────────────────────────────────────────────────────

// Normalise any timestamp to midnight UTC on that day (as a Unix epoch integer).
export function toDateStamp(nowSecs?: number): number {
  const ms = (nowSecs ?? Math.floor(Date.now() / 1000)) * 1000
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000
}

// Monday of the ISO week containing `nowSecs`.
export function toWeekStart(nowSecs?: number): number {
  const ms = (nowSecs ?? Math.floor(Date.now() / 1000)) * 1000
  const d = new Date(ms)
  const day = d.getUTCDay() // 0=Sun, 1=Mon ... 6=Sat
  const daysFromMonday = (day + 6) % 7  // 0 on Mon, 6 on Sun
  const mondayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - daysFromMonday * 86400 * 1000
  return mondayMs / 1000
}

// ── Daily log ─────────────────────────────────────────────────────────────────

export interface KpiLog {
  id: string
  log_date: number
  metrics: DailyMetrics
  note: string | null
  created_at: number
}

function rowToLog(row: typeof kpi_logs.$inferSelect): KpiLog {
  let metrics: DailyMetrics = {}
  try { metrics = JSON.parse(row.metrics_json) } catch { /* corrupted row — treat as empty */ }
  return { id: row.id, log_date: row.log_date, metrics, note: row.note ?? null, created_at: row.created_at }
}

// Get the log for a specific day, or null if none.
export async function getDay(dateStamp?: number): Promise<KpiLog | null> {
  const ds = dateStamp ?? toDateStamp()
  const rows = await getDb()
    .select()
    .from(kpi_logs)
    .where(eq(kpi_logs.log_date, ds))
    .limit(1)
  return rows[0] ? rowToLog(rows[0]) : null
}

// Log (or overwrite) a tally for a specific day.
// Returns the saved log and whether this was an overwrite.
export async function logTally(
  metrics: DailyMetrics,
  note?: string,
  dateStamp?: number,
): Promise<{ log: KpiLog; overwrote: boolean }> {
  const ds = dateStamp ?? toDateStamp()
  const existing = await getDay(ds)

  const id = existing?.id ?? crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const row = {
    id,
    log_date: ds,
    metrics_json: JSON.stringify(metrics),
    note: note ?? null,
    created_at: now,
  }

  if (existing) {
    await getDb().update(kpi_logs).set(row).where(eq(kpi_logs.id, id))
  } else {
    await getDb().insert(kpi_logs).values(row)
  }

  return { log: { id, log_date: ds, metrics, note: note ?? null, created_at: now }, overwrote: !!existing }
}

// Get all logs in a date range (inclusive, both as Unix epoch seconds at midnight UTC).
export async function getLogs(fromStamp: number, toStamp: number): Promise<KpiLog[]> {
  const rows = await getDb()
    .select()
    .from(kpi_logs)
    .where(and(gte(kpi_logs.log_date, fromStamp), lte(kpi_logs.log_date, toStamp)))
  return rows.map(rowToLog)
}

// Get logs for the current ISO week (Mon–Sun).
export async function getCurrentWeekLogs(nowSecs?: number): Promise<KpiLog[]> {
  const ws = toWeekStart(nowSecs)
  const we = ws + 6 * 86400  // Saturday midnight = end of week
  return getLogs(ws, we)
}

// Get logs for the previous ISO week.
export async function getPreviousWeekLogs(nowSecs?: number): Promise<KpiLog[]> {
  const ws = toWeekStart(nowSecs)
  const prevWs = ws - 7 * 86400
  const prevWe = ws - 1   // Sunday just before this Monday
  return getLogs(prevWs, prevWe)
}

// ── Weekly scorecard ──────────────────────────────────────────────────────────

export interface KpiWeekly {
  id: string
  week_start: number
  totals: WeeklyTotals
  summary: string
  created_at: number
}

function rowToWeekly(row: typeof kpi_weekly.$inferSelect): KpiWeekly {
  let totals: WeeklyTotals = {}
  try { totals = JSON.parse(row.totals_json) } catch { /* corrupted — empty */ }
  return { id: row.id, week_start: row.week_start, totals, summary: row.summary, created_at: row.created_at }
}

// Save (or overwrite) the weekly scorecard for a given week start.
export async function saveWeekly(
  weekStart: number,
  totals: WeeklyTotals,
  summary: string,
): Promise<KpiWeekly> {
  const rows = await getDb()
    .select()
    .from(kpi_weekly)
    .where(eq(kpi_weekly.week_start, weekStart))
    .limit(1)

  const id = rows[0]?.id ?? crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const row = {
    id,
    week_start: weekStart,
    totals_json: JSON.stringify(totals),
    summary,
    created_at: now,
  }

  if (rows[0]) {
    await getDb().update(kpi_weekly).set(row).where(eq(kpi_weekly.id, id))
  } else {
    await getDb().insert(kpi_weekly).values(row)
  }

  return { id, week_start: weekStart, totals, summary, created_at: now }
}

// Get the N most recent weekly scorecards (newest first).
export async function getWeeklies(n: number): Promise<KpiWeekly[]> {
  const rows = await getDb()
    .select()
    .from(kpi_weekly)
    .orderBy(desc(kpi_weekly.week_start))
    .limit(n)
  return rows.map(rowToWeekly)
}
