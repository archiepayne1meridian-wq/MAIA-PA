// NEXUS — pure DB functions for prospect tracking. No Claude calls.

import { getDb } from '@/db'
import { nexus_prospects, nexus_import_log } from '@/db/schema'
import { eq, desc, sql, isNull, or } from 'drizzle-orm'
import { inferEmploymentType } from '@/lib/nexus-employment'
import { ensureCompanyOnMap } from './map-db'

export interface NexusProspect {
  id: string
  last_name: string | null
  first_name: string | null
  company: string | null
  job_role: string | null
  employment_status: string
  employment_type: string | null
  lead_channel: string
  country: string
  linkedin_url: string | null
  email: string | null
  phone: string | null
  wash_result: string | null
  wash_category: string | null
  wash_reason: string | null
  date_washed: string | null
  rewash_after: string | null
  conflicting_advisor: string | null
  notes: string | null
  batch: string | null
  flagged: number
  created_at: number
  updated_at: number
}

// Rule 3 (Sales Nav parser) — "O.", "B" etc. Duplicated here rather than
// imported from src/lib/nexus.ts to avoid a circular import (that file
// already imports from this one).
function isSingleLetterSurname(last: string | null | undefined): boolean {
  return /^[A-Za-zÀ-ÿ]\.?$/.test((last ?? '').trim())
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
  employment_type?: string | null
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
  flagged?: boolean
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
    employment_type: input.employment_type ?? inferEmploymentType(input.job_role ?? null, input.company ?? null),
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
    flagged: input.flagged ? 1 : 0,
    created_at: now,
    updated_at: now,
  })
  if (input.company?.trim()) void ensureCompanyOnMap(input.company).catch(err => console.error('[nexus] ensureCompanyOnMap failed:', err))
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
      employment_type: input.employment_type ?? inferEmploymentType(input.job_role ?? null, input.company ?? null),
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
      flagged: input.flagged ? 1 : 0,
      created_at: now,
      updated_at: now,
    })),
  )
  const companies = [...new Set(inputs.map(i => i.company?.trim()).filter((c): c is string => Boolean(c)))]
  void Promise.all(companies.map(c => ensureCompanyOnMap(c))).catch(err => console.error('[nexus] ensureCompanyOnMap (bulk) failed:', err))
  return inputs.length
}

export async function updateProspect(id: string, fields: Partial<NewProspectInput>): Promise<void> {
  // A manual surname edit re-evaluates the single-letter-surname flag rather
  // than leaving it stuck — if Archie fixes "O." to "Oana", the amber
  // highlight should clear; if he somehow edits it down to one letter, it
  // should flag now too.
  const patch: Record<string, unknown> = { ...fields, updated_at: Math.floor(Date.now() / 1000) }
  if ('last_name' in fields) patch.flagged = isSingleLetterSurname(fields.last_name) ? 1 : 0
  await getDb().update(nexus_prospects)
    .set(patch)
    .where(eq(nexus_prospects.id, id))
  // A company edited in is a company "added to Nexus" just as much as one
  // typed in at creation — same auto-add-to-map treatment. Does NOT
  // recompute employment_type here: that's set once at creation/backfill
  // and via explicit manual override only, never silently re-inferred.
  if ('company' in fields && fields.company?.trim()) {
    void ensureCompanyOnMap(fields.company).catch(err => console.error('[nexus] ensureCompanyOnMap (update) failed:', err))
  }
}

// ── Bulk "fill in the blanks" actions ─────────────────────────────────────────
// Lead channel / country toolbar actions — only ever touch rows where the
// field is genuinely empty (null or ''), never overwrite an existing value.
// Two-step (count, then apply) so the frontend can show a confirm count
// before committing.

function emptyFieldWhere(field: 'lead_channel' | 'country') {
  const col = field === 'lead_channel' ? nexus_prospects.lead_channel : nexus_prospects.country
  return or(isNull(col), eq(col, ''))
}

export async function bulkSetFieldWhereEmpty(field: 'lead_channel' | 'country', value: string): Promise<number> {
  const result = await getDb().update(nexus_prospects)
    .set({ [field]: value, updated_at: Math.floor(Date.now() / 1000) })
    .where(emptyFieldWhere(field))
  return result.changes ?? 0
}

// ── Employment type (deterministic seniority tier, src/lib/nexus-employment.ts) ──
// Classified once at creation (addProspect/addProspectsBulk) and via the
// one-time backfill below; a manual override is a plain setEmploymentType
// call and is never re-inferred afterward.

