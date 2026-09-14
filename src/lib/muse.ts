// MUSE — Second Brain. Claude/Haiku calls for Steps 3+.

import { askWith } from './claude'
import { getAllEntryTitles, savePending, type MuseEntry } from '../../tools/muse'
import { getDb } from '@/db'
import { muse_entries, muse_templates, muse_cases } from '@/db/schema'
import { eq, ne, and } from 'drizzle-orm'

const HAIKU = 'claude-haiku-4-5-20251001'

const SECTORS = [
  'Training',
  'Products',
  'Regulations',
  'Sales & Prospecting',
  'Expat Knowledge',
  'Funds & Macro',
  'Client Psychology & Profiles',
] as const

export interface MuseAssessment {
  sector: string
  depth: 'simple' | 'medium' | 'detailed'
  title: string
  summary: string
  content: string
  links: string[]
  isDuplicate: boolean
  duplicateId?: string
  isLowValue: boolean
  lowValueReason?: string
}

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

function parseJSON<T>(raw: string, context: string): T {
  const clean = stripFences(raw)
  try {
    return JSON.parse(clean) as T
  } catch {
    throw new Error(`MUSE ${context}: model returned non-JSON — ${clean.slice(0, 200)}`)
  }
}

// ─── assessValue — single Haiku call, returns full structured assessment ───────

export async function assessValue(
  content: string,
  existingTitles: { id: string; title: string; sector: string }[],
  sectorHint?: string,
): Promise<MuseAssessment> {
  const titlesBlock =
    existingTitles.length > 0
      ? `\nExisting entries (for link suggestions — use exact titles only):\n${existingTitles
          .map(t => `  [${t.sector}] ${t.title}`)
          .join('\n')}`
      : '\nExisting entries: none yet.'

  const prompt = `Analyse this input for a trainee financial adviser's second-brain knowledge base (MFSA-regulated, Malta, EU GDPR, deVere Group).
${sectorHint ? `\nSector hint: ${sectorHint}` : ''}
${titlesBlock}

Input to analyse:
"""
${content}
"""

Return a JSON object with EXACTLY these keys (no markdown fences, no extra keys):
{
  "sector": one of [${SECTORS.map(s => `"${s}"`).join(', ')}],
  "depth": "simple" | "medium" | "detailed",
  "title": "concise title, max 10 words",
  "summary": "2-3 sentences capturing the key insight",
  "content": "full brief in markdown at the chosen depth — see format rules below",
  "links": ["exact title of related existing entry", ...],
  "isDuplicate": boolean,
  "duplicateId": null,
  "isLowValue": boolean,
  "lowValueReason": null or "reason string"
}

Depth rules:
- simple: single fact or definition (2-3 sentences + links)
- medium: concept requiring context (summary + key points + links)
- detailed: multi-part topic (summary + section headers + key points + links)

Content format by depth:
simple → "**Summary:** [2-3 sentences]\n\n**Filed:** [today's date ISO]\n\n**Links:** [titles or 'None']"
medium → "**Summary:** [summary]\n\n**Key Points:**\n- [point]\n- [point]\n\n**Filed:** [today's date ISO]\n\n**Links:** [titles or 'None']"
detailed → "**Summary:** [summary]\n\n**[Section headers as appropriate]**\n[content]\n\n**Key Points:**\n- [point]\n\n**Filed:** [today's date ISO]\n\n**Links:** [titles or 'None']"

Link rules:
- Only use exact titles from the existing entries list above. Empty array [] if none apply.
- isDuplicate: true only if this content substantially overlaps an existing entry.

Value rules:
- isLowValue: true if content is too vague, trivial, off-topic, or not useful for an adviser's work.
- Examples of low value: common knowledge ("the sky is blue"), purely personal observations with no professional relevance, typos/test inputs.
- Products entries: mechanism-only language. No buy/sell/hold/recommend.
- Regulations entries: MFSA/Malta jurisdiction by default.`

  const raw = await askWith(
    'You are MUSE, a precise knowledge-management agent. Respond with valid JSON only. No prose, no markdown fences.',
    prompt,
    1200,
    HAIKU,
  )

  const result = parseJSON<MuseAssessment>(raw, 'assessValue')

  // Normalise: ensure required fields are present and types are correct
  if (!SECTORS.includes(result.sector as (typeof SECTORS)[number])) {
    result.sector = 'Training' // safe fallback; Haiku rarely misclassifies but can
  }
  if (!['simple', 'medium', 'detailed'].includes(result.depth)) {
    result.depth = 'medium'
  }
  result.links = Array.isArray(result.links) ? result.links : []
  result.isDuplicate = Boolean(result.isDuplicate)
  result.isLowValue = Boolean(result.isLowValue)

  return result
}

