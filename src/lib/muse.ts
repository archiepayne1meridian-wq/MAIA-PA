// MUSE — Second Brain. Claude/Haiku calls for Steps 3+.

import { askWith } from './claude'
import { getAllEntryTitles, savePending, searchEntries } from '../../tools/muse'
import { searchCases } from '../../tools/muse-cases'

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

// ─── searchKnowledge — DB lookup + optional Haiku ranking ────────────────────

export interface SearchResult {
  id: string
  type: 'entry' | 'case'
  title: string
  sector: string       // for cases, always the literal label 'Case'
  summary: string
  relevanceReason: string
  date_filed: number
  last_updated: number
}

// Cases only enter "search everything" (no sector filter) — a case doesn't belong to a
// knowledge sector, so a sector-scoped search stays knowledge-only.
export async function searchKnowledge(
  query: string,
  sector?: string,
): Promise<{ synthesis: string; results: SearchResult[] }> {
  // Strip trailing punctuation so "QROPS?" and "QROPS" both hit the same LIKE pattern
  const cleanQuery = query.replace(/[?!.,;:]+$/, '').trim() || query
  const [dbResults, caseResults] = await Promise.all([
    searchEntries(cleanQuery, sector),
    sector ? Promise.resolve([]) : searchCases(cleanQuery),
  ])

  if (dbResults.length === 0 && caseResults.length === 0) {
    return { synthesis: 'Nothing found on this topic yet.', results: [] }
  }

  const entriesBlock = dbResults
    .map((r, i) => `${i + 1}. id="${r.id}" type=entry [${r.sector}] "${r.title}"\nSummary: ${r.summary}`)
    .join('\n\n')

  const casesBlock = caseResults
    .map((c, i) => {
      const label = c.company ? `${c.display_name} — ${c.company}` : c.display_name
      const profile = [c.occupation, c.financial_profile, c.outcome].filter(Boolean).join(' — ')
      return `${i + 1}. id="${c.id}" type=case "${label}"\nProfile: ${profile || '(no profile details yet)'}`
    })
    .join('\n\n')

  const prompt = `You are MUSE, a second-brain search assistant for a trainee financial adviser.

Search query: "${cleanQuery}"${sector ? ` (sector filter: ${sector})` : ''}

Knowledge entries:
${entriesBlock || '(none)'}

Prospect cases:
${casesBlock || '(none)'}

Return a JSON object (no markdown fences, no extra keys):
{
  "synthesis": "1-2 sentence factual synthesis of what the knowledge base and cases contain on this topic",
  "results": [
    {
      "id": "<exact id from above>",
      "type": "entry" | "case",
      "relevanceReason": "<one sentence: why this genuinely relates to the query>"
    }
  ]
}

Order results by relevance (most relevant first). Include only items that genuinely relate to the query.
synthesis: neutral, factual — no recommendations, no advice.
Use ONLY the ids provided above — do not invent entries or cases.`

  const raw = await askWith(
    'You are MUSE, a precise knowledge-management agent. Respond with valid JSON only. No prose, no markdown fences.',
    prompt,
    800,
    HAIKU,
  )

  const ranked = parseJSON<{
    synthesis: string
    results: { id: string; type: 'entry' | 'case'; relevanceReason: string }[]
  }>(raw, 'searchKnowledge')

  // Merge Haiku reasoning with authoritative DB data — reject any hallucinated IDs
  const dbById = new Map(dbResults.map(r => [r.id, r]))
  const caseById = new Map(caseResults.map(c => [c.id, c]))

  const enriched = ranked.results
    .map((r): SearchResult | null => {
      if (r.type === 'case') {
        const c = caseById.get(r.id)
        if (!c) return null
        return {
          id: c.id,
          type: 'case',
          title: c.company ? `${c.display_name} — ${c.company}` : c.display_name,
          sector: 'Case',
          summary: [c.occupation, c.financial_profile].filter(Boolean).join(' — ') || 'No profile details yet.',
          relevanceReason: r.relevanceReason ?? 'Matches your search query.',
          date_filed: c.created_at,
          last_updated: c.updated_at,
        }
      }
      const db = dbById.get(r.id)
      if (!db) return null
      return {
        id: db.id,
        type: 'entry',
        title: db.title,
        sector: db.sector,
        summary: db.summary,
        relevanceReason: r.relevanceReason ?? 'Matches your search query.',
        date_filed: db.date_filed,
        last_updated: db.last_updated,
      }
    })
    .filter((r): r is SearchResult => r !== null)

  // Fallback: if Haiku returned no valid IDs, use DB order with generic reason
  const finalResults: SearchResult[] =
    enriched.length > 0
      ? enriched
      : [
          ...dbResults.map((r): SearchResult => ({
            id: r.id, type: 'entry', title: r.title, sector: r.sector, summary: r.summary,
            relevanceReason: 'Matches your search query.',
            date_filed: r.date_filed, last_updated: r.last_updated,
          })),
          ...caseResults.map((c): SearchResult => ({
            id: c.id, type: 'case',
            title: c.company ? `${c.display_name} — ${c.company}` : c.display_name,
            sector: 'Case',
            summary: [c.occupation, c.financial_profile].filter(Boolean).join(' — ') || 'No profile details yet.',
            relevanceReason: 'Matches your search query.',
            date_filed: c.created_at, last_updated: c.updated_at,
          })),
        ]

  return { synthesis: ranked.synthesis ?? '', results: finalResults }
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