// Backfill target: null (never classified) or the old invalid value from a
// prior scheme ('Managing Director', superseded by 'Controlling Director') —
// never an already-valid classification, so a manual override always sticks.
function needsEmploymentBackfillWhere() {
  return or(isNull(nexus_prospects.employment_type), eq(nexus_prospects.employment_type, 'Managing Director'))
}

export async function countNeedingEmploymentBackfill(): Promise<number> {
  const [row] = await getDb().select({ count: sql<number>`count(*)` }).from(nexus_prospects).where(needsEmploymentBackfillWhere())
  return row?.count ?? 0
}

export async function getProspectsNeedingEmploymentBackfill(limit: number): Promise<{ id: string; job_role: string | null; company: string | null }[]> {
  return getDb().select({ id: nexus_prospects.id, job_role: nexus_prospects.job_role, company: nexus_prospects.company })
    .from(nexus_prospects)
    .where(needsEmploymentBackfillWhere())
    .limit(limit)
}

export async function setEmploymentType(id: string, employmentType: string): Promise<void> {
  await getDb().update(nexus_prospects)
    .set({ employment_type: employmentType, updated_at: Math.floor(Date.now() / 1000) })
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

// Fine-grained categorisation from the Claude wash-sheet parser (src/lib/nexus.ts's
// parseWashResultsRich) — richer than the plain Green/Red/DNC the simple 3-column
// paste produces. Maps onto the existing wash_result column so the append-only
// upgrade rank logic above (canUpgradeWash) keeps working unchanged: redlisted_company
// shares pool_conflict's rank (both Red, both rewashable); others_client is terminal
// like dnc (Do Not Contact) — once someone else's active client, never rewashed.
export type WashCategory = 'ok_to_contact' | 'dnc' | 'others_client' | 'pool_conflict' | 'redlisted_company'

const CATEGORY_TO_WASH_RESULT: Record<WashCategory, 'Green' | 'Red' | 'Do Not Contact'> = {
  ok_to_contact: 'Green',
  pool_conflict: 'Red',
  redlisted_company: 'Red',
  dnc: 'Do Not Contact',
  others_client: 'Do Not Contact',
}

export interface WashCategoryUpgradeInput {
  category: WashCategory
  reason?: string | null
  conflictingAdvisor?: string | null
  dateWashed?: string | null
}

// Same append-only rule as applyWashUpgrade (via canUpgradeWash) — returns
// whether the upgrade was actually applied.
export async function applyWashCategoryUpgrade(id: string, input: WashCategoryUpgradeInput): Promise<boolean> {
  const current = await getProspectById(id)
  if (!current) return false
  const washResult = CATEGORY_TO_WASH_RESULT[input.category]
  if (!canUpgradeWash(current.wash_result, washResult)) return false

  await getDb().update(nexus_prospects).set({
    wash_result: washResult,
    wash_category: input.category,
    wash_reason: input.reason ?? current.wash_reason,
    date_washed: input.dateWashed ?? current.date_washed,
    conflicting_advisor: input.category === 'pool_conflict' ? (input.conflictingAdvisor ?? null) : null,
    updated_at: Math.floor(Date.now() / 1000),
  }).where(eq(nexus_prospects.id, id))
  return true
}

// All (first_name, last_name) pairs, lower-cased, for duplicate detection on
// Sales Nav paste and name-matching on wash-result paste. One query, cheap —
// the full list tops out in the low thousands for a single-user CRM feed.
// Also carries the original-case display name + company — not needed for
// the plain lowercase-equality consumers, but required by the AI name
// matcher (src/lib/nexus.ts's aiMatchNames), which shows Claude the real
// prospect list to match wash-sheet names against.
export async function getAllNamesLower(): Promise<{ id: string; firstLower: string; lastLower: string; name: string; company: string | null }[]> {
  const rows = await getDb().select({
    id: nexus_prospects.id,
    first_name: nexus_prospects.first_name,
    last_name: nexus_prospects.last_name,
    company: nexus_prospects.company,
  }).from(nexus_prospects)
  return rows.map(r => ({
    id: r.id,
    firstLower: (r.first_name ?? '').trim().toLowerCase(),
    lastLower: (r.last_name ?? '').trim().toLowerCase(),
    name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
    company: r.company,
  }))
}

// One row per Sales Nav import — getLastImport() always reads the newest.
export async function recordImport(added: number, skipped: number): Promise<void> {
  await getDb().insert(nexus_import_log).values({ id: crypto.randomUUID(), added, skipped })
}

export async function getLastImport(): Promise<{ added: number; skipped: number; created_at: number } | null> {
  const [row] = await getDb().select().from(nexus_import_log).orderBy(desc(nexus_import_log.created_at)).limit(1)
  return row ?? null
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
