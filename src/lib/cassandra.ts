// CASSANDRA — news research engine for the News conversation thread.
//
// Pipeline: Brave Search API (20 parallel queries, last-7-days-only, deduped)
// → Haiku relevance filter (per-article JSON: summary/key quote/call angle/
//   content angle/relevance/category) → cassandra_items rows + conversation
//   thread cards (see cassandra-handler.ts for persistence/thread wiring).
//
// Advice-word guard applies to CASSANDRA's own generated prose (summary/
// call_angle/content_angle) — never to attributed third-party quotes/facts
// (key_quote). Same invariant as the rest of this file always had.

import { askWith, askWithTools, type ToolDef } from './claude'
import type { IndexQuote, FxQuote } from '../../tools/market-data'
import { extractJson } from './format'
import { braveSearch, type BraveResult } from '../../tools/brave-search'
import { askPerplexity } from '../../tools/perplexity'
import { saveEntry, updateEntryTags } from '../../tools/muse'
import { autoTag } from './muse'
import { getPreferences, formatPreferencesForPrompt, incrementTimesApplied } from './preferences'

// Haiku for the bulk relevance filter — cheap, fast, high volume (up to ~160
// raw search results/day). Sonnet for the conversational follow-up handler,
// matching IRIS's model choice for anything Archie reads and talks back to.
const DIGEST_MODEL = 'claude-haiku-4-5-20251001'
const CHAT_MODEL = 'claude-sonnet-4-6'

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
function guardField(text: string, title: string, field: string): string | null {
  const match = ADVICE_WORD_RE.exec(text)
  if (match) {
    console.error(`[cassandra] Advice-word guard tripped on "${title}" ${field} ("${match[0]}") — dropping item.`)
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

// ─── Step 1 — Brave Search across ~20 parallel queries ───────────────────────
// Exact query strings as specified — not templated, so they stay literally
// what was asked for rather than silently drifting with a computed year.

const SEARCHES: string[] = [
  // UK financial and pension
  'UK pension rules changes 2026',
  'UK inheritance tax pension death benefits 2026',
  'Bank of England interest rate decision 2026',
  'UK budget tax changes expats abroad 2026',
  'HMRC pension announcement 2026',
  'unclaimed pension pots UK 2026',

  // Switzerland
  'Swiss National Bank SNB interest rate 2026',
  'Switzerland expat financial regulation 2026',
  'Swiss company restructuring redundancy 2026',
  'Novartis OR Roche OR Nestle OR UBS OR ABB OR Trafigura news 2026',

  // Retirement destinations
  'Spain Portugal retirement tax expats 2026',
  'Mediterranean retirement financial planning 2026',

  // Markets — broad moves only
  'bond market interest rates 2026',
  'inflation rate UK Switzerland 2026',
  'global market correction drop 2026',

  // Geopolitical
  'election wealth tax financial impact 2026',
  'UK political change pension wealth 2026',

  // deVere CEO
  'Nigel Green deVere 2026',

  // Regulation — new rules only
  'FCA new rules regulation 2026',
  'financial regulation change UK Switzerland 2026',
]

interface RawCandidate extends BraveResult {
  query: string
}

// Runs n async jobs with a concurrency cap — 20 simultaneous Brave requests
// risks 429s on a standard-plan key; this keeps a handful in flight at once.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// Brave's `freshness=pw` param already enforces "past week" server-side —
// this is a defensive second check for the (rarer) case where Brave supplies
// a parseable page_age that's actually stale, never used to add dates we
// don't have.
function withinLastSevenDays(pageAgeIso: string | null): boolean {
  if (!pageAgeIso) return true
  const t = new Date(pageAgeIso).getTime()
  if (Number.isNaN(t)) return true
  return Date.now() - t <= SEVEN_DAYS_MS
}

async function gatherRawCandidates(): Promise<{ candidates: RawCandidate[]; skippedQueries: string[] }> {
  const skippedQueries: string[] = []
  const perQuery = await mapWithConcurrency(SEARCHES, 5, async query => {
    try {
      const results = await braveSearch(query, 6)
      return results.filter(r => withinLastSevenDays(r.pageAgeIso)).map(r => ({ ...r, query }))
    } catch (err) {
      console.error(`[cassandra] Brave search failed for "${query}":`, err)
      skippedQueries.push(query)
      return []
    }
  })

  const seen = new Set<string>()
  const candidates: RawCandidate[] = []
  for (const batch of perQuery) {
    for (const c of batch) {
      if (seen.has(c.url)) continue
      seen.add(c.url)
      candidates.push(c)
    }
  }
  return { candidates, skippedQueries }
}

// ─── Step 2 — Haiku relevance filter ──────────────────────────────────────────

const FILTER_PROMPT = `You are filtering news for Archie Payne, BDA at deVere and Partners Switzerland.

His job: book meetings with British expats in Switzerland with cross-border financial planning.

INCLUDE — news that could:
- Affect UK pensions, IHT, or tax for people living abroad
- Create a reason for a British expat to think about their finances
- Give Archie a genuine conversation starter on a cold call
- Be relevant to someone with assets in multiple countries
- Affect Swiss residents financially (SNB decisions, Swiss company news)
- Affect popular retirement destinations (Spain, Portugal)
- Show market conditions affecting assets or pension values
- Be a quote from Nigel Green (deVere CEO) — always include
- Be a new regulatory rule from FCA or Swiss regulator

EXCLUDE — always:
- Cryptocurrency, bitcoin, blockchain, NFTs
- Individual stock picks or analyst ratings
- FCA enforcement actions, fines, bans, hearings — new RULES only
- Generic market commentary with no expat angle
- Articles older than 7 days
- Low quality sources — blogs, random finance sites, unknown authors
- Anything already covered in the last brief

For each article that passes, return:
{
  "title": "article title",
  "source": "BBC / Financial Times / Reuters / etc.",
  "url": "article URL",
  "published": "date",
  "summary": "2-3 sentence summary of what this article says",
  "key_quote": "most quotable line from the article if available — verbatim, attributed",
  "call_angle": "one sentence — how Archie could use this on a cold call today",
  "content_angle": "one sentence — how this could become a LinkedIn post",
  "relevance": "high / medium",
  "category": "uk_pension | swiss_news | markets | regulation | geopolitical | retirement_destinations | devere_ceo"
}

Return only HIGH and MEDIUM relevance items.
Return JSON array only. No preamble.`

export type CassandraCategory =
  | 'uk_pension' | 'swiss_news' | 'markets' | 'regulation'
  | 'geopolitical' | 'retirement_destinations' | 'devere_ceo'

export type CassandraRelevance = 'high' | 'medium'

export interface CassandraArticle {
  title: string
  source: string
  url: string
  published: string | null
  summary: string
  keyQuote: string | null
  callAngle: string
  contentAngle: string | null
  relevance: CassandraRelevance
  category: CassandraCategory
}

const VALID_CATEGORIES: CassandraCategory[] = [
  'uk_pension', 'swiss_news', 'markets', 'regulation',
  'geopolitical', 'retirement_destinations', 'devere_ceo',
]

export const CATEGORY_LABEL: Record<CassandraCategory, string> = {
  uk_pension: 'UK Pension & Tax',
  swiss_news: 'Swiss Company News',
  markets: 'Bond Markets & Rates',
  regulation: 'FCA New Rules',
  geopolitical: 'Geopolitical',
  retirement_destinations: 'Retirement Destinations',
  devere_ceo: 'Nigel Green / deVere',
}

function parseFilteredItem(rawItem: unknown): CassandraArticle | null {
  if (!rawItem || typeof rawItem !== 'object') return null
  const r = rawItem as Record<string, unknown>
  const { title, source, url, summary, call_angle, relevance, category } = r
  if (typeof title !== 'string' || typeof source !== 'string' || typeof url !== 'string') return null
  if (typeof summary !== 'string' || typeof call_angle !== 'string') return null

  const relevanceNorm = typeof relevance === 'string' ? relevance.trim().toLowerCase() : ''
  if (relevanceNorm !== 'high' && relevanceNorm !== 'medium') {
    console.error(`[cassandra] dropping "${title}" — invalid relevance "${String(relevance)}"`)
    return null
  }

  const categoryNorm = typeof category === 'string' ? category.trim().toLowerCase() : ''
  if (!VALID_CATEGORIES.includes(categoryNorm as CassandraCategory)) {
    console.error(`[cassandra] dropping "${title}" — invalid category "${String(category)}"`)
    return null
  }

  const guardedSummary = guardField(summary, title, 'summary')
  const guardedCallAngle = guardedSummary ? guardField(call_angle, title, 'call_angle') : null
  if (!guardedSummary || !guardedCallAngle) return null

  const contentAngleRaw = typeof r.content_angle === 'string' ? r.content_angle : null
  const guardedContentAngle = contentAngleRaw ? guardField(contentAngleRaw, title, 'content_angle') : null

  // key_quote is a verbatim third-party attribution, not CASSANDRA's own
  // prose — never run through the advice-word guard.
  const keyQuote = typeof r.key_quote === 'string' && r.key_quote.trim() ? r.key_quote.trim() : null
  const published = typeof r.published === 'string' && r.published.trim() ? r.published.trim() : null

  return {
    title, source, url, published,
    summary: guardedSummary,
    keyQuote,
    callAngle: guardedCallAngle,
    contentAngle: contentAngleRaw ? guardedContentAngle : null,
    relevance: relevanceNorm as CassandraRelevance,
    category: categoryNorm as CassandraCategory,
  }
}

// Repairs a JSON array truncated mid-object (hit the output token ceiling) by
// dropping back to the last complete "}," boundary and closing the array
// there — salvages everything genuinely finished rather than losing a whole
// batch to one cut-off item.
function repairTruncatedArray(raw: string): unknown[] | null {
  const lastComplete = raw.lastIndexOf('},')
  if (lastComplete === -1) return null
  const salvaged = `${raw.slice(0, lastComplete + 1)}]`
  try {
    const parsed = JSON.parse(salvaged)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function runFilterBatch(batch: RawCandidate[], systemWithPrefs: string, today: string): Promise<CassandraArticle[]> {
  const digest = batch.map((c, i) =>
    `${i + 1}. "${c.title}" — ${c.source}\nURL: ${c.url}\nAge: ${c.age ?? c.pageAgeIso ?? 'unknown'}\nSnippet: ${c.description}`,
  ).join('\n\n')
  const userMessage = `Today's date: ${today}\n\nRaw search results to filter:\n\n${digest}\n\nFilter these now, following the rules exactly.`

  const raw = await askWith(systemWithPrefs, userMessage, 8192, DIGEST_MODEL)
  const cleaned = extractJson(raw)

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const repaired = repairTruncatedArray(cleaned)
    if (!repaired) {
      console.error(`[cassandra] filter batch returned unparseable JSON (not even partially salvageable): ${raw.slice(0, 300)}`)
      return []
    }
    console.error(`[cassandra] filter batch output was truncated — salvaged ${repaired.length} complete item(s) from the partial response.`)
    parsed = repaired
  }

  if (!Array.isArray(parsed)) {
    console.error('[cassandra] filter batch: expected a JSON array, got:', typeof parsed)
    return []
  }

  return (parsed as unknown[]).map(parseFilteredItem).filter((a): a is CassandraArticle => a !== null)
}

// Chunked into batches of 20 so a busy news day (100+ raw candidates) never
// risks truncating a single huge Haiku call — each batch gets its own output
// budget, run in parallel, and one bad batch doesn't cost the others.
const FILTER_BATCH_SIZE = 20

async function filterArticlesWithHaiku(candidates: RawCandidate[], excludeUrls: Set<string>): Promise<CassandraArticle[]> {
  const fresh = candidates.filter(c => !excludeUrls.has(c.url))
  if (fresh.length === 0) return []

  const prefs = await getPreferences('cassandra')
  const prefText = formatPreferencesForPrompt(prefs)
  const systemWithPrefs = prefText ? `${prefText}\n\n${FILTER_PROMPT}` : FILTER_PROMPT
  const today = new Date().toISOString().split('T')[0]

  const batches: RawCandidate[][] = []
  for (let i = 0; i < fresh.length; i += FILTER_BATCH_SIZE) batches.push(fresh.slice(i, i + FILTER_BATCH_SIZE))

  const results = await Promise.all(batches.map(async (batch, i) => {
    try {
      return await runFilterBatch(batch, systemWithPrefs, today)
    } catch (err) {
      console.error(`[cassandra] filter batch ${i + 1}/${batches.length} failed:`, err)
      return []
    }
  }))
  const articles = results.flat()

  if (prefs.length > 0) void incrementTimesApplied(prefs.map(p => p.id)).catch(err => console.error('[cassandra] incrementTimesApplied failed:', err))

  // High relevance first — same item order the brief/cards/context panel all render in.
  articles.sort((a, b) => (a.relevance === b.relevance ? 0 : a.relevance === 'high' ? -1 : 1))
  return articles
}

export interface GatherResult {
  articles: CassandraArticle[]
  skippedQueries: string[]
}

// Full pipeline: Brave search → dedupe → Haiku filter. excludeUrls lets the
// afternoon refresh ask for "only things not already in today's thread."
export async function gatherAndFilterArticles(excludeUrls: Set<string> = new Set()): Promise<GatherResult> {
  const { candidates, skippedQueries } = await gatherRawCandidates()
  console.log(`[cassandra] Brave Search: ${candidates.length} unique candidates from ${SEARCHES.length} queries (${skippedQueries.length} queries failed).`)
  const articles = await filterArticlesWithHaiku(candidates, excludeUrls)
  console.log(`[cassandra] Haiku filter: ${articles.length} of ${candidates.length} candidates passed.`)
  return { articles, skippedQueries }
}

// ─── MUSE filing — single best call angle, same mechanism as before ──────────
// The old generateActionAngles Claude call is no longer needed: call_angle is
// already a per-article field from the filter pass, so the "today's single
// best action" line is picked directly from data rather than re-derived.

function bestCallAngleLine(articles: CassandraArticle[]): string {
  const best = articles.find(a => a.relevance === 'high') ?? articles[0]
  if (!best) return 'Nothing significant today.'
  return `Call angle: ${best.callAngle}`
}

// Product-related keywords route to the "Products" sector; everything else
// defaults to "Regulations" — matching the split MUSE already uses.
const PRODUCT_SECTOR_KEYWORDS = ['structured note', 'portfolio bond', 'sipp', 'qrops', 'pillar 2', 'pillar 3', 'rl360', 'ardan', 'autocall']

function sectorForAngleText(text: string): 'Products' | 'Regulations' {
  const lower = text.toLowerCase()
  return PRODUCT_SECTOR_KEYWORDS.some(k => lower.includes(k)) ? 'Products' : 'Regulations'
}

// Files today's single call-angle line to MUSE as a Tier 1 news entry — a
// no-op if nothing qualified today. Mirrors the old fileActionAnglesToMuse's
// "Call angle:" handling; "Post idea"/"Knowledge" lines aren't produced by
// the new pipeline (content_angle covers the LinkedIn case directly via the
// "Post idea" button instead).
export async function fileCallAngleToMuse(articles: CassandraArticle[]): Promise<number> {
  const line = bestCallAngleLine(articles)
  const match = line.match(/^call angle:\s*(.+)$/i)
  if (!match) return 0
  const text = match[1]!.trim()

  const title = `Call angle — ${text.split('—')[0]?.trim().slice(0, 60) ?? text.slice(0, 60)}`
  const sector = sectorForAngleText(text)
  const now = Math.floor(Date.now() / 1000)

  const entryId = await saveEntry({
    sector,
    title,
    summary: text,
    content: text,
    brief_depth: 'simple',
    source: 'cassandra',
    source_agent: 'CASSANDRA',
    status: 'active',
    date_filed: now,
    last_updated: now,
    privacy_tier: 1,
    entry_type: 'news',
  })
  await updateEntryTags(entryId, autoTag(text, title))
  return 1
}

// ─── Deterministic Slack/dashboard rendering ──────────────────────────────────

export function formatBriefSlackText(
  indices: IndexQuote[],
  fx: FxQuote[],
  articles: CassandraArticle[],
  skippedQueries: string[],
): string {
  const blocks: string[] = []

  if (indices.length > 0) {
    const lines = indices.map(q => `${q.label} ${fmtPct(q.dayChangePct)}`).join(' · ')
    const guarded = guardProse(`*Markets*\n${lines}`, 'Markets')
    if (guarded) blocks.push(guarded)
  }

  if (fx.length > 0) {
    const lines = fx.map(q => `${q.pair} ${q.rate.toFixed(4)} ${fmtPct(q.dayChangePct)}`).join(' · ')
    const guarded = guardProse(`*FX*\n${lines}`, 'FX')
    if (guarded) blocks.push(guarded)
  }

  const angleLine = bestCallAngleLine(articles)
  const guardedAngle = guardProse(angleLine, "Today's Angle")
  blocks.push(`*Today's Angle*\n${guardedAngle ?? 'Nothing significant today.'}`)

  const byCategory = new Map<CassandraCategory, CassandraArticle[]>()
  for (const a of articles) {
    const arr = byCategory.get(a.category) ?? []
    arr.push(a)
    byCategory.set(a.category, arr)
  }
  for (const [category, items] of byCategory) {
    const lines = items.map((item, i) => `${i + 1}. ${item.summary} — ${item.callAngle} (${item.source})`)
    blocks.push(`*${CATEGORY_LABEL[category]}*\n${lines.join('\n')}`)
  }

  if (articles.length === 0) {
    blocks.push('Nothing significant today worth using on calls.\nStandard calls — lead with the IHT April 2027 angle, still relevant.')
  }

  let msg = `*CASSANDRA — Morning Brief*\n${fmtDate(new Date())}\n\n` + blocks.join('\n\n')
  if (skippedQueries.length > 0) {
    msg += `\n\n_⚠ Some searches unavailable: ${skippedQueries.length} of ${SEARCHES.length} queries failed._`
  }
  return msg
}

// Compat shape for research_briefs.headlines_json — read by several older
// consumers (IRIS's getTodaysBrief, DIANA's getTodayAngle, the old standalone
// /dashboard/cassandra page, dashboard/hub-context's news panel). impact is
// always null — the old Regulatory/Tax impact-level concept doesn't carry
// over to the new flat category taxonomy.
export function toHeadlinesJsonCompat(articles: CassandraArticle[]): string {
  return JSON.stringify(articles.map(a => ({
    summary: a.summary,
    angle: a.callAngle,
    source: a.source,
    url: a.url,
    section: a.category,
    sectionLabel: CATEGORY_LABEL[a.category],
    impact: null,
  })))
}

// ─── Conversational follow-up (POST /api/dashboard/cassandra/chat) ───────────

export const CASSANDRA_CHAT_SYSTEM = `You are CASSANDRA, Archie's financial news research assistant.

Archie is a BDA at deVere and Partners Switzerland. He needs news he can use on cold calls and LinkedIn posts. He is NOT a qualified adviser.

You have access to today's news brief which was generated earlier.

When Archie asks follow-up questions:
- "Tell me more about [article]" → expand with more detail, find additional context
- "Find me more on [topic]" → run a fresh Brave search on that topic, return results
- "Give me the full article" → fetch the URL and summarise the full piece
- "Find a quote I can use" → pull the most quotable, credible line from the article
- "How do I use this on a call?" → give a specific one-liner he can say to a British expat
- "Turn this into a post" → suggest to open LinkedIn agent with this angle pre-loaded
- "What does Nigel Green say about this?" → search for deVere CEO's position on the topic

Always:
- British English
- Attribute quotes correctly — "[quote]" — [Person], [Title], [Publication], [Date]
- Never invent quotes or statistics
- Never give financial advice
- Keep responses concise — Archie is busy

CASSANDRA can run fresh Brave searches during the conversation when Archie asks to dig deeper. This is what makes it a research tool not just a bulletin.

CHOOSING A SEARCH TOOL — you have two:

search_news (Brave) — a quick news lookup. Use for:
- "find more news on..."
- "search for..."
- "any more on..."

deep_research (Perplexity) — synthesis across multiple sources, for anything
needing a considered answer rather than a fresh headline list. Use for:
- "tell me more about..."
- "find me quotes on..."
- "what are people saying about..."
- "give me different angles on..."
- "what does [person] say about..." (including "what does Nigel Green say")

If a request doesn't clearly match either list, use your judgement — simple
"what's new" style asks are search_news; anything asking you to think,
compare, or quote is deep_research.`

const SEARCH_TOOL: ToolDef = {
  name: 'search_news',
  description: 'Run a fresh Brave web search for current news on a topic — a quick headline lookup, not synthesis. Use for "find more news on X", "search for X", "any more on X".',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'The search query' } },
    required: ['query'],
  },
}

