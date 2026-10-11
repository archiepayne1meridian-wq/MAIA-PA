// NEXUS — pure parsing logic (Sales Navigator paste, wash-result paste) and
// the right-context-panel builder. No Claude calls — deterministic parsing,
// same principle as VICTORIA's tally parser: cheap and fast, no model needed
// for extracting structured text from a predictable paste format.

import { getStats, getWashRateByBatch, getLastImport, type NexusStats } from '../../tools/nexus-db'

export interface NameLookup { id: string; firstLower: string; lastLower: string }

// ─── Sales Navigator paste parser ────────────────────────────────────────────
//
// A raw Sales Navigator lead-list copy-paste is a flat sequence of DOM text,
// not clean rows — reverse-engineered from real pasted output, each person's
// entry looks like:
//
//   Select <Full Name>      (checkbox aria-label — the block delimiter)
//   <Full Name>             (the visible name link text, sometimes repeated)
//   Saved Badge             (UI chrome)
//   [Job Title line]        (optional)
//   [Company line]          (optional)
//   [Location line]         (optional, e.g. "Geneva Metropolitan Area")
//
// Splitting on "Select " is what turns that flat stream back into one block
// per person — without it, every capitalised-looking line (job titles,
// companies, "Saved Badge", "Add Account", column headers) gets misread as
// its own fake person, which is exactly what the previous naive line-scanner
// did.

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

// Known Sales Navigator UI chrome that shows up in the same position a real
// job title/company would — matched case-insensitively against a whole,
// trimmed line (not a substring match, so it never eats real data).
const NOISE_LINES = new Set([
  'saved badge', 'add account', 'name account geography notes tooltip',
  'message', 'connect', 'follow', 'pending', 'inmail', 'premium',
  'view profile', 'save', 'saved', 'following',
])

function isNoiseLine(line: string): boolean {
  const l = line.toLowerCase().trim()
  if (NOISE_LINES.has(l)) return true
  // "1st", "2nd degree connection", "(3rd)" etc.
  if (/^\(?\d+(st|nd|rd|th)\)?(\s+degree)?(\s+connection)?\.?$/i.test(l)) return true
  return false
}

// Rule 2 — a line that's actually a location must never land in the Company
// (or Job Title) slot. LinkedIn/Sales Nav location strings reliably end in
// "Area"/"Metropolitan Area"/"Region", which catches cities beyond the
// explicit list below too.
const LOCATION_KEYWORDS = /\b(switzerland|geneva|zurich|zürich|lausanne|basel|bern|zug|vaud|london|england|united kingdom)\b/i

function looksLikeLocation(line: string): boolean {
  const l = line.trim()
  if (LOCATION_KEYWORDS.test(l)) return true
  if (/\b(metropolitan area|area|region)$/i.test(l)) return true
  return false
}

// ─── Rule 4 — strip post-nominal qualifications / pre-nominal titles ───────
// before the name is split into first/last, so e.g. "Dr. Sarah Jones MSc
// ACCA" parses as "Sarah" / "Jones", not "Dr." / "Jones MSc ACCA".

const PRE_NOMINAL = /^\s*(dr|prof|sir|dame|lord|lady|baron(ess)?|rev(erend)?)\.?\s+/i

const POST_NOMINAL_TOKENS = [
  'chartered fcsi', 'dphil', 'dippfs', 'mba', 'msc', 'bsc', 'phd', 'cfa', 'cfp', 'acca', 'aca',
  'fcca', 'cisi', 'apfs', 'mcsi', 'llb', 'llm', 'mbe', 'obe', 'cbe', 'frsa', 'frs', 'pmp', 'caia',
  'cmt', 'cpa', 'cima', 'cgma', 'cim', 'imc', 'qc', 'kc', 'ba', 'ma',
]
const POST_NOMINAL_PATTERN = new RegExp(
  `\\s+(${POST_NOMINAL_TOKENS.map(t => t.replace(/\s+/g, '\\s+')).join('|')})\\.?\\s*$`,
  'i',
)

function stripQualifications(raw: string): string {
  let name = raw.trim().replace(PRE_NOMINAL, '')
  const commaIdx = name.indexOf(',')
  if (commaIdx !== -1) name = name.slice(0, commaIdx)
  let changed = true
  while (changed) {
    const next = name.replace(POST_NOMINAL_PATTERN, '').trim()
    changed = next !== name
    name = next
  }
  return name.trim()
}

function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { first: parts[0] ?? '', last: '' }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1]! }
}

// Rule 3 — "O.", "B", "O" etc.
function isSingleLetterSurname(last: string): boolean {
  return /^[A-Za-zÀ-ÿ]\.?$/.test(last.trim())
}

export function parseSalesNav(text: string, existing: NameLookup[]): SalesNavCandidate[] {
  const existingKeys = new Set(existing.map(n => `${n.firstLower} ${n.lastLower}`))
  const seenInPaste = new Set<string>()
  const candidates: SalesNavCandidate[] = []

  // Prepend a newline so a paste that starts with "Select " (no leading
  // blank line) splits the same way as one that doesn't.
  const blocks = (`\n${text}`).split(/\n[ \t]*Select[ \t]+/i).slice(1)

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const rawNameLine = lines[0]!
    const cleanName = stripQualifications(rawNameLine)
    if (!cleanName) continue
    const { first, last } = splitFullName(cleanName)
    if (!first || !last) continue

    const meaningful = lines.slice(1).filter(l => {
      if (l.toLowerCase() === rawNameLine.toLowerCase()) return false
      if (l.toLowerCase() === cleanName.toLowerCase()) return false
      if (isNoiseLine(l)) return false
      if (looksLikeLocation(l)) return false
      return true
    })

    const jobRole = meaningful[0] ?? null
    const company = meaningful[1] ?? null

    const key = `${first.toLowerCase()} ${last.toLowerCase()}`
    if (seenInPaste.has(key)) continue
    seenInPaste.add(key)

    candidates.push({
      firstName: first,
      lastName: last,
      company,
      jobRole,
      isDuplicate: existingKeys.has(key),
      flagged: isSingleLetterSurname(last),
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