// ─── Chunking for very long documents — never truncate ────────────────────────
// MUSE must accept documents of any length. A single Haiku call can only reliably
// assess ~8000 tokens of input before its own output budget forces it to compress
// or drop detail. Past that threshold, split on paragraph boundaries, assess each
// chunk independently, then merge into one entry — every chunk's content survives
// in the merged result; nothing is silently cut off the end of a long document.

const CHARS_PER_TOKEN_ESTIMATE = 4
export const CHUNK_TOKEN_LIMIT = 8000
const CHUNK_CHAR_LIMIT = CHUNK_TOKEN_LIMIT * CHARS_PER_TOKEN_ESTIMATE

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE)
}

// Splits on paragraph boundaries (blank lines) so chunks don't fracture mid-sentence.
// Falls back to single-newline, then hard character slicing, if one paragraph alone
// exceeds the chunk budget.
export function chunkContent(content: string, maxChars: number = CHUNK_CHAR_LIMIT): string[] {
  const paragraphs = content.split(/\n\s*\n/)
  const chunks: string[] = []
  let current = ''

  const flush = () => { if (current) { chunks.push(current); current = '' } }

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }
    flush()
    if (para.length <= maxChars) {
      current = para
    } else {
      // A single paragraph is itself larger than the budget — hard-split it so no
      // amount of content is ever dropped.
      for (let i = 0; i < para.length; i += maxChars) {
        chunks.push(para.slice(i, i + maxChars))
      }
    }
  }
  flush()
  return chunks.length > 0 ? chunks : [content]
}

const DEPTH_RANK: Record<MuseAssessment['depth'], number> = { simple: 0, medium: 1, detailed: 2 }

// Runs assessValue per chunk (in parallel) and merges into one MuseAssessment.
// Every chunk's assessed content is preserved in full in the merged content field —
// concatenated as numbered parts, never truncated or dropped.
async function assessValueChunked(
  content: string,
  existingTitles: { id: string; title: string; sector: string }[],
  sectorHint?: string,
): Promise<MuseAssessment> {
  const chunks = chunkContent(content)
  const perChunk = await Promise.all(chunks.map(c => assessValue(c, existingTitles, sectorHint)))

  // Sector: majority vote across chunks (documents are usually about one topic).
  const sectorCounts = new Map<string, number>()
  for (const a of perChunk) sectorCounts.set(a.sector, (sectorCounts.get(a.sector) ?? 0) + 1)
  const sector = [...sectorCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0]!

  // Depth: the deepest level any chunk warranted.
  const depth = perChunk.reduce<MuseAssessment['depth']>(
    (d, a) => (DEPTH_RANK[a.depth] > DEPTH_RANK[d] ? a.depth : d),
    'simple',
  )

  const links = Array.from(new Set(perChunk.flatMap(a => a.links)))
  const isDuplicate = perChunk.some(a => a.isDuplicate)
  const duplicateId = perChunk.find(a => a.isDuplicate)?.duplicateId
  // Low-value only if every part agrees — one substantial section is enough to keep it.
  const isLowValue = perChunk.every(a => a.isLowValue)
  const lowValueReason = isLowValue ? perChunk.find(a => a.lowValueReason)?.lowValueReason : undefined

  const title = perChunk[0]!.title
  const combinedSummary = perChunk.map(a => a.summary).join(' ')
  const mergedBody = perChunk
    .map((a, i) => (perChunk.length > 1 ? `### Part ${i + 1} of ${perChunk.length}\n${a.content}` : a.content))
    .join('\n\n')

  const filedDate = new Date().toISOString().slice(0, 10)
  const content_ =
    `**Summary:** ${combinedSummary}\n\n` +
    (perChunk.length > 1 ? `_Long document — processed in ${perChunk.length} parts, nothing truncated._\n\n` : '') +
    `${mergedBody}\n\n` +
    `**Filed:** ${filedDate}\n\n` +
    `**Links:** ${links.length > 0 ? links.join(', ') : 'None'}`

  return {
    sector, depth, title,
    summary: combinedSummary,
    content: content_,
    links, isDuplicate, duplicateId, isLowValue, lowValueReason,
  }
}

// ─── processInput — orchestration: getAllEntryTitles → assessValue → savePending ─

