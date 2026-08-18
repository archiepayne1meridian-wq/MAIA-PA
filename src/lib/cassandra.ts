// CASSANDRA — structured morning brief generator.
//
// generateStructuredBrief: web search is the primary intelligence source (one
//   askWithWebSearch call per section, run in parallel), combined with a single
//   Haiku call that turns the raw findings + supplementary RSS items into a
//   structured, sectioned brief (summary + "why it matters" angle per item).
//   RSS feeds (filtered via isRelevantToDeVere) are supplementary context only —
//   not the primary source. Advice-word guard applies to CASSANDRA's own
//   generated prose (summary/angle) — never to attributed third-party facts.
// formatStructuredBrief: deterministic. Renders Markets/FX (unchanged) + the
//   generated sections as numbered lines, source name in plain text, no links —
//   full items incl. links go to headlines_json instead (see cassandra-handler.ts).

import { askWith, askWithWebSearch } from './claude'
import type { IndexQuote, FxQuote } from '../../tools/market-data'
import type { FeedItem } from '../../tools/feeds'

// Haiku for search + structuring — cheap and fast, matches IRIS's model choice.
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

// Per-field guard — for Claude-generated summary/angle text.
// Returns the text if clean; null if it trips (log + drop, not the whole section).
function guardField(text: string, section: string, field: string): string | null {
  const match = ADVICE_WORD_RE.exec(text)
  if (match) {
    console.error(`[cassandra] Advice-word guard tripped in "${section}" ${field} on word "${match[0]}" — dropping item.`)
    return null
  }
  return text
}

