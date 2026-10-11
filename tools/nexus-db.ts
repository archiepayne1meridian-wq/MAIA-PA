// NEXUS — pure DB functions for prospect tracking. No Claude calls.

import { getDb } from '@/db'
import { nexus_prospects } from '@/db/schema'
import { eq, desc, sql } from 'drizzle-orm'

export interface NexusProspect {
  id: string
  last_name: string | null
  first_name: string | null
  company: string | null
  job_role: string | null
  employment_status: string
  lead_channel: string
  country: string
  linkedin_url: string | null
  email: string | null
  phone: string | null
  wash_result: string | null
  wash_reason: string | null
  date_washed: string | null
  rewash_after: string | null
  notes: string | null
  batch: string | null
  created_at: number
  updated_at: number
}

export type WashFilter = 'all' | 'green' | 'red' | 'dnc' | 'unwashed'

export async function listProspects(filter: WashFilter = 'all'): Promise<NexusProspect[]> {
  const rows = await getDb().select().from(nexus_prospects).orderBy(desc(nexus_prospects.created_at))
  if (filter === 'all') return rows
  if (filter === 'green') return rows.filter(r => r.wash_result === 'Green')
  if (filter === 'red') return rows.filter(r => r.wash_result === 'Red')
  if (filter === 'dnc') return rows.filter(r => r.wash_result === 'Do Not Contact')
  return rows.filter(r => !r.wash_result)
}

export async function getProspectById(id: string): Promise<NexusProspect | null> {
  const [row] = await getDb().select().from(nexus_prospects).where(eq(nexus_prospects.id, id)).limit(1)
  return row ?? null
}

export interface NewProspectInput {
  last_name?: string | null
  first_name?: string | null
  company?: string | null
  job_role?: string | null
  employment_status?: string
  lead_channel?: string
  country?: string
  linkedin_url?: string | null
  email?: string | null
  phone?: string | null
  wash_result?: string | null
  wash_reason?: string | null
  date_washed?: string | null
  rewash_after?: string | null
  notes?: string | null
  batch?: string | null
}

export async function addProspect(input: NewProspectInput): Promise<string> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(nexus_prospects).values({
    id,
    last_name: input.last_name ?? null,
    first_name: input.first_name ?? null,
    company: input.company ?? null,
    job_role: input.job_role ?? null,
    employment_status: input.employment_status ?? 'Employee',
    lead_channel: input.lead_channel ?? 'Cold - LinkedIn',
    country: input.country ?? 'Switzerland',
    linkedin_url: input.linkedin_url ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    wash_result: input.wash_result ?? null,
    wash_reason: input.wash_reason ?? null,
    date_washed: input.date_washed ?? null,
    rewash_after: input.rewash_after ?? null,
    notes: input.notes ?? null,
    batch: input.batch ?? null,
    created_at: now,
    updated_at: now,
  })
  return id
}

// Bulk insert for the Sales Nav confirm step and one-time seed scripts —
// a loop of addProspect would also work but this keeps a batch import to a
// single statement.
export async function addProspectsBulk(inputs: NewProspectInput[]): Promise<number> {
  if (inputs.length === 0) return 0
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(nexus_prospects).values(
    inputs.map(input => ({
      id: crypto.randomUUID(),
      last_name: input.last_name ?? null,
      first_name: input.first_name ?? null,
      company: input.company ?? null,
      job_role: input.job_role ?? null,
      employment_status: input.employment_status ?? 'Employee',
      lead_channel: input.lead_channel ?? 'Cold - LinkedIn',
      country: input.country ?? 'Switzerland',
      linkedin_url: input.linkedin_url ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      wash_result: input.wash_result ?? null,
      wash_reason: input.wash_reason ?? null,
      date_washed: input.date_washed ?? null,
      rewash_after: input.rewash_after ?? null,
      notes: input.notes ?? null,
      batch: input.batch ?? null,
      created_at: now,
      updated_at: now,
    })),
  )
  return inputs.length
}

export async function updateProspect(id: string, fields: Partial<NewProspectInput>): Promise<void> {
  await getDb().update(nexus_prospects)
    .set({ ...fields, updated_at: Math.floor(Date.now() / 1000) })
    .where(eq(nexus_prospects.id, id))
}

// Hard delete — kept as a low-level primitive, but the API route no longer
// calls this directly. "Never hard-delete a prospect" is enforced at the
// route layer via softDeleteProspect below.
export async function deleteProspect(id: string): Promise<void> {
  await getDb().delete(nexus_prospects).where(eq(nexus_prospects.id, id))
}

// Hard delete an entire batch — for undoing a bad import (e.g. a parser bug
// that produced garbage candidates), not for normal prospect lifecycle
// management, which stays soft-delete-only via softDeleteProspect above.
export async function deleteProspectsByBatch(batch: string): Promise<number> {
  const result = await getDb().delete(nexus_prospects).where(eq(nexus_prospects.batch, batch))
  return result.changes ?? 0
}