export async function processInput(
  content: string,
  type: 'file' | 'brain_dump',
  sectorHint?: string,
): Promise<{ pendingIds: string[]; assessment: MuseAssessment }> {
  const existingTitles = await getAllEntryTitles()
  const assessment = estimateTokens(content) > CHUNK_TOKEN_LIMIT
    ? await assessValueChunked(content, existingTitles, sectorHint)
    : await assessValue(content, existingTitles, sectorHint)

  if (assessment.isLowValue) {
    return { pendingIds: [], assessment }
  }

  const pendingId = await savePending({
    source: type === 'brain_dump' ? 'brain_dump' : 'archie_input',
    source_agent: null,
    suggested_sector: assessment.sector,
    suggested_title: assessment.title,
    suggested_summary: assessment.summary,
    suggested_content: assessment.content,
    suggested_depth: assessment.depth,
    suggested_links: JSON.stringify(assessment.links),
    slack_ts: null,
  })

  return { pendingIds: [pendingId], assessment }
}

// ─── generateBrief — wired in Step 3 (reuses assessValue output) ─────────────

export async function generateBrief(
  assessment: MuseAssessment,
  _source: string,
): Promise<string> {
  return assessment.content
}

// ─── Auto-tagging ─────────────────────────────────────────────────────────────

const TAG_KEYWORDS: Record<string, string[]> = {
  'uk-pension': ['uk pension', 'sipp', 'defined benefit', 'defined contribution', 'pension transfer', 'cetv'],
  'qrops': ['qrops', 'overseas transfer', 'qualifying recognised'],
  'iht': ['inheritance tax', 'iht', 'estate', 'april 2027', 'nil rate band'],
  'swiss-pension': ['pillar 2', 'pillar 3', 'vested benefits', 'bvg', 'lpp', 'freizugigkeit', 'liberty'],
  'portfolio-bond': ['portfolio bond', 'offshore bond', 'rl360', 'providence', 'gross roll-up', 'time-apportionment'],
  'structured-notes': ['structured note', 'autocall', 'coupon barrier', 'capital protection', 'memory coupon'],
  'ardan': ['ardan', 'platform', 'ocf', 'charges', 'cost transparency'],
  'tax': ['tax', 'cgt', 'capital gains', 'income tax', 'non-dom', 'domicile', 'residency'],
  'expat': ['expat', 'expatriate', 'internationally mobile', 'cross-border', 'non-resident'],
  'switzerland': ['switzerland', 'swiss', 'geneva', 'zurich', 'basel', 'lausanne', 'chf'],
  'uk-connected': ['uk connected', 'british', 'uk assets', 'back home', 'uk property'],
  'leaving-switzerland': ['leaving switzerland', 'repatri', 'moving back', 'exit strategy'],
  'new-to-switzerland': ['new to switzerland', 'recently moved', 'just arrived'],
  'cash-pile': ['cash pile', 'sitting in cash', 'savings account', 'inflation erosion'],
  'market': ['market drop', 'volatility', 'selloff', 'bear market', 'tech drop'],
  'compounding': ['compound', 'rule of 72', 'cost drag', 'time in market'],
  'objection': ['objection', 'not interested', 'send me an email', 'already got an adviser'],
  'fact-find': ['fact find', 'what when who where', 'ladder', 'ted'],
  'close': ['close', 'funnel', 'stephen smith', 'booking', 'meeting booked'],
  'devere': ['devere', 'de vere', 'pepsi', 'wealth management'],
}

export function autoTag(content: string, title: string): string[] {
  const text = `${title} ${content}`.toLowerCase()
  const tags: string[] = []
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) tags.push(tag)
  }
  return tags
}

// ─── Auto-linking ─────────────────────────────────────────────────────────────
// Pure DB scoring, no Claude call — lives here (rather than tools/muse.ts) per
// the brief; it's the one place in this file that talks to the DB directly.

export async function findRelatedEntries(
  entryId: string,
  tags: string[],
  limit = 5,
): Promise<string[]> {
  if (tags.length === 0) return []

  const allEntries = await getDb().select({
    id: muse_entries.id,
    tags: muse_entries.tags,
    privacy_tier: muse_entries.privacy_tier,
  })
    .from(muse_entries)
    .where(
      and(
        ne(muse_entries.id, entryId),
        eq(muse_entries.privacy_tier, 1),
        eq(muse_entries.status, 'active'),
      ),
    )

  const scored = allEntries.map(entry => {
    let entryTags: string[] = []
    try { entryTags = JSON.parse(entry.tags || '[]') } catch { /* ignore */ }
    const overlap = tags.filter(t => entryTags.includes(t)).length
    return { id: entry.id, score: overlap }
  })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(e => e.id)
}

