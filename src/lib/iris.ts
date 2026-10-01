// IRIS — LinkedIn content generation (internal code name stays IRIS; user-facing label is "LinkedIn").

import * as fs from 'fs'
import * as path from 'path'
import OpenAI from 'openai'
import { askWith } from './claude'
import { getTopVoiceLearnings } from '../../tools/iris'
import { getPreferences, formatPreferencesForPrompt, incrementTimesApplied } from './preferences'

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

const SONNET = 'claude-sonnet-4-6'
const HAIKU = 'claude-haiku-4-5-20251001'

export type PostType = 'personal_story' | 'news_angle' | 'fact_drop' | 'tool_guide' | 'expat_reality' | 'reframe'

export const POST_TYPES: { id: PostType; label: string }[] = [
  { id: 'personal_story', label: 'Story' },
  { id: 'news_angle', label: 'News' },
  { id: 'fact_drop', label: 'Fact' },
  { id: 'tool_guide', label: 'Guide' },
  { id: 'expat_reality', label: 'Reality' },
  { id: 'reframe', label: 'Reframe' },
]

// ─── Voice profile + learning loop ───────────────────────────────────────────

export async function readVoiceProfile(): Promise<string> {
  const filePath = path.join(process.cwd(), 'context', 'iris-voice.md')
  try {
    return await fs.promises.readFile(filePath, 'utf-8')
  } catch (err) {
    console.error('[iris] readVoiceProfile failed:', err)
    return ''
  }
}

// Formats the top-N learnings (by applied_count) as the bullet block the
// system prompt reads directly — also reused by the dashboard's voice-profile
// panel (via the /api/dashboard/iris/voice route), so the two never drift.
export async function getVoiceLearnings(limit = 10): Promise<string> {
  const learnings = await getTopVoiceLearnings(limit)
  if (learnings.length === 0) return 'No learnings yet — this is early days, nothing has been edited yet.'
  return learnings
    .map(l => `- ${l.learning} (applied to ${l.applied_count} post${l.applied_count === 1 ? '' : 's'})`)
    .join('\n')
}

// ─── System prompt ────────────────────────────────────────────────────────────
// The full voice/rules block shared by generateDraft() and refinePost() —
// factored out so a refinement call gets exactly the same rules the original
// draft was written under, just without the topic/angle trailer.

