// MAP (codename atlas) — pure DB functions. No Claude calls (that's src/lib/map.ts).
// Live stats are always computed at query time by joining map_companies against
// nexus_prospects (by company name) and apollo_calls (by company_name) — never a
// stored/cached join, so a new wash result or a new booking shows up immediately.

import { getDb } from '@/db'
import { map_companies, nexus_prospects, apollo_calls } from '@/db/schema'
import { eq, sql, desc } from 'drizzle-orm'

export interface MapCompany {
  id: number
  name: string
  type: string
  sector: string | null
  employees_est: number | null
  lat: number
  lng: number
  area: string | null
  hq_location: string | null
  swiss_offices: string[]
  office_type: string
  ai_summary: string | null
  ai_summary_updated_at: number | null
  prospect_priority: 'high' | 'normal' | 'low' | 'avoid'
  avoid_reason: string | null
  cassandra_notes: string | null
  cassandra_updated_at: number | null
  notes: string | null
  created_at: number
  updated_at: number
}

export interface MapCompanyWithStats extends MapCompany {
  total_washed: number
  green_prospects: number
  dnc_count: number
  others_client_count: number
  total_calls: number
  total_booked: number
  nationalities: Record<string, number>
}

function parseSwissOffices(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function parseNationalities(raw: string | null): Record<string, number> {
  if (!raw) return {}
  const counts: Record<string, number> = {}
  for (const n of raw.split(',')) {
    const trimmed = n.trim()
    if (!trimmed) continue
    counts[trimmed] = (counts[trimmed] ?? 0) + 1
  }
  return counts
}

// Join condition for matching a prospect/call's free-text company field
// against a mapped company's name — case/whitespace-insensitive, since Sales
// Nav imports and debrief answers won't always match map_companies.name
// byte-for-byte (see spec section 8 — exact-match is still the goal, this
// just tolerates minor case/spacing differences).
const prospectJoin = sql`lower(trim(${nexus_prospects.company})) = lower(trim(${map_companies.name}))`
const callJoin = sql`lower(trim(${apollo_calls.company_name})) = lower(trim(${map_companies.name}))`

// "Active"/green mirrors NexusWorkspace.tsx's statusOf() derivation: a Claude
// wash-parse sets wash_category explicitly; the older plain 3-column paste
// only ever set wash_result, so a Green/DNC/Red row with no category is
// still counted under the matching legacy bucket.
const activeCase = sql<number>`sum(case when ${nexus_prospects.wash_category} = 'ok_to_contact' or (${nexus_prospects.wash_result} = 'Green' and ${nexus_prospects.wash_category} is null) then 1 else 0 end)`
const dncCase = sql<number>`sum(case when ${nexus_prospects.wash_category} = 'dnc' or (${nexus_prospects.wash_result} = 'Do Not Contact' and ${nexus_prospects.wash_category} is null) then 1 else 0 end)`
const othersClientCase = sql<number>`sum(case when ${nexus_prospects.wash_category} = 'others_client' then 1 else 0 end)`
const totalWashedCase = sql<number>`count(distinct ${nexus_prospects.id})`
const totalCallsCase = sql<number>`count(distinct ${apollo_calls.id})`
const totalBookedCase = sql<number>`count(distinct case when ${apollo_calls.outcome} = 'booked' then ${apollo_calls.id} end)`

export async function getCompaniesWithStats(): Promise<MapCompanyWithStats[]> {
  const rows = await getDb()
    .select({
      id: map_companies.id,
      name: map_companies.name,
      type: map_companies.type,
      sector: map_companies.sector,
      employees_est: map_companies.employees_est,
      lat: map_companies.lat,
      lng: map_companies.lng,
      area: map_companies.area,
      hq_location: map_companies.hq_location,
      swiss_offices: map_companies.swiss_offices,
      office_type: map_companies.office_type,
      ai_summary: map_companies.ai_summary,
      ai_summary_updated_at: map_companies.ai_summary_updated_at,
      prospect_priority: map_companies.prospect_priority,
      avoid_reason: map_companies.avoid_reason,
      cassandra_notes: map_companies.cassandra_notes,
      cassandra_updated_at: map_companies.cassandra_updated_at,
      notes: map_companies.notes,
      created_at: map_companies.created_at,
      updated_at: map_companies.updated_at,
      total_washed: totalWashedCase,
      green_prospects: activeCase,
      dnc_count: dncCase,
      others_client_count: othersClientCase,
      total_calls: totalCallsCase,
      total_booked: totalBookedCase,
      nationalities_raw: sql<string | null>`group_concat(distinct ${apollo_calls.prospect_nationality})`,
    })
    .from(map_companies)
    .leftJoin(nexus_prospects, prospectJoin)
    .leftJoin(apollo_calls, callJoin)
    .groupBy(map_companies.id)
    .orderBy(desc(totalBookedCase), desc(totalWashedCase), map_companies.name)

  return rows.map(r => ({
    ...r,
    prospect_priority: r.prospect_priority as MapCompany['prospect_priority'],
    swiss_offices: parseSwissOffices(r.swiss_offices),
    nationalities: parseNationalities(r.nationalities_raw),
  }))
}

export async function getCompanyById(id: number): Promise<MapCompany | null> {
  const [row] = await getDb().select().from(map_companies).where(eq(map_companies.id, id)).limit(1)
  if (!row) return null
  return {
    ...row,
    prospect_priority: row.prospect_priority as MapCompany['prospect_priority'],
    swiss_offices: parseSwissOffices(row.swiss_offices),
  }
}

export interface NewCompanyInput {
  name: string
  type?: string
  sector?: string | null
  employees_est?: number | null
  lat: number
  lng: number
  area?: string | null
  hq_location?: string | null
  swiss_offices?: string[]
  office_type?: string
}

export async function addCompany(input: NewCompanyInput): Promise<number> {
  const [row] = await getDb().insert(map_companies).values({
    name: input.name,
    type: input.type ?? 'company',
    sector: input.sector ?? null,
    employees_est: input.employees_est ?? null,
    lat: input.lat,
    lng: input.lng,
    area: input.area ?? null,
    hq_location: input.hq_location ?? null,
    swiss_offices: input.swiss_offices ? JSON.stringify(input.swiss_offices) : null,
    office_type: input.office_type ?? 'office',
  }).returning({ id: map_companies.id })
  return row!.id
}

export async function updateCompanySummary(id: number, summary: string): Promise<void> {
  await getDb().update(map_companies)
    .set({ ai_summary: summary, ai_summary_updated_at: Math.floor(Date.now() / 1000), updated_at: Math.floor(Date.now() / 1000) })
    .where(eq(map_companies.id, id))
}

export interface CompanyFlagUpdate {
  prospect_priority?: 'high' | 'normal' | 'low' | 'avoid'
  avoid_reason?: string | null
  notes?: string | null
}

export async function updateCompanyFlags(id: number, fields: CompanyFlagUpdate): Promise<void> {
  await getDb().update(map_companies)
    .set({ ...fields, updated_at: Math.floor(Date.now() / 1000) })
    .where(eq(map_companies.id, id))
}

// Fire-and-forget from the Cassandra pipeline — no-op if no article mentions
// a mapped company.
export async function updateCassandraNote(companyNameLower: string, snippet: string): Promise<void> {
  await getDb().update(map_companies)
    .set({ cassandra_notes: snippet, cassandra_updated_at: Math.floor(Date.now() / 1000) })
    .where(sql`lower(${map_companies.name}) = ${companyNameLower}`)
}

export async function getAllCompanyNames(): Promise<string[]> {
  const rows = await getDb().select({ name: map_companies.name }).from(map_companies)
  return rows.map(r => r.name)
}

export interface CompanyProspect {
  id: string
  first_name: string | null
  last_name: string | null
  status: 'active' | 'pool_conflict' | 'dnc' | 'others_client' | 'unwashed'
}

function prospectStatus(wash_result: string | null, wash_category: string | null): CompanyProspect['status'] {
  if (!wash_result) return 'unwashed'
  if (wash_category === 'ok_to_contact') return 'active'
  if (wash_category === 'others_client') return 'others_client'
  if (wash_category === 'pool_conflict' || wash_category === 'redlisted_company') return 'pool_conflict'
  if (wash_category === 'dnc') return 'dnc'
  if (wash_result === 'Green') return 'active'
  if (wash_result === 'Red') return 'pool_conflict'
  return 'dnc'
}

export async function getProspectsForCompany(companyName: string): Promise<CompanyProspect[]> {
  const rows = await getDb()
    .select({
      id: nexus_prospects.id,
      first_name: nexus_prospects.first_name,
      last_name: nexus_prospects.last_name,
      wash_result: nexus_prospects.wash_result,
      wash_category: nexus_prospects.wash_category,
    })
    .from(nexus_prospects)
    .where(sql`lower(trim(${nexus_prospects.company})) = lower(trim(${companyName}))`)
  return rows.map(r => ({
    id: r.id, first_name: r.first_name, last_name: r.last_name,
    status: prospectStatus(r.wash_result, r.wash_category),
  }))
}

export interface OverviewStats {
  companiesMapped: number
  totalWashed: number
  totalBooked: number
  untouchedCount: number
  nationalities: { nationality: string; count: number }[]
  topCompanies: { name: string; booked: number }[]
  sources: { source: string; count: number }[]
  untouched: { name: string; sector: string | null; employeesEst: number | null; area: string | null }[]
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const db = getDb()

  const [[companiesRow], [washedRow], [bookedRow]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(map_companies),
    db.select({ n: sql<number>`count(*)` }).from(nexus_prospects).where(sql`${nexus_prospects.company} is not null and ${nexus_prospects.company} != ''`),
    db.select({ n: sql<number>`count(*)` }).from(apollo_calls).where(eq(apollo_calls.outcome, 'booked')),
  ])

  const nationalityRows = await db
    .select({ nationality: apollo_calls.prospect_nationality, count: sql<number>`count(*)` })
    .from(apollo_calls)
    .where(sql`${apollo_calls.outcome} = 'booked' and ${apollo_calls.prospect_nationality} is not null`)
    .groupBy(apollo_calls.prospect_nationality)
    .orderBy(desc(sql`count(*)`))

  const sourceRows = await db
    .select({ source: apollo_calls.lead_source, count: sql<number>`count(*)` })
    .from(apollo_calls)
    .where(sql`${apollo_calls.outcome} = 'booked' and ${apollo_calls.lead_source} is not null`)
    .groupBy(apollo_calls.lead_source)
    .orderBy(desc(sql`count(*)`))

  const topCompanyRows = await db
    .select({ name: apollo_calls.company_name, booked: sql<number>`count(*)` })
    .from(apollo_calls)
    .where(sql`${apollo_calls.outcome} = 'booked' and ${apollo_calls.company_name} is not null`)
    .groupBy(apollo_calls.company_name)
    .orderBy(desc(sql`count(*)`))
    .limit(10)

  const untouchedRows = await db
    .select({
      name: map_companies.name, sector: map_companies.sector,
      employees_est: map_companies.employees_est, area: map_companies.area,
    })
    .from(map_companies)
    .leftJoin(nexus_prospects, prospectJoin)
    .leftJoin(apollo_calls, callJoin)
    .where(sql`${nexus_prospects.id} is null and ${apollo_calls.id} is null and ${map_companies.prospect_priority} != 'avoid'`)
    .groupBy(map_companies.id)
    .orderBy(desc(map_companies.employees_est))
    .limit(20)

  return {
    companiesMapped: companiesRow?.n ?? 0,
    totalWashed: washedRow?.n ?? 0,
    totalBooked: bookedRow?.n ?? 0,
    untouchedCount: untouchedRows.length,
    nationalities: nationalityRows.filter(r => r.nationality).map(r => ({ nationality: r.nationality!, count: r.count })),
    topCompanies: topCompanyRows.filter(r => r.name).map(r => ({ name: r.name!, booked: r.booked })),
    sources: sourceRows.filter(r => r.source).map(r => ({ source: r.source!, count: r.count })),
    untouched: untouchedRows.map(r => ({ name: r.name, sector: r.sector, employeesEst: r.employees_est, area: r.area })),
  }
}
