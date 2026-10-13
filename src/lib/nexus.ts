// NEXUS — parsing logic (Sales Navigator paste, wash-result paste) and the
// right-context-panel builder. The Sales Nav parser calls Claude — a prior
// deterministic regex/block-splitter version kept hitting new Sales
// Navigator UI-chrome wordings it hadn't seen before (e.g. "<Name>'s
// profile picture…was last active N days ago", "Second-degree connection"
// spelled out rather than "2nd") and leaking them into job_role/company.
// An LLM generalises across wording variants a fixed noise-list can't.

import { askWith } from './claude'
import { getStats, getWashRateByBatch, getLastImport, type NexusStats } from '../../tools/nexus-db'

export interface NameLookup { id: string; firstLower: string; lastLower: string }

// ─── Sales Navigator paste parser (Claude-based) ────────────────────────────

export interface SalesNavCandidate {
  firstName: string
  lastName: string
  company: string | null
  jobRole: string | null
  isDuplicate: boolean
  // Surname parsed as a single letter (e.g. "Oana O.") — still imported, but
  // flagged in the UI so Archie can go back and fix the spelling by hand.
  flagged: boolean
}

const SALESNAV_PARSER_SYSTEM_PROMPT = `You are a data parser. Extract people from LinkedIn Sales Navigator paste text.

Return a JSON array ONLY — no markdown, no code blocks, no explanation:
[{"firstName":"","lastName":"","jobTitle":"","company":"","location":"","flagSurname":false}]

Rules:
- Each person block starts with "Select <Name>"
- Strip qualifications from names before splitting first/last: MBA, MSc, BSc, BA, MA, PhD, DPhil, CFA, CFP, ACCA, ACA, FCA, FCCA, MCSI, CPA, CIM, LLB, LLM, PMP, MBE, OBE, CBE, CIMA, IMC, CMT, CAIA
- Strip pre-nominal titles: Dr, Dr., Prof, Prof., Sir, Dame, Lord, Lady, Baron, Baroness
- Split name on last space: "James Hill" → firstName "James", lastName "Hill"
- If company looks like a location (contains: Switzerland, Geneva, Zürich, Zurich, London, Paris, Area, Metropolitan, Region) → set company to null
- Set flagSurname: true if last name is a single letter or single letter + period (e.g. "O.", "A.")
- location field: the city/country line (3rd meaningful field after job title and company)
- Noise to completely ignore: "2nd"/"3rd"/"1st" connection lines (abbreviated OR spelled out, e.g. "Second-degree connection"), "Saved Badge", "<Name>'s profile picture" / "was last active N days ago", "Add note", "No activity", dates like "10/7/2026", "1 List", "(+"
- A person may have no company — that is valid, set company to null`

interface ClaudeParsedPerson {
  firstName?: string
  lastName?: string
  jobTitle?: string | null
  company?: string | null
  location?: string | null
  flagSurname?: boolean
}

// Claude is told to return a bare JSON array, but models sometimes wrap it
// in a markdown fence anyway — strip that, then slice to the outermost
// brackets so stray prose before/after doesn't break JSON.parse.
function extractJsonArray(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  const text = fenced?.[1] ? fenced[1].trim() : raw.trim()
  const first = text.indexOf('[')
  const last = text.lastIndexOf(']')
  if (first !== -1 && last > first) return text.slice(first, last + 1)
  return text
}

export async function parseSalesNav(text: string, existing: NameLookup[]): Promise<SalesNavCandidate[]> {
  const existingKeys = new Set(existing.map(n => `${n.firstLower} ${n.lastLower}`))
  // 8192 gives headroom for a large paste (~100+ people) without truncating
  // mid-array — a cut-off response fails JSON.parse below rather than
  // silently returning a partial list.
  const raw = await askWith(SALESNAV_PARSER_SYSTEM_PROMPT, text.trim(), 8192, 'claude-sonnet-4-6')

  let people: ClaudeParsedPerson[]
  try {
    const parsed = JSON.parse(extractJsonArray(raw))
    if (!Array.isArray(parsed)) throw new Error('not an array')
    people = parsed
  } catch {
    throw new Error('Claude returned an unparseable response for the Sales Nav paste')
  }

  const seenInPaste = new Set<string>()
  const candidates: SalesNavCandidate[] = []
  for (const p of people) {
    const first = (p.firstName ?? '').trim()
    const last = (p.lastName ?? '').trim()
    if (!first || !last) continue
    const key = `${first.toLowerCase()} ${last.toLowerCase()}`
    if (seenInPaste.has(key)) continue
    seenInPaste.add(key)

    candidates.push({
      firstName: first,
      lastName: last,
      company: p.company?.trim() || null,
      jobRole: p.jobTitle?.trim() || null,
      isDuplicate: existingKeys.has(key),
      flagged: Boolean(p.flagSurname),
    })
  }

  return candidates
}

