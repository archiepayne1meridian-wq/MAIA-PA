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
