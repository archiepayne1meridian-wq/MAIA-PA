// IRIS draft generation.
// formatSlackMessage is live — used by all cron/handler paths.

import OpenAI from 'openai'
import { askWith, askWithWebSearch, type WebSearchTrace } from './claude'
import type { VoicePref } from '../../tools/iris'

let _openai: OpenAI | null = null
function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('[IRIS] OPENAI_API_KEY is not set')
    _openai = new OpenAI({ apiKey })
  }
  return _openai
}

function buildSvgFallback(prompt: string): string {
  const label = prompt.slice(0, 55).replace(/[<>&"']/g, ' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="628" viewBox="0 0 1200 628">
  <rect width="1200" height="628" fill="#05101f"/>
  <rect x="0" y="0" width="4" height="628" fill="#1a6fff"/>
  <text x="60" y="260" font-family="Georgia, serif" font-size="18" letter-spacing="8" fill="#1a6fff" text-anchor="start">IRIS</text>
  <text x="60" y="320" font-family="Georgia, serif" font-size="22" fill="#c8d8f0" text-anchor="start">${label}…</text>
  <text x="60" y="570" font-family="monospace" font-size="13" fill="#2a4060" text-anchor="start">maia · linkedin content engine</text>
</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const HAIKU = 'claude-haiku-4-5-20251001'

export interface IrisDraft {
  skip?: false
  pillar: 1 | 2 | 3
  topic: string
  copy: string
  imagePrompt: string
  format: string
  postTime: string
  groundedInSearch: boolean
  search: WebSearchTrace
}

export interface IrisSkip {
  skip: true
  reason: string
}

// System prompt embeds the current year server-side so Claude never has to guess
// it from (possibly stale) training data when building the search query. The
// audience relevance filter only applies to Pillar 1/2 (finance content) — Pillar 3
// (sports & lifestyle) is opportunistic instead: it has its own skip clause below
// that fires when the day's search doesn't turn up a story with a natural finance
// angle, rather than being tested against the cross-border-relevance question.
function buildIrisSystem(pillar: 1 | 2 | 3): string {
  const year = new Date().getFullYear()

  const relevanceFilterBlock = pillar === 3 ? '' : `
RELEVANCE FILTER — apply before drafting every post:
Ask: "Would someone living in Switzerland with assets in another country
think this affects them?"

If YES → draft the post
If NO → do not draft. Return { skip: true, reason: "Not relevant to target audience" }

Target audience: people living in Switzerland who have money, pensions,
property, savings or investments in another country. Any nationality.
They are not stock pickers. They do not care about company earnings or
sector rotation. They care about what happens to their cross-border money
when rules change, currencies move, or governments make decisions.

The goal of every post: make someone in that situation think
"this could affect me — I should find out more."

If the topic fails the filter, output ONLY {"skip": true, "reason": "..."} — a short,
specific reason — and stop. Do not search, do not draft, do not include any other fields.
`

  const schemaLine = pillar === 3
    ? `Your job is to write conversation-first LinkedIn posts that build Archie's personal brand. Search for today's sports/lifestyle news first, per the PILLAR 3 rules below. If nothing stands out, output ONLY: {"skip": true, "reason": "..."}. If you find a genuinely good story with a natural finance angle, output ONLY valid JSON matching this schema exactly (no markdown, no prose outside the JSON):
{"topic": "short label for the specific story, e.g. \\"Ryder Cup prize money\\"", "copy": "...", "imagePrompt": "...", "format": "text with image|poll|text only", "postTime": "...", "groundedInSearch": true|false}`
    : `Your job is to write conversation-first LinkedIn posts that build Archie's personal brand. If the topic passes the relevance filter, search, then output ONLY valid JSON matching this schema exactly (no markdown, no prose outside the JSON):
{"copy": "...", "imagePrompt": "...", "format": "text with image|poll|text only", "postTime": "...", "groundedInSearch": true|false}
If the topic fails the relevance filter, output ONLY: {"skip": true, "reason": "..."}`

  return `You are IRIS, MAIA's LinkedIn content engine for Archie Payne — a 20-something British expat in Malta, training as a financial adviser.
${relevanceFilterBlock}
Before writing, search the web for the most recent news on the given topic (last 7 days). Build the search query from the topic — expand abbreviations, add context — then always append ${year} for recency.
Examples:
- Topic "Fed rate decision" → search "Federal Reserve interest rate decision ${year}"
- Topic "SpaceX IPO" → search "SpaceX IPO latest news ${year}"
- Topic "expat pension mistakes" → search "UK expat pension mistakes ${year}"
- Topic "World Cup" → search "World Cup ${year} latest"

Use only current, real information found in search results. Never use training data for facts, stats, or events — only verified live search results. If search returns nothing relevant to the topic, set "groundedInSearch": false in your JSON response and fall back to a general, evergreen angle on the topic — but "copy" must still be a complete, publishable LinkedIn post following every format rule below (hook, structure, length, closing question). Never mention the search, never say what you could or couldn't find, never explain or apologise for a lack of results — a reader must never be able to tell a search happened at all.

Never include citation tags, footnotes, source markers, or inline references of any kind (e.g. <cite>, [1], (Source: ...)) in "copy" — write plain, standalone prose exactly as a person would type it, with no citation apparatus. Use search only to ground the facts, not to annotate them.

${schemaLine}

POST FORMAT RULES — follow these exactly:

FINANCE & MARKET POSTS (Pillar 1 and 2):
- Lines 1-3 ONLY visible before "see more" on LinkedIn — these are everything
- Hook must be one of: bold statement, hot take, surprising angle, or provocative question
- Never start with "I" — LinkedIn algorithm deprioritises posts starting with "I"
- Never start with a generic opener ("In today's markets...", "Did you know...")
- Lines 4 onwards: expand with BOTH sides of the argument
  Bull case: [one side]
  Bear case: [other side]
  Never tell people what to think — plant both sides, let them argue
- Final line: open question OR poll suggestion (provide poll options if poll)
- Length: 6-10 lines total
- White space: one idea per line, blank lines between sections
- Tone: sharp, current, confident but not arrogant — sounds like a switched-on
  young finance professional who knows their stuff
- Show you're up to date: reference the specific current event found in search

PILLAR 3 — SPORTS & LIFESTYLE WITH FINANCE TWIST

Only draft a Pillar 3 post if today's search found something genuinely
worth posting about. If nothing stands out, return { skip: true }.

When you do draft a Pillar 3 post:
- Lead with the sports/lifestyle hook — that's what earns the click
- Find a natural finance, retirement, or lifestyle planning angle
  that emerges from the topic — never force it
- The finance twist should feel like a genuine observation,
  not a pivot

Good examples of natural twists:
- Padel cost in UK vs Spain → cost of living → where you want to retire
- Big transfer fee → present value of money → compounding
- F1 team valuation surge → alternative assets → what drives value
- World Cup host spending → government debt → expat financial planning
- A player retiring young → pension planning → what income do you need?

If the finance angle doesn't emerge naturally from the topic — don't
post it. A pure sports post with no relevant angle adds no value to
the target audience (people in Switzerland with assets abroad).

Always end with a question that connects sport to the financial theme.

Length: 3-5 lines max, same hook discipline as Pillar 1/2 posts.

UNIVERSAL RULES:
- Never sound AI-generated
- Never use: "In today's fast-paced world", "It's no secret that", "Game changer",
  "Dive into", "Landscape", "Leverage", "Unlock", "Delve"
- Emojis: 1-2 max, only where they add energy not decoration
- No bullet points in the post itself
- No hashtags unless 1-2 highly relevant ones at the very end
- Always end with a question or poll — comments beat likes for reach
- No price targets, no predictions stated as fact
- No financial advice, no recommendations — observations and questions only`
}

// Claude sometimes prefaces its final answer with a sentence of reasoning
// ("the search shows... I'll use an evergreen angle") before the JSON — strip
// that rather than requiring the JSON to be the very first thing in the text.
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenced?.[1]) return fenced[1].trim()
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) return raw.slice(first, last + 1)
  return raw.trim()
}