// ─── searchKnowledge — pure DB relevance scoring across entries + templates + cases ─
// Replaces the previous Haiku-ranked version: no model call, so this is instant,
// free, and (unlike the old version) trivially safe re Tier 2 — it never sends
// entry content anywhere, it only reads from SQLite and returns rows.
//
// NOTE — signature/shape change: the old searchKnowledge(query, sector) returned
// { synthesis, results: SearchResult[] } and was used by handleMuseSearch (Slack's
// "MUSE, search..." intent). That caller has been updated to work off this new
// { knowledge, templates, cases } shape instead — it loses the Haiku-authored
// one-line synthesis, but gains templates in the same search and is instant.

export interface ScoredEntry extends MuseEntry {
  relevance_score: number
  result_type: 'knowledge'
}
export interface ScoredTemplate {
  id: string; name: string; category: string; scenario: string | null; angle: string | null
  subject: string | null; body: string; medium: string; times_used: number; last_used: number | null
  result_type: 'template'
}
export interface ScoredCase {
  id: string; display_name: string; company: string | null; location: string | null
  occupation: string | null; financial_profile: string | null; status: string; outcome: string | null
  result_type: 'case'
}

export async function searchKnowledge(query: string, options?: {
  privacyTier?: 1 | 2 | 'all'
  entryType?: string
  limit?: number
}): Promise<{ knowledge: ScoredEntry[]; templates: ScoredTemplate[]; cases: ScoredCase[] }> {
  const tier = options?.privacyTier ?? 1
  const limit = options?.limit ?? 20
  const queryLower = query.toLowerCase()
  const queryWords = queryLower.split(' ').filter(w => w.length > 2)

  let entries = await getDb().select().from(muse_entries)
    .where(eq(muse_entries.status, 'active')) as MuseEntry[]

  if (tier !== 'all') {
    entries = entries.filter(e => e.privacy_tier === tier)
  }
  if (options?.entryType) {
    entries = entries.filter(e => e.entry_type === options.entryType)
  }

  const scored = entries.map(entry => {
    let score = 0
    const title = (entry.title || '').toLowerCase()
    const content = (entry.content || '').toLowerCase()
    let tags: string[] = []
    try { tags = JSON.parse(entry.tags || '[]') } catch { /* ignore */ }
    const summary = (entry.summary || '').toLowerCase()

    if (title.includes(queryLower)) score += 10
    queryWords.forEach(word => {
      if (tags.some(t => t.includes(word))) score += 5
      if (summary.includes(word)) score += 2
      if (content.includes(word)) score += 1
    })
    if (summary.includes(queryLower)) score += 4
    if (content.includes(queryLower)) score += 3
    score += Math.min((entry.times_accessed || 0) * 0.1, 2)

    return { entry, score }
  })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  for (const { entry } of scored.slice(0, 5)) {
    await getDb().update(muse_entries)
      .set({ times_accessed: (entry.times_accessed || 0) + 1 })
      .where(eq(muse_entries.id, entry.id))
  }

  // Also search templates
  const templates = await getDb().select().from(muse_templates)
  const matchedTemplates = templates.filter(t => {
    const text = `${t.name} ${t.body} ${t.scenario ?? ''}`.toLowerCase()
    return queryWords.some(w => text.includes(w))
  }).slice(0, 5)

  // Also search cases
  const cases = await getDb().select().from(muse_cases)
  const matchedCases = cases.filter(c => {
    const text = `${c.display_name} ${c.company ?? ''} ${c.location ?? ''} ${c.occupation ?? ''} ${c.financial_profile ?? ''}`.toLowerCase()
    return queryWords.some(w => text.includes(w))
  }).slice(0, 5)

  return {
    knowledge: scored.map(({ entry, score }): ScoredEntry => ({ ...entry, relevance_score: score, result_type: 'knowledge' })),
    templates: matchedTemplates.map((t): ScoredTemplate => ({ ...t, result_type: 'template' })),
    cases: matchedCases.map((c): ScoredCase => ({ ...c, result_type: 'case' })),
  }
}

// ─── checkDuplicate — folded into assessValue in Step 3 ──────────────────────

export async function checkDuplicate(
  _title: string,
  _content: string,
): Promise<{ isDuplicate: boolean; matchId?: string; matchTitle?: string }> {
  throw new Error('[muse] checkDuplicate not yet wired — awaiting Step 3')
}

