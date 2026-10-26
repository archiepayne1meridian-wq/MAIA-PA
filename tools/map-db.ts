// MAP (codename atlas) — pure DB functions. No Claude calls (that's src/lib/map.ts).
// Live stats are computed in JS, not a SQL join — matching a prospect/call's
// free-text company name against a mapped company needs to check the
// company's aliases too ("P&G" -> "Procter & Gamble EMEA HQ"), which isn't
// worth expressing as SQL against a JSON column at this scale (a few hundred
// prospects, a few hundred calls, ~150 companies). Nothing is cached — every
// call re-fetches and re-aggregates, so a new wash result or booking shows
// up immediately.

import { getDb } from '@/db'
import { map_companies, nexus_prospects, apollo_calls } from '@/db/schema'
import { eq, sql, isNotNull, and, ne, desc } from 'drizzle-orm'

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
  aliases: string[]
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
  meetings_sat: number
  nationalities: Record<string, number>
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function toMapCompany(row: typeof map_companies.$inferSelect): MapCompany {
  return {
    ...row,
    prospect_priority: row.prospect_priority as MapCompany['prospect_priority'],
    swiss_offices: parseStringArray(row.swiss_offices),
    aliases: parseStringArray(row.aliases),
  }
}

// Lowercase, accent-folded (NFD + strip combining marks), punctuation
// stripped, whitespace collapsed — "Nestlé S.A." and "nestle sa" both
// normalise to "nestle sa". Plain lowercase+trim alone (the original
// version of this function) under-matched real prospect data badly: company
// free text varies in accents, "&"/"and", "Ltd"/"Inc"/"AG"/"SA" suffixes,
// etc., none of which a strict normalised-equality check tolerates.
const norm = (s: string | null | undefined): string =>
  (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Every known name variant (canonical name + aliases) -> company id.
function buildNameToId(companies: MapCompany[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const c of companies) {
    map.set(norm(c.name), c.id)
    for (const alias of c.aliases) map.set(norm(alias), c.id)
  }
  return map
}

// Minimum length before a substring-containment match is trusted — without
// this, a short variant name (e.g. "AG", "SA") would spuriously "match"
// almost every prospect's company string.
const MIN_FUZZY_LEN = 4

// Exact normalised match first; falls back to substring containment in
// either direction (prospect text contains a known name/alias, or vice
// versa) for near-miss formatting (abbreviations, legal suffixes, partial
// names) — guarded by MIN_FUZZY_LEN so short names can't false-positive
// against everything.
export function findCompanyId(rawCompany: string, nameToId: Map<string, number>): number | undefined {
  const target = norm(rawCompany)
  if (!target) return undefined
  const exact = nameToId.get(target)
  if (exact !== undefined) return exact
  if (target.length < MIN_FUZZY_LEN) return undefined
  for (const [variant, id] of nameToId) {
    if (variant.length < MIN_FUZZY_LEN) continue
    if (target.includes(variant) || variant.includes(target)) return id
  }
  return undefined
}

// Same exact-then-fuzzy-containment logic as findCompanyId, against a plain
// set of normalised variants rather than a name->id map — used wherever the
// company is already known (e.g. matching prospects against one specific
// company's own name+aliases) and only a yes/no match is needed.
function matchesAnyVariant(rawCompany: string | null, normalisedVariants: Set<string>): boolean {
  const target = norm(rawCompany)
  if (!target) return false
  if (normalisedVariants.has(target)) return true
  if (target.length < MIN_FUZZY_LEN) return false
  for (const variant of normalisedVariants) {
    if (variant.length < MIN_FUZZY_LEN) continue
    if (target.includes(variant) || variant.includes(target)) return true
  }
  return false
}

export type ProspectStatus = 'active' | 'pool_conflict' | 'dnc' | 'others_client' | 'unwashed'

// Mirrors NexusWorkspace.tsx's statusOf() — a Claude wash-parse sets
// wash_category explicitly; the older plain 3-column paste only ever set
// wash_result, so a Green/DNC/Red row with no category falls to the
// matching legacy bucket.
function prospectStatus(wash_result: string | null, wash_category: string | null): ProspectStatus {
  if (!wash_result) return 'unwashed'
  if (wash_category === 'ok_to_contact') return 'active'
  if (wash_category === 'others_client') return 'others_client'
  if (wash_category === 'pool_conflict' || wash_category === 'redlisted_company') return 'pool_conflict'
  if (wash_category === 'dnc') return 'dnc'
  if (wash_result === 'Green') return 'active'
  if (wash_result === 'Red') return 'pool_conflict'
  return 'dnc'
}

interface CompanyStats {
  total_washed: number
  green_prospects: number
  dnc_count: number
  others_client_count: number
  total_calls: number
  total_booked: number
  meetings_sat: number
  nationalities: Record<string, number>
}

function emptyStats(): CompanyStats {
  return { total_washed: 0, green_prospects: 0, dnc_count: 0, others_client_count: 0, total_calls: 0, total_booked: 0, meetings_sat: 0, nationalities: {} }
}

export async function getCompaniesWithStats(): Promise<MapCompanyWithStats[]> {
  const db = getDb()
  const [companyRows, prospectRows, callRows] = await Promise.all([
    db.select().from(map_companies),
    db.select({
      id: nexus_prospects.id, company: nexus_prospects.company,
      wash_result: nexus_prospects.wash_result, wash_category: nexus_prospects.wash_category,
    }).from(nexus_prospects).where(and(isNotNull(nexus_prospects.company), ne(nexus_prospects.company, ''))),
    db.select({
      id: apollo_calls.id, company_name: apollo_calls.company_name,
      outcome: apollo_calls.outcome, prospect_nationality: apollo_calls.prospect_nationality,
      meeting_type: apollo_calls.meeting_type,
    }).from(apollo_calls).where(isNotNull(apollo_calls.company_name)),
  ])

  const companies = companyRows.map(toMapCompany)
  const nameToId = buildNameToId(companies)
  const stats = new Map<number, CompanyStats>()

  for (const p of prospectRows) {
    const id = findCompanyId(p.company ?? '', nameToId)
    if (id === undefined) continue
    const s = stats.get(id) ?? emptyStats()
    s.total_washed++
    const status = prospectStatus(p.wash_result, p.wash_category)
    if (status === 'active') s.green_prospects++
    if (status === 'dnc') s.dnc_count++
    if (status === 'others_client') s.others_client_count++
    stats.set(id, s)
  }

  for (const c of callRows) {
    const id = findCompanyId(c.company_name ?? '', nameToId)
    if (id === undefined) continue
    const s = stats.get(id) ?? emptyStats()
    s.total_calls++
    if (c.outcome === 'booked') s.total_booked++
    if (c.meeting_type === 'meeting') s.meetings_sat++
    if (c.prospect_nationality) s.nationalities[c.prospect_nationality] = (s.nationalities[c.prospect_nationality] ?? 0) + 1
    stats.set(id, s)
  }

  return companies
    .map(c => ({ ...c, ...(stats.get(c.id) ?? emptyStats()) }))
    .sort((a, b) => b.total_booked - a.total_booked || b.total_washed - a.total_washed || a.name.localeCompare(b.name))
}

// Public helper for callers outside this file that need the same
// name+alias+fuzzy lookup (e.g. the Nexus prospect list's "not on map"
// column) without duplicating the matching logic.
export async function getCompanyNameToIdMap(): Promise<Map<string, number>> {
  const companies = (await getDb().select().from(map_companies)).map(toMapCompany)
  return buildNameToId(companies)
}

export async function getCompanyById(id: number): Promise<MapCompany | null> {
  const [row] = await getDb().select().from(map_companies).where(eq(map_companies.id, id)).limit(1)
  return row ? toMapCompany(row) : null
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
  aliases?: string[]
  office_type?: string
  prospect_priority?: 'high' | 'normal' | 'low' | 'avoid'
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
    aliases: input.aliases ? JSON.stringify(input.aliases) : null,
    office_type: input.office_type ?? 'office',
    prospect_priority: input.prospect_priority ?? 'normal',
  }).returning({ id: map_companies.id })
  return row!.id
}