export function formatSlackMessage(
  slot: 'morning' | 'evening',
  topic: string,
  format: string,
  postTime: string,
  copy: string,
): string {
  const slotLabel = slot === 'morning' ? 'Morning' : 'Evening'
  return [
    `📝 *IRIS — ${slotLabel} Draft*`,
    `*Topic:* ${topic}`,
    `*Format:* ${format}`,
    `*Post time:* ${postTime}`,
    '',
    copy,
    '',
    '_Reply to refine, or say "done" when ready._',
  ].join('\n')
}

export async function generateDraft(
  slot: 'morning' | 'evening',
  pillar: 1 | 2 | 3,
  topic: string,
  cassandraContext: string | null,
  voicePrefs: VoicePref[],
): Promise<IrisDraft | IrisSkip> {
  const prefsBlock = voicePrefs.length > 0
    ? '\n\nVoice preferences learned from previous edits:\n' +
      voicePrefs.map(p => `- ${p.preference_type}: ${p.value}`).join('\n')
    : ''

  const pillarGuide: Record<number, string> = {
    1: 'MARKETS post — FINANCE & MARKET format rules apply.',
    2: 'EXPAT FINANCE post — FINANCE & MARKET format rules apply. Archie moved to Malta; personal expat angle where relevant.',
    3: 'SPORTS & LIFESTYLE post — PILLAR 3 format rules apply. Archie follows golf, football (PL/World Cup), F1. Only draft if a natural finance, retirement, or lifestyle-planning angle emerges from today\'s search — otherwise return skip.',
  }

  const contextBlock = cassandraContext
    ? `\n\nToday's market context (CASSANDRA brief excerpt):\n${cassandraContext.slice(0, 800)}`
    : ''

  const prompt = `Write a LinkedIn post for Archie.\n\nPillar: ${pillar} — ${pillarGuide[pillar]}\nTopic: ${topic}\nSlot: ${slot} (${slot === 'morning' ? '8–9am' : '4–6pm'} CET)${contextBlock}${prefsBlock}\n\nSearch the web for this topic first, per your instructions, then output ONLY valid JSON, no markdown.`

  const { text: raw, search } = await askWithWebSearch(buildIrisSystem(pillar), prompt, 1536, HAIKU)
  const cleaned = extractJson(raw)

  let parsed: unknown
  try { parsed = JSON.parse(cleaned) }
  catch { throw new Error(`[IRIS] generateDraft returned unparseable JSON: ${raw.slice(0, 200)}`) }

  const obj = parsed as Record<string, unknown>

  if (obj.skip === true) {
    const reason = typeof obj.reason === 'string' && obj.reason.trim() ? obj.reason.trim() : 'Not relevant to target audience'
    console.log(`[iris] generateDraft(${topic}): skipped — ${reason}`)
    return { skip: true, reason }
  }

  if (typeof obj.copy !== 'string') throw new Error('[IRIS] generateDraft missing copy field')

  const groundedInSearch = typeof obj.groundedInSearch === 'boolean' ? obj.groundedInSearch : search.results.length > 0

  console.log(`[iris] generateDraft(${topic}): search query="${search.query ?? 'none'}" results=${search.results.length} groundedInSearch=${groundedInSearch}`)

  // Pillar 3 doesn't know its story in advance — the topic bank passes a generic
  // search-guidance string, so prefer the specific label Claude found on the day.
  const resolvedTopic = pillar === 3 && typeof obj.topic === 'string' && obj.topic.trim()
    ? obj.topic.trim()
    : topic

  return {
    pillar,
    topic: resolvedTopic,
    copy: (obj.copy as string).trim(),
    imagePrompt: typeof obj.imagePrompt === 'string' ? obj.imagePrompt : `Professional LinkedIn image for: ${topic}`,
    format: typeof obj.format === 'string' ? obj.format : 'text with image',
    postTime: typeof obj.postTime === 'string' ? obj.postTime : slot === 'morning' ? '8:00–9:00am CET' : '4:00–6:00pm CET',
    groundedInSearch,
    search,
  }
}