// ─── extractLinks — folded into assessValue in Step 3 ────────────────────────

export async function extractLinks(
  _content: string,
  _existingTitles: { id: string; title: string; sector: string }[],
): Promise<string[]> {
  throw new Error('[muse] extractLinks not yet wired — awaiting Step 3')
}

// ─── refinePending — revise a pending suggestion from a free-text instruction ─

export interface MuseRefinement {
  title: string
  summary: string
  content: string
}

export async function refinePending(
  current: { title: string; summary: string; content: string },
  instruction: string,
): Promise<MuseRefinement> {
  const systemPrompt =
    `You are MUSE, a precise knowledge-management agent for a trainee financial adviser.\n` +
    `You are given a pending knowledge-base entry and an edit instruction from the user.\n` +
    `Revise the entry to satisfy the instruction while keeping everything else about it intact.\n\n` +
    `Respond with valid JSON only — no prose, no markdown fences.\n` +
    `Format: { "title": string, "summary": string, "content": string }`

  const userText =
    `Current entry:\n` +
    `Title: ${current.title}\n` +
    `Summary: ${current.summary}\n` +
    `Content: ${current.content}\n\n` +
    `Edit instruction: ${instruction}`

  const raw = await askWith(systemPrompt, userText, 1200, HAIKU)
  const result = parseJSON<MuseRefinement>(raw, 'refinePending')

  return {
    title: typeof result.title === 'string' && result.title.trim() ? result.title : current.title,
    summary: typeof result.summary === 'string' ? result.summary : current.summary,
    content: typeof result.content === 'string' && result.content.trim() ? result.content : current.content,
  }
}

// ─── generateDirectFiling — title/summary/links for a deliberate dashboard filing ─
// Used by POST /api/dashboard/muse/file-direct. Unlike assessValue, this never
// classifies sector (the user already picked it) and never rejects on "low value" —
// a deliberate filing with a user-chosen sector and context is filed regardless.
// The raw content is stored verbatim by the caller; this only generates metadata.

export interface DirectFilingMeta {
  title: string
  summary: string
  links: string[]
}

async function directFilingChunk(
  content: string,
  context: string | undefined,
  existingTitles: { id: string; title: string; sector: string }[],
): Promise<DirectFilingMeta> {
  const titlesBlock =
    existingTitles.length > 0
      ? `\nExisting entries (for link suggestions — use exact titles only):\n${existingTitles
          .map(t => `  [${t.sector}] ${t.title}`)
          .join('\n')}`
      : '\nExisting entries: none yet.'

  const prompt = `Generate a title and summary for this document, being filed deliberately by a trainee financial adviser into their knowledge base (MFSA-regulated, Malta, EU GDPR, deVere Group).
${context ? `\nContext the adviser gave for why they're filing this:\n${context}` : ''}
${titlesBlock}

Document:
"""
${content}
"""

Return a JSON object with EXACTLY these keys (no markdown fences, no extra keys):
{
  "title": "concise title, max 10 words",
  "summary": "2-3 sentences capturing the key content",
  "links": ["exact title of related existing entry", ...]
}

Title rules: plain title text only — never prefix it with the sector name or a
"[Sector]"-style tag (the sector is already shown separately in the UI). The
"[sector] title" format in the existing-entries list above is for your reference
only, not a format to imitate in your own output.
Link rules: only use exact titles from the existing entries list above. Empty array [] if none apply.`

  const raw = await askWith(
    'You are MUSE, a precise knowledge-management agent. Respond with valid JSON only. No prose, no markdown fences.',
    prompt,
    400,
    HAIKU,
  )
  return parseJSON<DirectFilingMeta>(raw, 'generateDirectFiling')
}

export async function generateDirectFiling(
  content: string,
  context: string | undefined,
  existingTitles: { id: string; title: string; sector: string }[],
): Promise<DirectFilingMeta> {
  if (estimateTokens(content) <= CHUNK_TOKEN_LIMIT) {
    return directFilingChunk(content, context, existingTitles)
  }

  // Long document — same never-truncate treatment as processInput: assess each
  // chunk's title/summary/links, then merge.
  const chunks = chunkContent(content)
  const perChunk = await Promise.all(chunks.map(c => directFilingChunk(c, context, existingTitles)))

  return {
    title: perChunk[0]!.title,
    summary: perChunk.map(p => p.summary).join(' '),
    links: Array.from(new Set(perChunk.flatMap(p => p.links))),
  }
}
