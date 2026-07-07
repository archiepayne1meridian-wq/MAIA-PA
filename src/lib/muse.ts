// MUSE — Second Brain. Claude/Haiku calls for Steps 3+.

import { askWith } from './claude'
import { getAllEntryTitles, savePending, searchEntries } from '../../tools/muse'

const HAIKU = 'claude-haiku-4-5-20251001'

const SECTORS = [
  'Training',
  'Markets',
  'Products',
  'Regulations',
  'Sales & Prospecting',
  'Expat Knowledge',
  'Performance',
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

// ─── processInput — orchestration: getAllEntryTitles → assessValue → savePending ─

export async function processInput(
  content: string,
  type: 'file' | 'brain_dump',
  sectorHint?: string,
): Promise<{ pendingIds: string[]; assessment: MuseAssessment }> {
  const existingTitles = await getAllEntryTitles()
  const assessment = await assessValue(content, existingTitles, sectorHint)

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

export async function searchKnowledge(
  query: string,
  sector?: string,
): Promise<{
  synthesis: string
  results: {
    id: string
    title: string
    sector: string
    summary: string
    relevanceReason: string
    date_filed: number
    last_updated: number
  }[]
}> {
  // Strip trailing punctuation so "QROPS?" and "QROPS" both hit the same LIKE pattern
  const cleanQuery = query.replace(/[?!.,;:]+$/, '').trim() || query
  const dbResults = await searchEntries(cleanQuery, sector)

  if (dbResults.length === 0) {
    return { synthesis: 'Nothing found on this topic yet.', results: [] }
  }

  const resultsBlock = dbResults
    .map((r, i) => `${i + 1}. id="${r.id}" [${r.sector}] "${r.title}"\nSummary: ${r.summary}`)
    .join('\n\n')

  const prompt = `You are MUSE, a second-brain search assistant for a trainee financial adviser.

Search query: "${cleanQuery}"${sector ? ` (sector filter: ${sector})` : ''}

Entries from the knowledge base:
${resultsBlock}

Return a JSON object (no markdown fences, no extra keys):
{
  "synthesis": "1-2 sentence factual synthesis of what the knowledge base contains on this topic",
  "results": [
    {
      "id": "<exact id from above>",
      "title": "<exact title from above>",
      "relevanceReason": "<one sentence: why this entry answers the query>"
    }
  ]
}

Order results by relevance (most relevant first). Include only entries that genuinely relate to the query.
synthesis: neutral, factual — no recommendations, no advice.
Use ONLY the ids and titles provided above — do not invent entries.`

  const raw = await askWith(
    'You are MUSE, a precise knowledge-management agent. Respond with valid JSON only. No prose, no markdown fences.',
    prompt,
    800,
    HAIKU,
  )

  const ranked = parseJSON<{
    synthesis: string
    results: { id: string; title: string; relevanceReason: string }[]
  }>(raw, 'searchKnowledge')

  // Merge Haiku reasoning with authoritative DB data — reject any hallucinated IDs
  const dbById = new Map(dbResults.map(r => [r.id, r]))
  const enriched = ranked.results
    .map(r => {
      const db = dbById.get(r.id)
      if (!db) return null
      return {
        id: db.id,
        title: db.title,
        sector: db.sector,
        summary: db.summary,
        relevanceReason: r.relevanceReason ?? 'Matches your search query.',
        date_filed: db.date_filed,
        last_updated: db.last_updated,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  // Fallback: if Haiku returned no valid IDs, use DB order with generic reason
  const finalResults =
    enriched.length > 0
      ? enriched
      : dbResults.map(r => ({
          ...r,
          relevanceReason: 'Matches your search query.',
        }))

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
