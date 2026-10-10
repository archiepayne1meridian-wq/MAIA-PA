// NEXUS — pure parsing logic (Sales Navigator paste, wash-result paste) and
// the right-context-panel builder. No Claude calls — deterministic parsing,
// same principle as VICTORIA's tally parser: cheap and fast, no model needed
// for extracting structured text from a predictable paste format.

import { getStats, getWashRateByBatch, type NexusStats } from '../../tools/nexus-db'

export interface NameLookup { id: string; firstLower: string; lastLower: string }

// ─── Sales Navigator paste parser ────────────────────────────────────────────
//
// Sales Navigator lead-list copy-pastes come through as repeating two-line
// blocks: a name line, then a "Role at Company" line (other noise lines —
// location, degree-of-connection, etc. — are skipped since they don't match
// either pattern). This is the common shape; anything that doesn't fit is
// left with null company/role rather than guessed at, so Archie can fill it
// in by hand rather than get a silently wrong value.

export interface SalesNavCandidate {
  firstName: string
  lastName: string
  company: string | null
  jobRole: string | null
  isDuplicate: boolean
}

function looksLikeNameLine(line: string): boolean {
  if (line.length === 0 || line.length > 60) return false
  if (/\d/.test(line)) return false
  if (/\bat\b/i.test(line)) return false
  const words = line.split(/\s+/)
  if (words.length < 2 || words.length > 5) return false
  return words.every(w => /^[A-ZÀ-Ý][A-Za-zà-ÿ'.-]*\.?$/.test(w))
}

function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') }
}

export function parseSalesNav(text: string, existing: NameLookup[]): SalesNavCandidate[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const existingKeys = new Set(existing.map(n => `${n.firstLower} ${n.lastLower}`))
  const candidates: SalesNavCandidate[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!looksLikeNameLine(line)) continue

    const { first, last } = splitFullName(line)
    if (!first || !last) continue

    let company: string | null = null
    let jobRole: string | null = null
    const next = lines[i + 1]
    if (next) {
      const atMatch = next.match(/^(.+?)\s+at\s+(.+)$/i)
      if (atMatch) {
        jobRole = atMatch[1]!.trim()
        company = atMatch[2]!.trim()
      }
    }

    const key = `${first.toLowerCase()} ${last.toLowerCase()}`
    candidates.push({ firstName: first, lastName: last, company, jobRole, isDuplicate: existingKeys.has(key) })
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
  | { type: 'empty'; title: string; message: string }

function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : '0%'
}

export async function buildNexusContextSections(): Promise<ContextSection[]> {
  const [stats, washRate] = await Promise.all([getStats(), getWashRateByBatch()])

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

  return [listStatus, washRateSection, lastUpdated]
}

export type { NexusStats }