// ─── Wash results paste parser ───────────────────────────────────────────────
//
// Archie's daily wash overview: one prospect per line, name followed by a
// status keyword somewhere on the line (tab/colon/dash separated, exact
// punctuation varies by how it's exported, so the status keyword — not a
// fixed delimiter — is what anchors the split). Matches against existing
// prospects by exact case-insensitive "first last" (or "last first").

export interface WashUpdateCandidate {
  id: string | null
  name: string
  washResult: 'Green' | 'Red' | 'Do Not Contact'
  matched: boolean
}

const STATUS_PATTERN = /\b(green|red|do\s*not\s*contact|dnc)\b/i

function normaliseStatus(raw: string): 'Green' | 'Red' | 'Do Not Contact' {
  const lower = raw.toLowerCase().replace(/\s+/g, ' ')
  if (lower === 'green') return 'Green'
  if (lower === 'red') return 'Red'
  return 'Do Not Contact'
}

export function parseWashResults(text: string, existing: NameLookup[]): WashUpdateCandidate[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const results: WashUpdateCandidate[] = []

  for (const line of lines) {
    const m = STATUS_PATTERN.exec(line)
    if (!m) continue

    const namePart = line.slice(0, m.index).replace(/[\t,:;–—-]+\s*$/, '').trim()
    if (!namePart) continue

    const washResult = normaliseStatus(m[1]!)
    const nameLower = namePart.toLowerCase().replace(/\s+/g, ' ')
    const match = existing.find(n =>
      `${n.firstLower} ${n.lastLower}` === nameLower || `${n.lastLower} ${n.firstLower}` === nameLower,
    )

    results.push({ id: match?.id ?? null, name: namePart, washResult, matched: Boolean(match) })
  }

  return results
}

// ─── Wash results paste parser — rich, Claude-based ──────────────────────────
//
// Archie's real wash sheet carries a Comments column with compliance detail
// (DNC vs. another advisor's active client vs. a pool conflict vs. a named
// redlisted company) that the plain 3-column paste above can't represent —
// this routes the full paste (Contact Name / Wash Result / Comments, as
// copied straight from Excel) through Claude to classify each row.

export type WashCategory = 'ok_to_contact' | 'dnc' | 'others_client' | 'pool_conflict' | 'redlisted_company'

export interface WashResultCandidate {
  id: string | null
  name: string
  result: 'green' | 'red'
  category: WashCategory
  reason: string
  conflictingAdvisor: string | null
  matched: boolean
}

const WASH_RESULTS_PARSER_SYSTEM_PROMPT = `You parse wash result data from a deVere Group prospect wash sheet.

You will receive raw tab-separated text copied from Excel. Extract each prospect row and classify it.

For each row return a JSON object with:
- name: string (the Contact Name column — full name as written)
- result: "green" | "red"
- category: one of:
    "ok_to_contact"     — Green result (Wash Result column says Green)
    "dnc"                — Red, Comments mention "DO NOT CONTACT" with no CLIENT list mention and no advisor/company named
    "others_client"      — Red, Comments mention "CLIENT list" (this is another advisor's active client)
    "pool_conflict"      — Red, Comments say the prospect is under another advisor's cold, lead, or referral pipeline
    "redlisted_company"  — Red, Comments mention a specific redlisted company (e.g. CERN, UEFA)
- reason: string (the full Comments text, with any "DO NOT CONTACT - " / "OK TO CONTACT - " prefix removed)
- conflicting_advisor: string | null (pool_conflict only — the advisor name(s) after the word "under", e.g. "Connor Shepherd". null for every other category)

Classification priority if Comments are ambiguous:
1. If "CLIENT list" appears → others_client
2. If "DO NOT CONTACT" appears with no advisor or company named → dnc
3. If a specific advisor name appears after "under" → pool_conflict
4. If a specific redlisted company is named → redlisted_company
5. Green → ok_to_contact

Skip the header row. Skip any row without a clear Contact Name and Wash Result.

Return ONLY a valid JSON array. No prose, no markdown, no explanation.`

