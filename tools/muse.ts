// Pure DB functions for MUSE. No Claude calls, no Slack calls.

import { desc, eq, gte, or, like, and } from 'drizzle-orm'
import { getDb } from '@/db'
import { muse_entries, muse_change_log, muse_links, muse_pending } from '@/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MuseEntry {
  id: string
  sector: string
  title: string
  summary: string
  content: string
  brief_depth: string
  source: string
  source_agent: string | null
  status: string
  date_filed: number
  last_updated: number
  created_at: number
}

export interface MuseChangeLog {
  id: string
  entry_id: string
  changed_at: number
  change_summary: string
  previous_content: string
}

export interface MuseLink {
  id: string
  entry_id_a: string
  entry_id_b: string
  link_type: string
  created_at: number
}

export interface MusePending {
  id: string
  source: string
  source_agent: string | null
  suggested_sector: string
  suggested_title: string
  suggested_summary: string
  suggested_content: string
  suggested_depth: string
  suggested_links: string  // JSON array of titles
  status: string
  slack_ts: string | null
  created_at: number
}

export interface MuseEntryFull extends MuseEntry {
  changeLog: MuseChangeLog[]
  links: MuseLink[]
}

// ─── Entries ──────────────────────────────────────────────────────────────────

export async function saveEntry(
  entry: Omit<MuseEntry, 'id' | 'created_at'>,
): Promise<string> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(muse_entries).values({
    id,
    sector: entry.sector,
    title: entry.title,
    summary: entry.summary,
    content: entry.content,
    brief_depth: entry.brief_depth,
    source: entry.source,
    source_agent: entry.source_agent ?? null,
    status: entry.status ?? 'active',
    date_filed: entry.date_filed ?? now,
    last_updated: entry.last_updated ?? now,
    created_at: now,
  })
  return id
}

export async function updateEntry(
  id: string,
  newContent: string,
  changeSummary: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  // Load current content for archive
  const rows = await getDb()
    .select({ content: muse_entries.content })
    .from(muse_entries)
    .where(eq(muse_entries.id, id))
    .limit(1)
  const previousContent = rows[0]?.content ?? ''

  await saveChangeLog(id, changeSummary, previousContent)
  await getDb()
    .update(muse_entries)
    .set({ content: newContent, last_updated: now })
    .where(eq(muse_entries.id, id))
}

export async function getEntries(sector?: string): Promise<MuseEntry[]> {
  const db = getDb()
  if (sector) {
    const rows = await db
      .select()
      .from(muse_entries)
      .where(and(eq(muse_entries.status, 'active'), eq(muse_entries.sector, sector)))
      .orderBy(desc(muse_entries.last_updated))
    return rows as MuseEntry[]
  }
  const rows = await db
    .select()
    .from(muse_entries)
    .where(eq(muse_entries.status, 'active'))
    .orderBy(desc(muse_entries.last_updated))
  return rows as MuseEntry[]
}

export async function getEntry(id: string): Promise<MuseEntryFull | null> {
  const rows = await getDb()
    .select()
    .from(muse_entries)
    .where(eq(muse_entries.id, id))
    .limit(1)
  const entry = rows[0]
  if (!entry) return null

  const [changeLog, links] = await Promise.all([
    getDb()
      .select()
      .from(muse_change_log)
      .where(eq(muse_change_log.entry_id, id))
      .orderBy(desc(muse_change_log.changed_at)),
    getDb()
      .select()
      .from(muse_links)
      .where(or(eq(muse_links.entry_id_a, id), eq(muse_links.entry_id_b, id)))
      .orderBy(desc(muse_links.created_at)),
  ])

  return {
    ...(entry as MuseEntry),
    changeLog: changeLog as MuseChangeLog[],
    links: links as MuseLink[],
  }
}

export async function getAllEntryTitles(): Promise<{ id: string; title: string; sector: string }[]> {
  const rows = await getDb()
    .select({ id: muse_entries.id, title: muse_entries.title, sector: muse_entries.sector })
    .from(muse_entries)
    .where(eq(muse_entries.status, 'active'))
    .orderBy(desc(muse_entries.last_updated))
  return rows
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchEntries(query: string, sector?: string): Promise<MuseEntry[]> {
  const db = getDb()
  const q = `%${query.toLowerCase()}%`
  const baseFilter = eq(muse_entries.status, 'active')

  // SQLite LIKE is case-insensitive for ASCII by default
  const textMatch = or(
    like(muse_entries.title, q),
    like(muse_entries.summary, q),
    like(muse_entries.content, q),
  )

  const filter = sector
    ? and(baseFilter, eq(muse_entries.sector, sector), textMatch)
    : and(baseFilter, textMatch)

  const rows = await db
    .select()
    .from(muse_entries)
    .where(filter)
    .orderBy(desc(muse_entries.last_updated))
    .limit(sector ? 5 : 8)

  return rows as MuseEntry[]
}

// ─── Pending ──────────────────────────────────────────────────────────────────

export async function savePending(
  pending: Omit<MusePending, 'id' | 'created_at' | 'status'>,
): Promise<string> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(muse_pending).values({
    id,
    source: pending.source,
    source_agent: pending.source_agent ?? null,
    suggested_sector: pending.suggested_sector,
    suggested_title: pending.suggested_title,
    suggested_summary: pending.suggested_summary ?? '',
    suggested_content: pending.suggested_content,
    suggested_depth: pending.suggested_depth,
    suggested_links: pending.suggested_links ?? '[]',
    status: 'awaiting',
    created_at: now,
  })
  return id
}