// Same spot MapCanvas centres the whole territory view on — a deliberately
// recognisable "not placed yet" default rather than a schema change, since
// lat/lng are NOT NULL on this table.
export const UNPLACED_LAT = 46.2044
export const UNPLACED_LNG = 6.1432

// Auto-adds a basic map_companies row for any company mentioned on a
// prospect that doesn't already match one (by the same name+alias+fuzzy
// lookup everything else here uses) — no threshold, every company a washed
// prospect works at goes on the map. Placed at Geneva centre with no AI
// summary until Archie (or a click) refines it; MapWorkspace shows a note
// on these ("Auto-added from prospect list — coordinates not yet set")
// detected by the exact UNPLACED_LAT/LNG default.
export async function ensureCompanyOnMap(companyName: string): Promise<void> {
  const name = companyName.trim()
  if (!name) return
  const companies = (await getDb().select().from(map_companies)).map(toMapCompany)
  const nameToId = buildNameToId(companies)
  if (findCompanyId(name, nameToId) !== undefined) return
  await addCompany({ name, lat: UNPLACED_LAT, lng: UNPLACED_LNG, prospect_priority: 'normal' })
}

export async function setCompanyAliases(name: string, aliases: string[]): Promise<void> {
  await getDb().update(map_companies)
    .set({ aliases: JSON.stringify(aliases), updated_at: Math.floor(Date.now() / 1000) })
    .where(eq(map_companies.name, name))
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
export async function updateCassandraNoteById(id: number, snippet: string): Promise<void> {
  await getDb().update(map_companies)
    .set({ cassandra_notes: snippet, cassandra_updated_at: Math.floor(Date.now() / 1000) })
    .where(eq(map_companies.id, id))
}

export interface CompanyNameVariant { id: number; variant: string }

// Every (id, name-or-alias) pair — lets a caller substring-match free text
// against every known variant, then act on the right company by id.
export async function getAllCompanyNameVariants(): Promise<CompanyNameVariant[]> {
  const rows = await getDb().select({ id: map_companies.id, name: map_companies.name, aliases: map_companies.aliases }).from(map_companies)
  const variants: CompanyNameVariant[] = []
  for (const r of rows) {
    variants.push({ id: r.id, variant: r.name })
    for (const alias of parseStringArray(r.aliases)) variants.push({ id: r.id, variant: alias })
  }
  return variants
}

export interface CompanyProspect {
  id: string
  first_name: string | null
  last_name: string | null
  status: ProspectStatus
  isSelfEmployed: boolean
}

// Self-employed prospects are never filtered out here — a consultant or
// contractor listing this company as their employer is still a genuine
// prospect at that company (often senior/mobile), just flagged distinctly
// (isSelfEmployed) so the map panel can tag them "SE" rather than implying
// they're on staff.
export async function getProspectsForCompany(companyId: number): Promise<CompanyProspect[]> {
  const company = await getCompanyById(companyId)
  if (!company) return []
  const variants = new Set([norm(company.name), ...company.aliases.map(norm)])

  const rows = await getDb()
    .select({
      id: nexus_prospects.id, first_name: nexus_prospects.first_name, last_name: nexus_prospects.last_name,
      company: nexus_prospects.company, wash_result: nexus_prospects.wash_result, wash_category: nexus_prospects.wash_category,
      employment_type: nexus_prospects.employment_type,
    })
    .from(nexus_prospects)
    .where(and(isNotNull(nexus_prospects.company), ne(nexus_prospects.company, '')))

  return rows
    .filter(r => matchesAnyVariant(r.company, variants))
    .map(r => ({
      id: r.id, first_name: r.first_name, last_name: r.last_name,
      status: prospectStatus(r.wash_result, r.wash_category),
      isSelfEmployed: r.employment_type === 'Self-Employed',
    }))
}

// Distinct prospect company strings that don't match any mapped company
// (by the same name+alias+fuzzy lookup as everything else here) — surfaced
// in the map overview panel so Archie can see what's missing. In practice
// this should shrink over time on its own: ensureCompanyOnMap auto-adds any
// NEW company going forward, so this list is really "backlog from before
// that existed" rather than an ongoing gap.
export async function getUnmatchedProspectCompanies(limit = 30): Promise<{ count: number; names: string[] }> {
  const db = getDb()
  const [companyRows, prospectRows] = await Promise.all([
    db.select().from(map_companies),
    db.select({ company: nexus_prospects.company }).from(nexus_prospects)
      .where(and(isNotNull(nexus_prospects.company), ne(nexus_prospects.company, ''))),
  ])
  const nameToId = buildNameToId(companyRows.map(toMapCompany))

  const seen = new Set<string>()
  const unmatched: string[] = []
  for (const row of prospectRows) {
    const company = row.company!.trim()
    const key = norm(company)
    if (seen.has(key)) continue
    seen.add(key)
    if (findCompanyId(company, nameToId) === undefined) unmatched.push(company)
  }
  unmatched.sort((a, b) => a.localeCompare(b))
  return { count: unmatched.length, names: unmatched.slice(0, limit) }
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
  unmatchedCompanies: { count: number; names: string[] }
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const [companies, unmatchedCompanies] = await Promise.all([getCompaniesWithStats(), getUnmatchedProspectCompanies()])

  const totalWashed = companies.reduce((sum, c) => sum + c.total_washed, 0)
  const totalBooked = companies.reduce((sum, c) => sum + c.total_booked, 0)

  const nationalityTotals: Record<string, number> = {}
  for (const c of companies) {
    for (const [nat, count] of Object.entries(c.nationalities)) {
      nationalityTotals[nat] = (nationalityTotals[nat] ?? 0) + count
    }
  }

  const db = getDb()
  const sourceRows = await db
    .select({ source: apollo_calls.lead_source, count: sql<number>`count(*)` })
    .from(apollo_calls)
    .where(sql`${apollo_calls.outcome} = 'booked' and ${apollo_calls.lead_source} is not null`)
    .groupBy(apollo_calls.lead_source)
    .orderBy(desc(sql`count(*)`))

  const untouched = companies
    .filter(c => c.total_washed === 0 && c.total_calls === 0 && c.prospect_priority !== 'avoid')
    .sort((a, b) => (b.employees_est ?? 0) - (a.employees_est ?? 0))
    .slice(0, 20)

  return {
    companiesMapped: companies.length,
    totalWashed,
    totalBooked,
    untouchedCount: untouched.length,
    nationalities: Object.entries(nationalityTotals).map(([nationality, count]) => ({ nationality, count })).sort((a, b) => b.count - a.count),
    topCompanies: companies.filter(c => c.total_booked > 0).slice(0, 10).map(c => ({ name: c.name, booked: c.total_booked })),
    sources: sourceRows.filter(r => r.source).map(r => ({ source: r.source!, count: r.count })),
    untouched: untouched.map(c => ({ name: c.name, sector: c.sector, employeesEst: c.employees_est, area: c.area })),
    unmatchedCompanies,
  }
}