function fmtPct(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Topic filter (RSS supplementary items only) ──────────────────────────────
// Keeps RSS supplementary context scoped to deVere's core advice areas instead of
// general business news. Web search is the primary source now — RSS just fills
// gaps search might miss. Title only — checking source too let curated feed names
// (e.g. "Bank of England", "Pensions Age") give every item a free pass regardless
// of content.
const DEVERE_KEYWORDS = [
  // Pensions
  'pension', 'qrops', 'sipp', 'iorp', 'annuity', 'drawdown', 'retirement',
  'pension transfer', 'pension scheme', 'lifetime allowance', 'annual allowance',
  'pension age', 'defined contribution', 'defined benefit',
  // Tax & legislation
  'inheritance tax', 'iht', 'capital gains', 'income tax', 'tax relief',
  'non-dom', 'domicile', 'residency', 'double taxation', 'hmrc',
  'legislation', 'budget', 'autumn statement', 'spring statement',
  // Offshore & investments
  'offshore', 'portfolio bond', 'structured note', 'investment bond',
  'wealth management', 'financial planning', 'expat', 'expatriate',
  // Rates & markets (client conversation relevant)
  'interest rate', 'base rate', 'bank of england', 'federal reserve',
  'ecb', 'inflation', 'currency', 'sterling', 'gbp', 'eur',
  // Regulatory
  'fca', 'fsa', 'mfsa', 'compliance', 'regulation', 'financial conduct',
  'consumer duty', 'financial advice', 'adviser',
  // Switzerland
  'swiss national bank', 'snb', 'swiss franc', 'chf', 'switzerland',
  'swiss', 'helvetia', 'finma',
]

export function isRelevantToDeVere(item: FeedItem): boolean {
  const titleLower = item.title.toLowerCase()
  return DEVERE_KEYWORDS.some(keyword => titleLower.includes(keyword))
}

// ─── Sections ──────────────────────────────────────────────────────────────────

export type CassandraSectionKey = 'sector' | 'pensions' | 'tax' | 'expat' | 'political' | 'regulatory'

// Canonical order + labels. The Haiku call is asked to return these exact labels;
// matchSectionLabel below maps its output back to a stable key via keyword
// matching (robust to minor phrasing drift — "and" vs "&", capitalisation, etc.)
// rather than trusting the model to echo a machine slug.
const SECTION_ORDER: { key: CassandraSectionKey; label: string }[] = [
  { key: 'sector',     label: 'Sector Snapshot' },
  { key: 'pensions',   label: 'Pensions & Retirement' },
  { key: 'tax',        label: 'Tax & Legislation' },
  { key: 'expat',      label: 'Expat & Cross-Border' },
  { key: 'political',  label: 'Political & Macro' },
  { key: 'regulatory', label: 'Regulatory' },
]

function matchSectionLabel(label: string): { key: CassandraSectionKey; label: string } | null {
  const l = label.toLowerCase()
  if (l.includes('sector')) return SECTION_ORDER[0]!
  if (l.includes('pension')) return SECTION_ORDER[1]!
  if (l.includes('tax') || l.includes('legislation')) return SECTION_ORDER[2]!
  if (l.includes('expat') || l.includes('cross-border') || l.includes('cross border')) return SECTION_ORDER[3]!
  if (l.includes('political') || l.includes('macro')) return SECTION_ORDER[4]!
  if (l.includes('regulat')) return SECTION_ORDER[5]!
  return null
}

// Lightweight keyword classifier for bucketing RSS supplementary items into one
// of the 6 sections. Doesn't need to be perfect — it's extra context fed to the
// Haiku call, not the primary output. First match wins; order favours the more
// specific categories (pensions/tax/expat) over the broader ones.
const SECTION_RSS_KEYWORDS: { key: CassandraSectionKey; words: string[] }[] = [
  { key: 'pensions',   words: ['pension', 'qrops', 'sipp', 'iorp', 'annuity', 'drawdown', 'retirement', 'lifetime allowance', 'annual allowance', 'defined contribution', 'defined benefit'] },
  { key: 'tax',        words: ['inheritance tax', 'iht', 'capital gains', 'income tax', 'tax relief', 'hmrc', 'legislation', 'budget', 'autumn statement', 'spring statement'] },
  { key: 'expat',      words: ['expat', 'expatriate', 'non-dom', 'domicile', 'residency', 'double taxation'] },
  { key: 'regulatory', words: ['fca', 'fsa', 'mfsa', 'compliance', 'regulation', 'financial conduct', 'consumer duty', 'financial advice', 'adviser', 'tpr'] },
  { key: 'political',  words: ['election', 'parliament', 'prime minister', 'chancellor', 'policy', 'government', 'westminster'] },
  { key: 'sector',     words: ['stock', 'shares', 'nasdaq', 'ftse', 'dow', 'earnings', 'ipo', 'markets'] },
]

function classifyRssItem(item: FeedItem): CassandraSectionKey | null {
  const t = item.title.toLowerCase()
  for (const { key, words } of SECTION_RSS_KEYWORDS) {
    if (words.some(w => t.includes(w))) return key
  }
  return null
}

// Buckets already-relevance-filtered RSS items by section, capped per section so
// the supplementary context doesn't overwhelm the prompt.
function bucketRssBySection(items: FeedItem[], maxPerSection: number): Partial<Record<CassandraSectionKey, FeedItem[]>> {
  const buckets: Partial<Record<CassandraSectionKey, FeedItem[]>> = {}
  for (const item of items) {
    const key = classifyRssItem(item)
    if (!key) continue
    const arr = buckets[key] ?? (buckets[key] = [])
    if (arr.length < maxPerSection) arr.push(item)
  }
  return buckets
}

// ─── Step 1 — web search per section ──────────────────────────────────────────

const SEARCH_SYSTEM = `You are a research assistant gathering source material for a financial morning brief.

Search the web for the given query and report back the most significant, current findings — a few bullet points, each stating what happened, the publication/source name, and the URL if the search result provides one.

Be factual and specific — name the company, policy, rate, or legislation involved. No opinions, no recommendations, no advice. If nothing significant or current turns up, say so plainly rather than inventing anything.`

interface SectionResearch {
  key: CassandraSectionKey
  label: string
  findings: string
}

async function gatherSectionResearch(): Promise<SectionResearch[]> {
  // Widened from a strict "today" filter to "latest" (last ~48h) — a hard same-day
  // filter meant quiet days returned nothing at all; this way yesterday's and this
  // morning's news both surface, so there's still a real brief on slower days.
  const year = new Date().getFullYear()

  const searches: { key: CassandraSectionKey; label: string; query: string }[] = [
    { key: 'sector',     label: 'Sector Snapshot',         query: `market moving sector news tech energy finance latest ${year}` },
    { key: 'pensions',   label: 'Pensions & Retirement',   query: `UK pension news QROPS SIPP retirement latest ${year}` },
    { key: 'tax',        label: 'Tax & Legislation',       query: `UK tax legislation HMRC inheritance tax update latest ${year}` },
    { key: 'expat',      label: 'Expat & Cross-Border',    query: `British expat finance tax residency Malta Europe latest ${year}` },
    { key: 'political',  label: 'Political & Macro',       query: `UK political financial market impact economy latest ${year}` },
    { key: 'regulatory', label: 'Regulatory',              query: `FCA TPR financial regulation adviser compliance latest ${year}` },
  ]

  return Promise.all(searches.map(async s => {
    try {
      const { text } = await askWithWebSearch(SEARCH_SYSTEM, s.query, 1024, DIGEST_MODEL)
      return { key: s.key, label: s.label, findings: text }
    } catch (err) {
      console.error(`[cassandra] web search failed for section "${s.key}":`, err)
      return { key: s.key, label: s.label, findings: '(search unavailable — no findings this run)' }
    }
  }))
}

// ─── Step 2 — structured brief from combined research ─────────────────────────

const STRUCTURED_SYSTEM = `You are CASSANDRA, a morning intelligence briefing agent for Archie Payne —
a trainee financial adviser at deVere Group, Malta, serving British expats
across Europe.

Your job is to produce a sharp, structured morning brief. You are writing
for someone who needs to stay ahead of markets, regulation, pensions,
tax, and expat finance — and who will use this to have intelligent
conversations with prospects and clients.

Rules:
- Every item: one sentence what happened + one sentence why it matters
  to a deVere adviser serving British expats. Never more than two sentences
  per item.
- Write the "why it matters" angle as a description of relevance or
  implication — never as an instruction. Do not use "should", "must", or
  "need to". Describe what's affected or what it signals, not what someone
  should do about it. Write "this affects clients with QROPS holdings in
  Malta" — not "advisers should review QROPS holdings."
- Be specific — name the policy, the rate, the legislation, the company.
  Never be vague.
- Only include genuinely significant items. If nothing important happened
  in a section today, omit that section entirely.
- Flag effective dates explicitly when legislation changes
  ("comes into force 6 April 2027")
- Never give financial advice or recommendations
- No markdown headers — use the section labels provided
- Return JSON only — no prose outside the JSON
- CRITICAL: For every item, you must include the source URL from the search
  results. Look in the search result metadata for the URL of the article.
  If a specific article URL is available, use it. If not, use the publication's
  homepage URL (e.g. https://www.fca.org.uk for FCA items).
  Never return null for url — always provide something linkable.
- For every item in the Regulatory and Tax & Legislation sections only, add an
  "impact" field with one of three values:

  "direct" — this changes something Archie needs to do or say, or directly
  affects a deVere product or how clients should structure their money.
  Examples: IHT on pension death benefits April 2027, QROPS rule change,
  pension access age change, non-dom rule update.

  "watch" — this could develop into something significant for the target
  client base. Monitor but no immediate action needed.
  Examples: proposed legislation not yet passed, consultation papers,
  regulatory reviews in progress.

  "awareness" — good to know, relevant to financial services generally,
  but no immediate impact on expat clients or deVere products.
  Examples: FCA post-trade reporting changes, generic conduct rules,
  unrelated regulatory admin.

  Do not add "impact" to items in any other section.

Return this exact JSON shape:
{
  "sections": [
    {
      "label": "Sector Snapshot",
      "items": [
        {
          "summary": "one sentence what happened",
          "angle": "one sentence why this matters to a deVere adviser",
          "source": "publication name",
          "url": "the article URL, or the publication's homepage if no specific article URL is available"
        }
      ]
    },
    {
      "label": "Regulatory",
      "items": [
        {
          "summary": "one sentence what happened",
          "angle": "one sentence why this matters to a deVere adviser",
          "source": "publication name",
          "url": "the article URL, or the publication's homepage if no specific article URL is available",
          "impact": "direct | watch | awareness"
        }
      ]
    }
  ]
}

("impact" appears only on items inside "Regulatory" and "Tax & Legislation" —
omit it entirely from items in every other section.)

Sections to include (only if content exists):
Sector Snapshot, Pensions & Retirement, Tax & Legislation,
Expat & Cross-Border, Political & Macro, Regulatory

Markets and FX are handled separately — do not include them in sections.`

// Claude sometimes prefaces its final answer with a sentence of reasoning before
// the JSON — extract a fenced block anywhere in the text, or fall back to
// brace-matching, rather than requiring the JSON at the very start.
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenced?.[1]) return fenced[1].trim()
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) return raw.slice(first, last + 1)
  return raw.trim()
}