const DEEP_RESEARCH_TOOL: ToolDef = {
  name: 'deep_research',
  description: 'Run a deep, multi-source research query via Perplexity — for synthesis, pulling verbatim attributed quotes, comparing differing angles, or finding what a named person (e.g. Nigel Green) has said on a topic. Use for "tell me more about X", "find me quotes on X", "what are people saying about X", "give me different angles on X", "what does [person] say about X".',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'The research question' } },
    required: ['query'],
  },
}

const FETCH_ARTICLE_TOOL: ToolDef = {
  name: 'fetch_article',
  description: 'Fetch the full text of an article by URL, to summarise or quote from beyond the stored summary.',
  input_schema: {
    type: 'object',
    properties: { url: { type: 'string', description: 'The article URL to fetch' } },
    required: ['url'],
  },
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchArticleText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MAIA/1.0)' } })
    if (!res.ok) return `Could not fetch this page (HTTP ${res.status}). Use the stored summary instead.`
    const html = await res.text()
    const text = stripHtml(html)
    return text.slice(0, 6000) || 'The page returned no readable text. Use the stored summary instead.'
  } catch (err) {
    console.error(`[cassandra] fetch_article failed for ${url}:`, err)
    return 'Could not fetch this page. Use the stored summary instead.'
  }
}

