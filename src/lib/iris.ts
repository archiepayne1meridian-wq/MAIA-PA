// IRIS draft generation.
// formatSlackMessage is live — used by all cron/handler paths.

import OpenAI from 'openai'
import { askWith } from './claude'
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
  pillar: 1 | 2 | 3
  topic: string
  copy: string
  imagePrompt: string
  format: string
  postTime: string
}

const IRIS_SYSTEM = `You are IRIS, MAIA's LinkedIn content engine for Archie Payne — a 20-something British expat in Malta, training as a financial adviser.

Your job is to write conversation-first LinkedIn posts that build Archie's personal brand. Output ONLY valid JSON matching this schema exactly:
{"copy": "...", "imagePrompt": "...", "format": "text with image|poll|text only", "postTime": "..."}

Voice rules (non-negotiable):
- 3-line hook — first 3 lines earn the "see more" click
- Always end with a question, poll, or call for opinions
- Present both sides on finance topics — never prescriptive
- No price targets, no predictions stated as fact
- Emojis used sparingly — not sterile, not overloaded
- Sharp, curious, 20-something tone — not corporate
- Short paragraphs, punchy sentences, white space
- Sounds like Archie talking, not a press release
- NEVER sounds AI-generated

Content rules:
- Pillar 1 (Markets): what happened → bull/bear interpretations → open question
- Pillar 2 (Expat Finance): personal angle, myth-busting, or community question
- Pillar 3 (Sports & Culture): personality post, no forced finance angle
- No financial advice, no recommendations, no price targets
- Observations and questions only`

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

// HARD STOP — wire after Step 2 approval
export async function generateDraft(
  slot: 'morning' | 'evening',
  pillar: 1 | 2 | 3,
  topic: string,
  cassandraContext: string | null,
  voicePrefs: VoicePref[],
): Promise<IrisDraft> {
  const prefsBlock = voicePrefs.length > 0
    ? '\n\nVoice preferences learned from previous edits:\n' +
      voicePrefs.map(p => `- ${p.preference_type}: ${p.value}`).join('\n')
    : ''

  const pillarGuide: Record<number, string> = {
    1: 'MARKETS post: what happened (1-2 lines) → bull interpretation → bear interpretation → open question. No predictions. No price targets.',
    2: 'EXPAT FINANCE post: personal angle or community question. Archie moved to Malta. Formats: personal story, question to expat community, myth-busting, poll.',
    3: 'SPORTS & CULTURE post: personality content. No forced finance angle. Sharp 20-something voice. Archie follows golf, football (PL/World Cup), F1.',
  }

  const contextBlock = cassandraContext
    ? `\n\nToday's market context (CASSANDRA brief excerpt):\n${cassandraContext.slice(0, 800)}`
    : ''

  const prompt = `Write a LinkedIn post for Archie.\n\nPillar: ${pillar} — ${pillarGuide[pillar]}\nTopic: ${topic}\nSlot: ${slot} (${slot === 'morning' ? '8–9am' : '4–6pm'} CET)${contextBlock}${prefsBlock}\n\nOutput ONLY valid JSON, no markdown.`

  const raw = await askWith(IRIS_SYSTEM, prompt, 1024, HAIKU)
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')

  let parsed: unknown
  try { parsed = JSON.parse(cleaned) }
  catch { throw new Error(`[IRIS] generateDraft returned unparseable JSON: ${raw.slice(0, 200)}`) }

  const obj = parsed as Record<string, unknown>
  if (typeof obj.copy !== 'string') throw new Error('[IRIS] generateDraft missing copy field')

  return {
    pillar,
    topic,
    copy: (obj.copy as string).trim(),
    imagePrompt: typeof obj.imagePrompt === 'string' ? obj.imagePrompt : `Professional LinkedIn image for: ${topic}`,
    format: typeof obj.format === 'string' ? obj.format : 'text with image',
    postTime: typeof obj.postTime === 'string' ? obj.postTime : slot === 'morning' ? '8:00–9:00am CET' : '4:00–6:00pm CET',
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