function buildVoiceRulesBlock(voiceLearnings: string): string {
  return `You are writing LinkedIn content for Archie Payne.

WHO ARCHIE IS:
- Business Development Associate at deVere and Partners Switzerland
- Works for Stephen Smith, Senior Wealth Manager
- Books meetings with internationally mobile professionals in Switzerland
- About 1 month into the role — relatively new, still learning
- British, based in Malta, working with Swiss-based prospects
- Likes golf, padel, F1, football (Chelsea)
- Direct, confident, slightly irreverent — not corporate at all
- NOT a qualified financial adviser yet

THE THREE GOALS OF EVERY POST:
1. Build trust in Archie as a person — relatable, real, has opinions
2. Build trust in deVere — expertise, knowledge, cross-border specialists
3. Educate — facts not advice, things people don't know

CRITICAL RULES — NEVER BREAK THESE:
- NEVER give financial advice
- NEVER say "you should", "I recommend", "you need to"
- NEVER invent statistics — always attribute to a real named source
- Always present facts or both sides — never tell people what to do
- Personal stories are encouraged — "I played golf in Portugal for £40..."
- Opinions are fine — "I think most people don't realise..."
- Always end with a question or call to action

THE SIX POST TYPES:

TYPE 1 — PERSONAL STORY WITH FINANCIAL TWIST
A real personal experience that connects naturally to a financial insight.
The financial angle must emerge naturally — never forced.

GOOD: "Played golf in Portugal this weekend. £40 for a stunning course.
Same quality in the UK? £80 minimum. Made me think about retirement
location differently..."

BAD: "Shane Lowry winning the Masters is affecting Irish housing prices."
(Too much of a stretch — if you have to explain the connection, it isn't there)

Sports rule: Only use golf, padel, F1, or football if the financial
connection is immediate and genuine. One in ten posts maximum.
Non-sports personal stories often work better.

TYPE 2 — NEWS ANGLE WITH TWO SIDES
Real news event. What one side thinks. What the other thinks.
End with: "What do you think?"
Never take sides. Always balanced. Always invite discussion.

Example: Andy Burnham makes a speech about wealth redistribution —
"A lot of people think this is long overdue.
A lot of people think it will push wealth out of the UK.
What's your take?"

TYPE 3 — FACT DROP
One surprising statistic from a credible, named source.
Attribute it clearly. Let it land. Ask if it surprises people.

Example: "According to HMRC, there are over £26 billion in unclaimed
pension pots in the UK. Most belong to people who moved jobs or moved
country. Does that surprise you?"

Never invent figures. If you don't have a real statistic use TYPE 1 or TYPE 5.

TYPE 4 — TOOL OR GUIDE OFFER
Offer something free and useful. Comment-to-receive format.
Only use when Archie actually has that guide or tool ready to send.

Example: "If you're a Brit in Switzerland and you're not sure how your
UK National Insurance contributions are tracking —
comment NI below and I'll send you a free tool that shows exactly
where you stand."

TYPE 5 — EXPAT REALITY
Something people don't realise about the financial side of living abroad.
Facts that make people think. Not advice.

Example: "Most British expats don't realise their ISA is frozen the
moment they leave the UK. You can't contribute to it anymore.
It just sits there. Did you know that?"

TYPE 6 — THE REFRAME
Take a common belief or objection and reframe it using a simple analogy.
Make someone realise something without getting technical.
Analogies from real life work best — football, golf, cooking, driving.

The accountant vs adviser reframe (seed example — use this style):
"I hear this all the time — 'my accountant sorts out my tax.'
And they do. They're brilliant at it.
But here's the difference nobody talks about:
Your accountant looks at what happened and minimises the damage.
A financial planner looks at what's coming and builds a structure
so the damage never happens.
One fixes the score at full time.
The other changes the game plan before kick off.
Which would you rather have?"

FORMAT RULES — LINKEDIN:
- Lines 1-3: hook — short, punchy, makes them stop scrolling
- Body: 150-300 words, conversational
- Line breaks generously — no walls of text
- Bullet points sparingly — prefer flowing lines
- End: one question or CTA
- Tone: professional but personal — sounds like a real person talking

VOICE LEARNINGS FROM PREVIOUS POSTS:
${voiceLearnings}`
}

export interface IrisDraft {
  copy: string
  postType: PostType | 'auto'
  topic: string
}

export async function generateDraft(params: {
  topic?: string
  postType?: PostType | 'auto'
  todayAngle?: string | null
}): Promise<IrisDraft> {
  const { topic, postType, todayAngle } = params

  const voiceLearnings = await getVoiceLearnings(10)
  console.log(`[iris] generateDraft: voice learnings block injected (${voiceLearnings.slice(0, 80)}${voiceLearnings.length > 80 ? '…' : ''})`)
  const prefs = (await getPreferences('iris')).filter(p => p.rule_key !== 'morning_generation_time')
  const prefText = formatPreferencesForPrompt(prefs)
  console.log(`[iris] generateDraft: ${prefs.length} confirmed preference(s) injected`)
  if (prefs.length > 0) void incrementTimesApplied(prefs.map(p => p.id)).catch(err => console.error('[iris] incrementTimesApplied failed:', err))

  const systemPrompt = `${prefText ? `${prefText}\n\n` : ''}${buildVoiceRulesBlock(voiceLearnings)}

TODAY'S NEWS ANGLE (if available):
${todayAngle ?? 'No specific news angle today — use evergreen content'}

POST TYPE REQUESTED: ${postType ?? 'auto — choose the most relevant for today'}
ROUGH IDEA OR TOPIC: ${topic ?? 'choose the most relevant topic for today'}

Return the post text only.
No hashtags unless they feel completely natural.
No preamble. No explanation. Just the post.`

  console.log(`[iris] generateDraft: model=${SONNET} postType=${postType ?? 'auto'} topic=${topic ?? '(unset — model will choose)'}`)
  const raw = await askWith(systemPrompt, 'Write the post now.', 1200, SONNET)

  return {
    copy: raw.trim(),
    postType: postType ?? 'auto',
    topic: topic ?? (todayAngle ? "today's news angle" : 'evergreen'),
  }
}