interface RawWashRow {
  name?: string
  result?: string
  category?: string
  reason?: string
  conflicting_advisor?: string | null
}

const WASH_CATEGORIES: WashCategory[] = ['ok_to_contact', 'dnc', 'others_client', 'pool_conflict', 'redlisted_company']

export async function parseWashResultsRich(text: string, existing: NameLookup[]): Promise<WashResultCandidate[]> {
  const raw = await askWith(WASH_RESULTS_PARSER_SYSTEM_PROMPT, text.trim(), 4096, 'claude-sonnet-4-6')

  let rows: RawWashRow[]
  try {
    const parsed = JSON.parse(extractJsonArray(raw))
    if (!Array.isArray(parsed)) throw new Error('not an array')
    rows = parsed
  } catch {
    throw new Error('Claude returned an unparseable response for the wash results paste')
  }

  const candidates: WashResultCandidate[] = []
  for (const r of rows) {
    const name = (r.name ?? '').trim()
    if (!name) continue

    const category = WASH_CATEGORIES.includes(r.category as WashCategory) ? (r.category as WashCategory) : 'dnc'

    // Same "split on last space" convention as the Sales Nav parser above —
    // last name is the final word, first name is everything before it.
    const parts = name.split(/\s+/)
    const lastLower = (parts.length > 1 ? parts[parts.length - 1] : '').toLowerCase()
    const firstLower = (parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] ?? '')).toLowerCase()
    const match = existing.find(n => n.firstLower === firstLower && n.lastLower === lastLower)

    candidates.push({
      id: match?.id ?? null,
      name,
      result: category === 'ok_to_contact' ? 'green' : 'red',
      category,
      reason: (r.reason ?? '').trim(),
      conflictingAdvisor: category === 'pool_conflict' ? ((r.conflicting_advisor ?? '').trim() || null) : null,
      matched: Boolean(match),
    })
  }

  return candidates
}

// ─── Right context panel ─────────────────────────────────────────────────────

type ContextSection =
  | { type: 'stats'; title: string; rows: { label: string; value: string }[] }
  | { type: 'lastImport'; title: string; added: number; skipped: number; when: string }
  | { type: 'empty'; title: string; message: string }

function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : '0%'
}

// "Sunday 11 October, 22:04"
function formatImportTimestamp(ts: number): string {
  const d = new Date(ts * 1000)
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const month = d.toLocaleDateString('en-GB', { month: 'long' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${weekday} ${d.getDate()} ${month}, ${time}`
}

export async function buildNexusContextSections(): Promise<ContextSection[]> {
  const [stats, washRate, lastImport] = await Promise.all([getStats(), getWashRateByBatch(), getLastImport()])

  const listStatus: ContextSection = {
    type: 'stats',
    title: 'LIST STATUS',
    rows: [
      { label: 'Total', value: String(stats.total) },
      { label: 'Green', value: `${stats.green} (${pct(stats.green, stats.total)})` },
      { label: 'Red', value: `${stats.red} (${pct(stats.red, stats.total)})` },
      { label: 'DNC', value: String(stats.dnc) },
      { label: 'Unwashed', value: String(stats.unwashed) },
    ],
  }

  const washRateSection: ContextSection = {
    type: 'stats',
    title: 'WASH RATE',
    rows: [
      { label: 'Last batch', value: washRate.lastBatchPct !== null ? `${washRate.lastBatchPct}%` : '—' },
      { label: 'All time', value: `${washRate.allTimePct}%` },
    ],
  }

  const lastUpdated: ContextSection = {
    type: 'stats',
    title: 'LAST UPDATED',
    rows: [
      { label: 'Today', value: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) },
    ],
  }

  const sections: ContextSection[] = [listStatus, washRateSection]
  if (lastImport) {
    sections.push({
      type: 'lastImport',
      title: 'LAST IMPORT',
      added: lastImport.added,
      skipped: lastImport.skipped,
      when: formatImportTimestamp(lastImport.created_at),
    })
  }
  sections.push(lastUpdated)
  return sections
}

export type { NexusStats }