export async function generateImage(prompt: string): Promise<string> {
  try {
    const client = getOpenAIClient()
    const response = await client.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'medium',
    })
    const item = (response.data ?? [])[0]
    if (!item) throw new Error('No image item returned')
    if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
    if (item.url) {
      const res = await fetch(item.url)
      const buf = Buffer.from(await res.arrayBuffer())
      return `data:image/png;base64,${buf.toString('base64')}`
    }
    throw new Error('No image data in response')
  } catch (err) {
    console.error('[IRIS] generateImage failed, using SVG fallback:', err)
    return buildSvgFallback(prompt)
  }
}

export async function extractVoicePreferences(
  refinementExchange: string,
): Promise<Array<{ type: string; value: string }>> {
  const system = `Extract concrete stylistic preferences from LinkedIn post feedback.
Output ONLY a valid JSON array: [{"type":"...","value":"..."}]
Capture tone, structure, length, emoji use, vocabulary shifts.
Return [] if no clear preference is present. Never invent preferences.
Examples: {"type":"tone","value":"more casual, less formal"}, {"type":"length","value":"shorter paragraphs"}`

  try {
    const raw = await askWith(system, `Feedback:\n${refinementExchange}`, 512, HAIKU)
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed: unknown = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []
    return (parsed as unknown[]).filter(
      (item): item is { type: string; value: string } =>
        typeof item === 'object' && item !== null &&
        typeof (item as Record<string, unknown>).type === 'string' &&
        typeof (item as Record<string, unknown>).value === 'string',
    )
  } catch {
    return []
  }
}