export async function refinePost(params: {
  currentDraft: string
  instruction: string
  voiceLearnings: string
}): Promise<string> {
  const system = buildVoiceRulesBlock(params.voiceLearnings)
  const userMessage = `Here is the current draft: ${params.currentDraft}\n\nInstruction: ${params.instruction}\n\nReturn the full refined post text only — no preamble, no explanation.`
  console.log(`[iris] refinePost: model=${SONNET} instruction="${params.instruction}"`)
  const raw = await askWith(system, userMessage, 1200, SONNET)
  return raw.trim()
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

// ─── Edit analysis — the voice learning loop ─────────────────────────────────
// Called by POST /api/dashboard/iris/edit whenever Archie hand-edits a draft.
// Each learning gets saved to iris_voice_learnings and folded into every
// subsequent system prompt via getVoiceLearnings() above.

export interface EditLearning {
  learning: string
  before: string
  after: string
}

export async function analyseEdit(originalContent: string, editedContent: string): Promise<EditLearning[]> {
  const system = `You are analysing how Archie edits his LinkedIn drafts to learn his real writing voice.
Respond with valid JSON only. No prose, no markdown fences.`

  const prompt = `Compare these two versions of a LinkedIn post:

ORIGINAL:
${originalContent}

EDITED:
${editedContent}

Identify what Archie changed and what each change reveals about his preferred writing style.
Be specific. Examples:
- "Shortened the hook from 3 lines to 1 — prefers more punch"
- "Removed bullet points, made it flow — prefers continuous lines over lists"
- "Changed 'financial planning' to 'sorting your money out' — prefers casual language"
- "Added Chelsea reference — wants more personality and sport"
- "Removed the word 'leverage' — avoids corporate jargon"

Return JSON only:
{
  "learnings": [
    { "learning": string, "before": string, "after": string }
  ]
}
Return { "learnings": [] } if the edit is trivial (typo fixes, punctuation only) with nothing to learn.`

  try {
    const raw = await askWith(system, prompt, 800, SONNET)
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(cleaned) as { learnings?: unknown[] }
    if (!Array.isArray(parsed.learnings)) return []
    return parsed.learnings.filter(
      (item): item is EditLearning =>
        typeof item === 'object' && item !== null &&
        typeof (item as Record<string, unknown>).learning === 'string' &&
        typeof (item as Record<string, unknown>).before === 'string' &&
        typeof (item as Record<string, unknown>).after === 'string',
    )
  } catch (err) {
    console.error('[iris] analyseEdit failed:', err)
    return []
  }
}

// "Use as style reference" — extracts learnings straight from an approved post
// that worked, rather than from an edit diff. No "before" version exists, so
// example_before is left null; example_after is the post itself.
export async function extractStyleReference(copy: string): Promise<Array<{ learning: string; after: string }>> {
  const system = `You are analysing a LinkedIn post Archie has confirmed represents his voice well.
Respond with valid JSON only. No prose, no markdown fences.`

  const prompt = `This post is a good example of Archie's voice — identify 1-3 concrete, reusable
things about its style worth applying to future posts (hook structure, sentence length,
specific phrasing choices, use of sport/humour, question style). Be specific, not generic.

POST:
${copy}

Return JSON only:
{ "learnings": [ { "learning": string } ] }`

  try {
    const raw = await askWith(system, prompt, 500, SONNET)
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(cleaned) as { learnings?: unknown[] }
    if (!Array.isArray(parsed.learnings)) return []
    return parsed.learnings
      .filter((item): item is { learning: string } =>
        typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).learning === 'string')
      .map(item => ({ learning: item.learning, after: copy }))
  } catch (err) {
    console.error('[iris] extractStyleReference failed:', err)
    return []
  }
}

