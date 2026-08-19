// Pure DB functions for MUSE's prospect case system. No Claude calls, no Slack calls.
//
// A case is linked to knowledge entries (regulations, products, training) via the
// existing muse_links table, using the reserved link_type 'case' — this marks one side
// of the link as a muse_cases.id rather than a muse_entries.id, so callers can tell
// which table to resolve the "other side" against without a schema change.

import { desc, eq, or, and, like } from 'drizzle-orm'
import { getDb } from '@/db'
import { muse_cases, muse_case_events, muse_links, muse_entries } from '@/db/schema'

export const CASE_LINK_TYPE = 'case'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MuseCase {
  id: string
  display_name: string
  company: string | null
  location: string | null
  occupation: string | null
  financial_profile: string | null
  status: string
  outcome: string | null
  created_at: number
  updated_at: number
}

export interface MuseCaseEvent {
  id: string
  case_id: string
  event_type: string
  date: string
  summary: string
  what_suggested: string | null
  adviser_recommendation: string | null
  worked: string | null
  apollo_call_id: string | null
  created_at: number
}

export interface CaseWithEvents extends MuseCase {
  events: MuseCaseEvent[]
  linkedEntries: { id: string; title: string; sector: string }[]
}

// ─── Cases ────────────────────────────────────────────────────────────────────

// Match on first-name-initial + last-initial + company — anonymised display_name means
// exact full-name matching isn't meaningful; company is the disambiguating signal.
export async function findCase(displayName: string, company: string | null): Promise<MuseCase | null> {
  const db = getDb()
  const rows = await db.select().from(muse_cases).where(eq(muse_cases.display_name, displayName))
  if (rows.length === 0) return null

  if (company) {
    const withCompany = rows.find(r => (r.company ?? '').toLowerCase() === company.toLowerCase())
    if (withCompany) return withCompany as MuseCase
  }
  // Fall back to the most recently updated case with this display name if company
  // didn't match or wasn't given — better than silently creating a duplicate.
  return (rows as MuseCase[]).sort((a, b) => b.updated_at - a.updated_at)[0]!
}

export async function createCase(data: {
  display_name: string
  company?: string | null
  location?: string | null
  occupation?: string | null
  financial_profile?: string | null
  status?: string
  outcome?: string | null
}): Promise<string> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(muse_cases).values({
    id,
    display_name: data.display_name,
    company: data.company ?? null,
    location: data.location ?? null,
    occupation: data.occupation ?? null,
    financial_profile: data.financial_profile ?? null,
    status: data.status ?? 'active',
    outcome: data.outcome ?? null,
    created_at: now,
    updated_at: now,
  })
  return id
}

export async function updateCase(
  id: string,
  data: Partial<Omit<MuseCase, 'id' | 'created_at' | 'updated_at'>>,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await getDb().update(muse_cases).set({ ...data, updated_at: now }).where(eq(muse_cases.id, id))
}

export async function getCase(id: string): Promise<MuseCase | null> {
  const rows = await getDb().select().from(muse_cases).where(eq(muse_cases.id, id)).limit(1)
  return (rows[0] as MuseCase) ?? null
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function addCaseEvent(
  caseId: string,
  event: {
    event_type: string
    date: string
    summary: string
    what_suggested?: string | null
    adviser_recommendation?: string | null
    worked?: string | null
    apollo_call_id?: string | null
  },
): Promise<string> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(muse_case_events).values({
    id,
    case_id: caseId,
    event_type: event.event_type,
    date: event.date,
    summary: event.summary,
    what_suggested: event.what_suggested ?? null,
    adviser_recommendation: event.adviser_recommendation ?? null,
    worked: event.worked ?? null,
    apollo_call_id: event.apollo_call_id ?? null,
    created_at: now,
  })
  // Touch the case's updated_at so it surfaces in getRecentCases.
  await getDb().update(muse_cases).set({ updated_at: now }).where(eq(muse_cases.id, caseId))
  return id
}

// ─── Case + events + linked knowledge, for the case detail view ───────────────

export async function getCaseWithEvents(id: string): Promise<CaseWithEvents | null> {
  const db = getDb()
  const c = await getCase(id)
  if (!c) return null

  const events = await db
    .select()
    .from(muse_case_events)
    .where(eq(muse_case_events.case_id, id))
    .orderBy(muse_case_events.date)

  const linkRows = await db
    .select()
    .from(muse_links)
    .where(and(eq(muse_links.link_type, CASE_LINK_TYPE), or(eq(muse_links.entry_id_a, id), eq(muse_links.entry_id_b, id))))

  const entryIds = linkRows.map(l => (l.entry_id_a === id ? l.entry_id_b : l.entry_id_a))
  let linkedEntries: { id: string; title: string; sector: string }[] = []
  if (entryIds.length > 0) {
    const entryRows = await db
      .select({ id: muse_entries.id, title: muse_entries.title, sector: muse_entries.sector })
      .from(muse_entries)
      .where(eq(muse_entries.status, 'active'))
    const idSet = new Set(entryIds)
    linkedEntries = entryRows.filter(r => idSet.has(r.id))
  }

  return { ...c, events: events as MuseCaseEvent[], linkedEntries }
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchCases(query: string): Promise<MuseCase[]> {
  const q = `%${query.toLowerCase()}%`
  const rows = await getDb()
    .select()
    .from(muse_cases)
    .where(
      or(
        like(muse_cases.location, q),
        like(muse_cases.occupation, q),
        like(muse_cases.financial_profile, q),
        like(muse_cases.outcome, q),
        like(muse_cases.display_name, q),
        like(muse_cases.company, q),
      ),
    )
    .orderBy(desc(muse_cases.updated_at))
    .limit(8)
  return rows as MuseCase[]
}

export async function getRecentCases(limit: number): Promise<MuseCase[]> {
  const rows = await getDb()
    .select()
    .from(muse_cases)
    .orderBy(desc(muse_cases.updated_at))
    .limit(limit)
  return rows as MuseCase[]
}

// ─── Linking a case to a knowledge entry ───────────────────────────────────────

export async function linkCaseToMuse(caseId: string, museEntryId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(muse_links).values({
    id: crypto.randomUUID(),
    entry_id_a: caseId,
    entry_id_b: museEntryId,
    link_type: CASE_LINK_TYPE,
    created_at: now,
  })
}