export type ImpactLevel = 'direct' | 'watch' | 'awareness'

export interface StructuredBriefItem {
  summary: string
  angle: string
  source: string
  url: string | null
  impact?: ImpactLevel  // Regulatory and Tax & Legislation items only
}

export interface StructuredBriefSection {
  key: CassandraSectionKey
  label: string
  items: StructuredBriefItem[]
}

export interface StructuredBriefResult {
  sections: StructuredBriefSection[]
  rawJson: string        // exact JSON returned by the Haiku call, pre-guard — for verification
  rawSearches: SectionResearch[]  // raw findings per section, pre-combination — for verification
}

// generateStructuredBrief: one askWithWebSearch call per section (parallel) +
// one combining Haiku call. rssRelevant should already be filtered via
// isRelevantToDeVere — bucketed here by section as supplementary context.
export async function generateStructuredBrief(rssRelevant: FeedItem[], rssPerSection = 3): Promise<StructuredBriefResult> {
  const [searches, rssBuckets] = [await gatherSectionResearch(), bucketRssBySection(rssRelevant, rssPerSection)]

  const today = new Date().toISOString().split('T')[0]

  const sectionBlocks = SECTION_ORDER.map(s => {
    const research = searches.find(r => r.key === s.key)
    const rss = rssBuckets[s.key] ?? []
    const rssBlock = rss.length > 0
      ? `\nSupplementary RSS items (use only if they add something the search missed):\n${rss.map(i => `- "${i.title}" (${i.source})`).join('\n')}`
      : ''
    return `### ${s.label}\nWeb search findings:\n${research?.findings ?? '(no findings)'}${rssBlock}`
  }).join('\n\n')

  const userMessage = `Today's date: ${today}\n\n${sectionBlocks}\n\nWrite the structured morning brief now, following the schema and rules exactly.`

  const raw = await askWith(STRUCTURED_SYSTEM, userMessage, 3072, DIGEST_MODEL)
  const cleaned = extractJson(raw)

  let parsed: unknown
  try { parsed = JSON.parse(cleaned) }
  catch { throw new Error(`[cassandra] generateStructuredBrief returned unparseable JSON: ${raw.slice(0, 300)}`) }

  const obj = parsed as { sections?: unknown }
  if (!Array.isArray(obj.sections)) throw new Error('[cassandra] generateStructuredBrief missing sections array')

  const sections: StructuredBriefSection[] = []
  for (const rawSection of obj.sections as unknown[]) {
    if (!rawSection || typeof rawSection !== 'object') continue
    const { label, items } = rawSection as { label?: unknown; items?: unknown }
    if (typeof label !== 'string' || !Array.isArray(items)) continue
    const matched = matchSectionLabel(label)
    if (!matched) {
      console.error(`[cassandra] generateStructuredBrief: unrecognised section label "${label}" — dropping.`)
      continue
    }

    // Impact is assessed only for Regulatory and Tax & Legislation items.
    const needsImpact = matched.key === 'regulatory' || matched.key === 'tax'
    const VALID_IMPACT: ImpactLevel[] = ['direct', 'watch', 'awareness']

    const guardedItems: StructuredBriefItem[] = []
    for (const rawItem of items as unknown[]) {
      if (!rawItem || typeof rawItem !== 'object') continue
      const { summary, angle, source, url, impact } = rawItem as Record<string, unknown>
      if (typeof summary !== 'string' || typeof angle !== 'string' || typeof source !== 'string') continue

      const guardedSummary = guardField(summary, matched.label, 'summary')
      const guardedAngle = guardedSummary ? guardField(angle, matched.label, 'angle') : null
      if (!guardedSummary || !guardedAngle) continue  // drop the offending item entirely, keep the rest

      const item: StructuredBriefItem = {
        summary: guardedSummary,
        angle: guardedAngle,
        source,
        url: typeof url === 'string' ? url : null,
      }

      if (needsImpact) {
        // Model omitted or returned something outside the three known values — default to
        // the least-alarming level rather than drop the item or leave it unflagged.
        const valid = typeof impact === 'string' && VALID_IMPACT.includes(impact as ImpactLevel)
        if (!valid) {
          console.error(`[cassandra] generateStructuredBrief: missing/invalid impact "${String(impact)}" for "${matched.label}" item — defaulting to "awareness".`)
        }
        item.impact = valid ? (impact as ImpactLevel) : 'awareness'
      }

      guardedItems.push(item)
    }

    if (guardedItems.length > 0) sections.push({ key: matched.key, label: matched.label, items: guardedItems })
  }

  return { sections, rawJson: cleaned, rawSearches: searches }
}