async function runSearchTool(query: string): Promise<string> {
  try {
    const results = await braveSearch(query, 6)
    if (results.length === 0) return 'No fresh results found for that search.'
    return results.map(r => `"${r.title}" — ${r.source}\n${r.description}\nURL: ${r.url}\nAge: ${r.age ?? 'unknown'}`).join('\n\n')
  } catch (err) {
    console.error(`[cassandra] chat search_news failed for "${query}":`, err)
    return 'That search failed — Brave Search is temporarily unavailable.'
  }
}

async function runDeepResearchTool(query: string): Promise<string> {
  try {
    const { answer, citations } = await askPerplexity(query)
    const citationBlock = citations.length > 0 ? `\n\nSources:\n${citations.join('\n')}` : ''
    return `${answer}${citationBlock}`
  } catch (err) {
    console.error(`[cassandra] chat deep_research failed for "${query}":`, err)
    return 'That deep research failed — Perplexity is temporarily unavailable.'
  }
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

// Runs the chat follow-up loop. todaysContext is a plain-text digest of
// today's articles (title/source/summary/key_quote/call_angle/url per item)
// so Claude has today's brief in hand without a separate tool round-trip for
// the common "tell me more about X" case.
export async function answerCassandraFollowUp(
  history: ChatTurn[],
  todaysContext: string,
): Promise<{ text: string; ranFreshSearch: boolean }> {
  const messages: ChatTurn[] = [
    { role: 'user', content: `Today's news brief (for context — already shown to Archie):\n\n${todaysContext || '(no brief generated yet today)'}` },
    { role: 'assistant', content: "Got it — I've got today's brief in hand. What do you need?" },
    ...history,
  ]

  const { text, toolCalls } = await askWithTools(
    CASSANDRA_CHAT_SYSTEM,
    messages,
    [SEARCH_TOOL, DEEP_RESEARCH_TOOL, FETCH_ARTICLE_TOOL],
    async (name, input) => {
      if (name === 'search_news') return runSearchTool(String(input.query ?? ''))
      if (name === 'deep_research') return runDeepResearchTool(String(input.query ?? ''))
      if (name === 'fetch_article') return fetchArticleText(String(input.url ?? ''))
      return 'Unknown tool.'
    },
    900,
    CHAT_MODEL,
  )

  const ranFreshSearch = toolCalls.some(c => c.name === 'search_news' || c.name === 'deep_research')
  return { text: text || "I couldn't put together a reply there — try rephrasing?", ranFreshSearch }
}