export async function getEntryIdsByTitles(
  titles: string[],
): Promise<{ id: string; title: string }[]> {
  if (titles.length === 0) return []
  const rows = await getDb()
    .select({ id: muse_entries.id, title: muse_entries.title })
    .from(muse_entries)
    .where(eq(muse_entries.status, 'active'))
  // Match by exact title (case-insensitive)
  const lowerTitles = new Set(titles.map(t => t.toLowerCase()))
  return rows.filter(r => lowerTitles.has(r.title.toLowerCase()))
}

export async function updatePending(id: string, status: string): Promise<void> {
  await getDb().update(muse_pending).set({ status }).where(eq(muse_pending.id, id))
}

export async function updatePendingSlackTs(id: string, slackTs: string): Promise<void> {
  await getDb().update(muse_pending).set({ slack_ts: slackTs }).where(eq(muse_pending.id, id))
}

export async function getPendingBySlackTs(slackTs: string): Promise<MusePending | null> {
  const rows = await getDb()
    .select()
    .from(muse_pending)
    .where(and(eq(muse_pending.slack_ts, slackTs), eq(muse_pending.status, 'awaiting')))
    .limit(1)
  return (rows[0] as MusePending) ?? null
}

export async function getPending(): Promise<MusePending[]> {
  const rows = await getDb()
    .select()
    .from(muse_pending)
    .where(eq(muse_pending.status, 'awaiting'))
    .orderBy(desc(muse_pending.created_at))
  return rows as MusePending[]
}

export async function getPendingById(id: string): Promise<MusePending | null> {
  const rows = await getDb()
    .select()
    .from(muse_pending)
    .where(eq(muse_pending.id, id))
    .limit(1)
  return (rows[0] as MusePending) ?? null
}

// ─── Change log ───────────────────────────────────────────────────────────────

export async function saveChangeLog(
  entryId: string,
  changeSummary: string,
  previousContent: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(muse_change_log).values({
    id: crypto.randomUUID(),
    entry_id: entryId,
    changed_at: now,
    change_summary: changeSummary,
    previous_content: previousContent,
  })
}

// ─── Links ────────────────────────────────────────────────────────────────────

export async function saveLink(
  entryIdA: string,
  entryIdB: string,
  linkType: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(muse_links).values({
    id: crypto.randomUUID(),
    entry_id_a: entryIdA,
    entry_id_b: entryIdB,
    link_type: linkType,
    created_at: now,
  })
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export async function getInsights(): Promise<{
  pending: MusePending[]
  recentEntries: MuseEntry[]
}> {
  const [pending, recentEntries] = await Promise.all([
    getPending(),
    getDb()
      .select()
      .from(muse_entries)
      .where(eq(muse_entries.status, 'active'))
      .orderBy(desc(muse_entries.last_updated))
      .limit(5)
      .then(r => r as MuseEntry[]),
  ])
  return { pending, recentEntries }
}

// ─── Graph data (entries + links for D3) ─────────────────────────────────────

export async function getGraphData(): Promise<{
  nodes: MuseEntry[]
  links: MuseLink[]
}> {
  const [nodes, links] = await Promise.all([
    getEntries(),
    getDb()
      .select()
      .from(muse_links)
      .orderBy(desc(muse_links.created_at))
      .then(r => r as MuseLink[]),
  ])
  return { nodes, links }
}

// ─── Recent entries by sector for harvest dedup ──────────────────────────────

export async function getRecentEntriesBySector(
  sector: string,
  days: number,
): Promise<MuseEntry[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400
  const rows = await getDb()
    .select()
    .from(muse_entries)
    .where(and(eq(muse_entries.sector, sector), eq(muse_entries.status, 'active'), gte(muse_entries.created_at, since)))
    .orderBy(desc(muse_entries.created_at))
  return rows as MuseEntry[]
}