// Soft delete — DNC the prospect and note why, rather than removing the row.
export async function softDeleteProspect(id: string, note: string): Promise<void> {
  const current = await getProspectById(id)
  const notes = current?.notes ? `${current.notes}\n${note}` : note
  await getDb().update(nexus_prospects)
    .set({ wash_result: 'Do Not Contact', notes, updated_at: Math.floor(Date.now() / 1000) })
    .where(eq(nexus_prospects.id, id))
}

// Wash-result upgrade path is append-only: Unwashed -> anything; Red -> Green
// or DNC; Green -> DNC only; DNC -> nothing. A row never moves "backwards"
// (e.g. Green can't be downgraded to Red/Unwashed by a later upload) — this
// mirrors how compliance re-washes work in practice: a later wash can only
// confirm or escalate risk, never un-confirm an earlier clean result.
const WASH_RANK: Record<string, number> = { 'Do Not Contact': 3, 'Red': 2, 'Green': 2, 'Unwashed': 0 }
function canUpgradeWash(current: string | null, next: string): boolean {
  const currentLabel = current ?? 'Unwashed'
  if (currentLabel === 'Do Not Contact') return false
  if (currentLabel === next) return true
  if (currentLabel === 'Unwashed') return true
  if (currentLabel === 'Red') return next === 'Green' || next === 'Do Not Contact'
  if (currentLabel === 'Green') return next === 'Do Not Contact'
  return false
}

export interface WashUpgradeInput {
  washResult: 'Green' | 'Red' | 'Do Not Contact'
  washReason?: string | null
  dateWashed?: string | null
  rewashAfter?: string | null
}

// Returns whether the upgrade was actually applied (false if blocked by the
// append-only rule above — the caller surfaces these as "skipped" so Archie
// can see a downgrade attempt was ignored, not silently lost).
export async function applyWashUpgrade(id: string, input: WashUpgradeInput): Promise<boolean> {
  const current = await getProspectById(id)
  if (!current) return false
  if (!canUpgradeWash(current.wash_result, input.washResult)) return false

  await getDb().update(nexus_prospects).set({
    wash_result: input.washResult,
    wash_reason: input.washReason ?? current.wash_reason,
    date_washed: input.dateWashed ?? current.date_washed,
    rewash_after: input.washResult === 'Red' ? (input.rewashAfter ?? current.rewash_after) : null,
    updated_at: Math.floor(Date.now() / 1000),
  }).where(eq(nexus_prospects.id, id))
  return true
}

// All (first_name, last_name) pairs, lower-cased, for duplicate detection on
// Sales Nav paste and name-matching on wash-result paste. One query, cheap —
// the full list tops out in the low thousands for a single-user CRM feed.
export async function getAllNamesLower(): Promise<{ id: string; firstLower: string; lastLower: string }[]> {
  const rows = await getDb().select({
    id: nexus_prospects.id,
    first_name: nexus_prospects.first_name,
    last_name: nexus_prospects.last_name,
  }).from(nexus_prospects)
  return rows.map(r => ({
    id: r.id,
    firstLower: (r.first_name ?? '').trim().toLowerCase(),
    lastLower: (r.last_name ?? '').trim().toLowerCase(),
  }))
}

export interface NexusStats {
  total: number
  green: number
  red: number
  dnc: number
  unwashed: number
}

export async function getStats(): Promise<NexusStats> {
  const [row] = await getDb().select({
    total: sql<number>`count(*)`,
    green: sql<number>`sum(case when ${nexus_prospects.wash_result} = 'Green' then 1 else 0 end)`,
    red: sql<number>`sum(case when ${nexus_prospects.wash_result} = 'Red' then 1 else 0 end)`,
    dnc: sql<number>`sum(case when ${nexus_prospects.wash_result} = 'Do Not Contact' then 1 else 0 end)`,
  }).from(nexus_prospects)
  const total = row?.total ?? 0
  const green = row?.green ?? 0
  const red = row?.red ?? 0
  const dnc = row?.dnc ?? 0
  return { total, green, red, dnc, unwashed: total - green - red - dnc }
}

// Wash rate for the most recent batch label seen, vs all-time — used by the
// right context panel's WASH RATE section.
export async function getWashRateByBatch(): Promise<{ lastBatchPct: number | null; allTimePct: number }> {
  const all = await getDb().select({ wash_result: nexus_prospects.wash_result, batch: nexus_prospects.batch, created_at: nexus_prospects.created_at })
    .from(nexus_prospects)
  const total = all.length
  const washed = all.filter(r => r.wash_result).length
  const allTimePct = total > 0 ? Math.round((washed / total) * 100) : 0

  const batches = all.filter(r => r.batch).sort((a, b) => b.created_at - a.created_at)
  const lastBatch = batches[0]?.batch ?? null
  if (!lastBatch) return { lastBatchPct: null, allTimePct }

  const inBatch = all.filter(r => r.batch === lastBatch)
  const washedInBatch = inBatch.filter(r => r.wash_result).length
  const lastBatchPct = inBatch.length > 0 ? Math.round((washedInBatch / inBatch.length) * 100) : 0
  return { lastBatchPct, allTimePct }
}