// ─── Step 4 — deterministic Slack/dashboard rendering ─────────────────────────

export function formatStructuredBrief(
  indices: IndexQuote[],
  fx: FxQuote[],
  sections: StructuredBriefSection[],
  skipped: string[],
): string {
  const blocks: string[] = []

  // ── Markets ──────────────────────────────────────────────────────────────
  if (indices.length > 0) {
    const lines = indices.map(q => `${q.label} ${fmtPct(q.dayChangePct)}`).join(' · ')
    const guarded = guardProse(`*Markets*\n${lines}`, 'Markets')
    if (guarded) blocks.push(guarded)
  }

  // ── FX ───────────────────────────────────────────────────────────────────
  if (fx.length > 0) {
    const lines = fx.map(q => `${q.pair} ${q.rate.toFixed(4)} ${fmtPct(q.dayChangePct)}`).join(' · ')
    const guarded = guardProse(`*FX*\n${lines}`, 'FX')
    if (guarded) blocks.push(guarded)
  }

  // ── Generated sections ───────────────────────────────────────────────────
  for (const sec of sections) {
    if (sec.items.length === 0) continue
    const lines = sec.items.map((item, i) => `${i + 1}. ${item.summary} — ${item.angle} (${item.source})`)
    blocks.push(`*${sec.label}*\n${lines.join('\n')}`)
  }

  if (blocks.length === 0) return '⚠ CASSANDRA: no data available for this brief.'

  let msg = `*CASSANDRA — Morning Brief*\n${fmtDate(new Date())}\n\n` + blocks.join('\n\n')

  if (skipped.length > 0) {
    msg += `\n\n_⚠ Some sources unavailable: ${skipped.join(', ')}_`
  }

  return msg
}