// ─── Chat message classification ─────────────────────────────────────────────
// Cheap Sonnet call classifying free-text chat input into one of the actions
// the LinkedIn chat UI understands. Deliberately not Haiku — this needs to
// reliably tell "a rough idea" apart from "an instruction to refine the
// current draft", which can both be short, casual phrases.

export type ChatAction =
  | { action: 'idea'; topic: string }
  | { action: 'refine'; instruction: string }
  | { action: 'suggest' }
  | { action: 'news_angle' }
  | { action: 'restart' }
  | { action: 'show_history' }

export async function classifyChatMessage(message: string, hasActiveDraft: boolean): Promise<ChatAction> {
  const system = `You classify a message Archie just typed into a LinkedIn content chat assistant.

Return ONLY valid JSON, one of these exact shapes:
{"action":"idea","topic":"<cleaned rough idea or topic text>"}
{"action":"refine","instruction":"<the refinement instruction, cleaned up>"}
{"action":"suggest"}
{"action":"news_angle"}
{"action":"restart"}
{"action":"show_history"}

Rules:
- "suggest" — Archie is asking what he should post about (e.g. "what should I post today?", "any ideas?")
- "news_angle" — Archie wants today's CASSANDRA news angle used (e.g. "use today's news angle", "today's angle")
- "restart" — Archie wants a fresh draft on the same topic (e.g. "start again", "try again", "redo")
- "show_history" — Archie wants to see his post history (e.g. "show me my post history", "show history")
- "refine" — ${hasActiveDraft ? 'there is an active draft on screen, and the message reads as an instruction to change it (e.g. "make the hook punchier", "shorter", "more personal", "change the sport to golf", "add a fact about X", "add a call to action")' : 'never pick this — there is no active draft right now'}
- "idea" — anything else: a rough idea, a topic, a specific angle to write about (e.g. "something about golf in Portugal", "the accountant vs adviser thing")

When in doubt between "refine" and "idea": if there's an active draft and the message is a short imperative tweak rather than a new topic, pick "refine".`

  try {
    const raw = await askWith(system, message, 200, SONNET)
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    switch (parsed.action) {
      case 'idea':
        return { action: 'idea', topic: typeof parsed.topic === 'string' && parsed.topic.trim() ? parsed.topic.trim() : message.trim() }
      case 'refine':
        if (hasActiveDraft) return { action: 'refine', instruction: typeof parsed.instruction === 'string' && parsed.instruction.trim() ? parsed.instruction.trim() : message.trim() }
        return { action: 'idea', topic: message.trim() }
      case 'suggest': return { action: 'suggest' }
      case 'news_angle': return { action: 'news_angle' }
      case 'restart': return { action: 'restart' }
      case 'show_history': return { action: 'show_history' }
      default:
        return { action: 'idea', topic: message.trim() }
    }
  } catch (err) {
    console.error('[iris] classifyChatMessage failed, defaulting to idea:', err)
    return { action: 'idea', topic: message.trim() }
  }
}

// Three evergreen-but-fresh topic suggestions — used by the "what should I
// post today?" chat command. Cheap Haiku call: this is a suggestion list, not
// generated content, so it doesn't need Sonnet's quality.
export async function suggestTopics(recentTopics: string[], todayAngle: string | null): Promise<string[]> {
  const voiceProfile = await readVoiceProfile()
  const system = `You suggest LinkedIn post topics for Archie, a BDA at deVere Switzerland. Return ONLY a JSON array of exactly 3 short topic strings, each a concrete, specific idea (not generic). Avoid anything in the recent-topics list. Base suggestions on his usual topic areas below.

${voiceProfile}`

  const prompt = `Recent topics already posted (avoid repeating): ${recentTopics.length > 0 ? recentTopics.join('; ') : 'none'}
${todayAngle ? `Today's CASSANDRA news angle: ${todayAngle}` : 'No specific news angle today.'}

Return JSON array only: ["...", "...", "..."]`

  try {
    const raw = await askWith(system, prompt, 300, HAIKU)
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(cleaned) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is string => typeof t === 'string').slice(0, 3)
  } catch (err) {
    console.error('[iris] suggestTopics failed:', err)
    return []
  }
}
