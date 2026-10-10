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
  wash_result: string | null
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
  wash_result?: string | null
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
    wash_result: input.wash_result ?? null,
    batch: input.batch ?? null,
    created_at: now,
    updated_at: now,
  })
  return id
}

// Bulk insert for the Sales Nav confirm step and the one-time seed script —
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
      wash_result: input.wash_result ?? null,
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

export async function deleteProspect(id: string): Promise<void> {
  await getDb().delete(nexus_prospects).where(eq(nexus_prospects.id, id))
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
