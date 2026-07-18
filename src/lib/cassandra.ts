// CASSANDRA — brief formatter and news digestor.
//
// formatBrief: deterministic. Renders summaries only (no links) — numbered lines,
//              source name in plain text. Full items incl. links go to
//              headlines_json instead (see resolveNewsItems / cassandra-handler.ts).
//              Advice-word guard applies to Claude-generated digest lines only —
//              never to attributed third-party titles.
// digestNews:  One Claude (Haiku) call per section. Produces explanations (what it
//              means / why it matters) in CASSANDRA's own words. If a headline is
//              too thin to add context, relays it as a plain factual statement.
//              Never hallucinates facts not in the title.

import { askWith } from './claude'
import type { IndexQuote, FxQuote } from '../../tools/market-data'
import type { FeedItem } from '../../tools/feeds'

// Haiku for short low-stakes summarisation — cheap and fast.
const DIGEST_MODEL = 'claude-haiku-4-5-20251001'

// Advice words: whole-word, case-insensitive. Applied to CASSANDRA's own prose only.
// Must NOT trip on: "holdings", "operating", "buyback", "threshold", "withholding"
const ADVICE_WORD_RE = /\b(buy|sell|hold|consider|recommend(?:ation)?|should|trim|rating|price target|add to)\b/i

// Section-level guard — for deterministic prose (Markets, FX headers).
function guardProse(text: string, section: string): string | null {
  const match = ADVICE_WORD_RE.exec(text)
  if (match) {
    console.error(`[cassandra] Advice-word guard tripped in "${section}" on word "${match[0]}" — omitting section.`)
    return null
  }
  return text
}

// Per-line guard — for Claude-generated digest lines.
// Returns the line if clean; null if it trips (log + drop the line, not the whole section).
function guardDigestLine(line: string, section: string): string | null {
  const match = ADVICE_WORD_RE.exec(line)
  if (match) {
    console.error(`[cassandra] Advice-word guard tripped in "${section}" digest line on word "${match[0]}" — dropping line.`)
    return null
  }
  return line
}

function fmtPct(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

// A feed item resolved to what CASSANDRA will actually say about it: the Claude
// digest if one exists and passed the advice-word guard, else null (falls back to
// the raw title). Shared by formatBrief (brief prose) and cassandra-handler.ts
// (headlines_json, which keeps the link the brief prose no longer shows).
export interface ResolvedNewsItem {
  title: string
  digest: string | null
  link: string
  source: string
}

export function resolveNewsItems(
  items: FeedItem[],
  digests: Map<string, string>,
  section: string,
): ResolvedNewsItem[] {
  const resolved: ResolvedNewsItem[] = []
  for (const item of items) {
    const digest = digests.get(item.link)
    if (digest) {
      // Claude-generated prose — apply per-line guard.
      const guarded = guardDigestLine(digest, section)
      if (!guarded) continue  // drop the offending item entirely, keep the rest
      resolved.push({ title: item.title, digest: guarded, link: item.link, source: item.source })
    } else {
      // Attributed third-party title — no guard (relayed fact, not CASSANDRA's prose).
      resolved.push({ title: item.title, digest: null, link: item.link, source: item.source })
    }
  }
  return resolved
}

function buildNewsLines(resolved: ResolvedNewsItem[]): string[] {
  return resolved.map((item, i) => `${i + 1}. ${item.digest ?? item.title} (${item.source})`)
}

export function formatBrief(
  indices: IndexQuote[],
  fx: FxQuote[],
  regulatory: FeedItem[],
  news: FeedItem[],
  digests: Map<string, string>,  // item.link → one-liner from digestNews
  skipped: string[],
): string {
  const sections: string[] = []

  // ── Markets ──────────────────────────────────────────────────────────────
  // Use label (e.g. "S&P 500") not the ETF ticker. Show % move only — ETF price
  // levels aren't meaningful as index levels (ISF.L at £10 ≠ FTSE 100 at 8,200).
  if (indices.length > 0) {
    const lines = indices.map(q => `${q.label} ${fmtPct(q.dayChangePct)}`).join(' · ')
    const prose = `*Markets*\n${lines}`
    const guarded = guardProse(prose, 'Markets')
    if (guarded) sections.push(guarded)
  }

  // ── FX ───────────────────────────────────────────────────────────────────
  if (fx.length > 0) {
    const lines = fx.map(q => `${q.pair} ${q.rate.toFixed(4)} ${fmtPct(q.dayChangePct)}`).join(' · ')
    const prose = `*FX*\n${lines}`
    const guarded = guardProse(prose, 'FX')
    if (guarded) sections.push(guarded)
  }

  // ── Regulatory ───────────────────────────────────────────────────────────
  if (regulatory.length > 0) {
    const lines = buildNewsLines(resolveNewsItems(regulatory, digests, 'Regulatory'))
    if (lines.length > 0) sections.push(`*Regulatory*\n${lines.join('\n')}`)
  }

  // ── Headlines ────────────────────────────────────────────────────────────
  if (news.length > 0) {
    const lines = buildNewsLines(resolveNewsItems(news, digests, 'Headlines'))
    if (lines.length > 0) sections.push(`*Headlines*\n${lines.join('\n')}`)
  }

  if (sections.length === 0) {
    return '⚠ CASSANDRA: no data available for this brief.'
  }

  let msg = `*CASSANDRA — Morning Brief*\n\n` + sections.join('\n\n')

  if (skipped.length > 0) {
    msg += `\n\n_⚠ Some sources unavailable: ${skipped.join(', ')}_`
  }

  return msg
}

const DIGEST_SYSTEM = `You are CASSANDRA, a neutral financial news summariser.

For each numbered headline below, write ONE sentence that explains what it means or why it matters — in your own words, grounded only in the information in the title. Do not reword the headline verbatim. Do not hallucinate facts that are not present in the title. If a headline is too thin to add real context, relay it as a plain factual statement rather than inventing detail.

Rules:
- One sentence per headline, matching the input numbering.
- Neutral and factual only — no buy, sell, hold, consider, recommend, should, trim, rating, or price target language.
- Return ONLY the numbered sentences, no preamble, no trailing commentary.`

// digestNews: one Claude (Haiku) call per section.
// Returns Map<item.link, one-liner>. On parse error for any item, falls back to empty
// (formatBrief will use the raw title instead).
export async function digestNews(items: FeedItem[], section: string): Promise<Map<string, string>> {
  if (items.length === 0) return new Map()

  const userText = items
    .map((item, i) => `${i + 1}. "${item.title}"`)
    .join('\n')

  const raw = await askWith(DIGEST_SYSTEM, userText, 512, DIGEST_MODEL)

  const result = new Map<string, string>()
  const lines = raw.trim().split('\n').filter(l => l.trim())

  for (let i = 0; i < items.length; i++) {
    const line = lines[i]
    if (!line) continue
    const text = line.replace(/^\d+\.\s*/, '').trim()
    if (text) result.set(items[i]!.link, text)
  }

  console.log(`[cassandra] digestNews(${section}): ${result.size}/${items.length} digests generated`)
  return result
}
