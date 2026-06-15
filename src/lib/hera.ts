// HERA — Claude-facing functions: reflection acknowledgement, weekly coaching, distress detection.
//
// detectDistress: deterministic keyword check — runs always, no API dependency.
//   Tuned to over-flag (false positives are harmless; false negatives are the failure).
//   Low threshold: when in doubt, flag it.
//
// acknowledgeReflection / coachWeekly: STUBBED until Step 4 go-ahead.
//   Both throw so no accidental Claude spend.

import { askWith } from './claude'
import type { Reflection } from '../../tools/hera-db'

const HAIKU = 'claude-haiku-4-5-20251001'

// ─── Distress detection (deterministic, no API) ───────────────────────────────

// Primary distress signals — unambiguous struggle or crisis language.
const DISTRESS_PRIMARY = [
  /\bcan'?t\s+(cope|go on|do this|handle)\b/i,
  /\bdon'?t\s+want\s+to\s+(be here|go on|wake up)\b/i,
  /\b(hopeless|worthless|trapped|desperate|breaking down|falling apart)\b/i,
  /\bno\s+(point|reason|way\s+out)\b/i,
  /\b(harm|hurt)\s+(myself|me)\b/i,
  /\bthoughts?\s+of\b.*\b(suicide|ending it|not\s+being\s+here)\b/i,
]

// Secondary signals — strong distress warranting the supportive path.
//
// Tuned to avoid false-positives on normal bad days:
//   "I'm exhausted after back-to-back meetings" → NOT flagged
//   "I'm burned out / at breaking point" → flagged
//   "I was overwhelmed by the workload" → NOT flagged
//   "I'm completely overwhelmed, I can't keep going" → flagged
//   "I hated today's session" → NOT flagged
//   "I hate my life / I hate everything" → flagged
//
// The Claude belt-and-braces check catches edge cases keywords miss.
const DISTRESS_SECONDARY = [
  /\b(completely|utterly|absolutely|so)\s+overwhelmed\b/i,
  /\b(burned?\s*out|burnt\s*out)\b/i,
  /\b(breaking\s+point|at\s+my\s+(absolute\s+)?limit)\b/i,
  /\b(really\s+struggling|so\s+low|incredibly\s+low|very\s+low)\b/i,
  /\b(can'?t\s+keep\s+(going|up)|hitting\s+a\s+wall)\b/i,
  /\b(nothing\s+(is|feels)\s+working|nothing\s+helps)\b/i,
  /\b(hate\s+(my\s+life|everything))\b/i,
  /\bfeel\s+(completely\s+)?(alone|isolated|abandoned|numb|empty)\b/i,
  /\b(not\s+ok(?:ay)?|really\s+not\s+ok(?:ay)?)\b/i,
  /\b(dread(ing)?\s+everything|everything\s+feels?\s+(pointless|impossible))\b/i,
  /\b(crying\s+(all|every)\s+(day|night))\b/i,
  /\bcan'?t\s+(sleep|eat|function)\b/i,
]

export interface DistressResult {
  flagged: boolean
  // Internal reason — never surfaced to user. For logging/audit only.
  _reason: string | null
}

export function detectDistress(text: string): DistressResult {
  for (const re of DISTRESS_PRIMARY) {
    const m = re.exec(text)
    if (m) return { flagged: true, _reason: `primary: ${m[0]}` }
  }
  for (const re of DISTRESS_SECONDARY) {
    const m = re.exec(text)
    if (m) return { flagged: true, _reason: `secondary: ${m[0]}` }
  }
  return { flagged: false, _reason: null }
}

// Coarse sentiment tag for internal pattern-spotting.
// Never surfaced to the user as a label about how they feel.
export function coarseSentiment(text: string, distressFlagged: boolean): 'positive' | 'neutral' | 'low' {
  if (distressFlagged) return 'low'

  const lower = text.toLowerCase()
  const positiveWords = ['great', 'good', 'well', 'happy', 'confident', 'proud',
    'excited', 'energised', 'energized', 'solid', 'strong', 'progress', 'improving',
    'nailed', 'won', 'achieved', 'enjoyed', 'love', 'brilliant']
  const lowWords = ['rough', 'hard', 'tired', 'difficult', 'struggle', 'struggling',
    'bad', 'awful', 'terrible', 'drained', 'flat', 'down', 'low', 'stressed',
    'anxious', 'worried', 'behind', 'lost']

  let score = 0
  for (const w of positiveWords) if (lower.includes(w)) score++
  for (const w of lowWords) if (lower.includes(w)) score--

  if (score > 0) return 'positive'
  if (score < 0) return 'low'
  return 'neutral'
}

// Client-name heuristic: proper nouns preceded by "client", "with", "meeting", "call" etc.
// Over-inclusive on purpose — better to surface the reminder than miss a data-handling issue.
export function detectClientMention(text: string): boolean {
  return /\b(client|prospect|meeting with|call with|spoke with|talked to)\s+[A-Z][a-z]+/i.test(text)
}

// ─── Acknowledgement (Haiku) ─────────────────────────────────────────────────
//
// Returns { ack, modelFlaggedDistress }.
// Claude can RAISE a distress flag (belt-and-braces) but cannot SUPPRESS a keyword flag.
// If Claude opens with [DISTRESS] it means it caught something keywords missed.

const ACK_SYSTEM = `You are HERA, a warm and supportive reflection companion for a trainee financial adviser.

When someone shares how their day went, respond with a brief, genuine acknowledgement — one or two sentences. Reflect back what they've shared in a human way. Don't give advice, don't lecture, don't be a cheerleader. If it was a good day, share in it briefly. If it was hard, acknowledge that without minimising or fixing it.

DISTRESS CHECK: Before writing, assess whether the note suggests genuine distress — not just a frustrating or tiring day, but real struggle: feeling hopeless, unable to cope, very low, or in crisis. If you detect genuine distress, write [DISTRESS] on its own line first, then a blank line, then your acknowledgement (which will be replaced by a supportive message — write it anyway for completeness).

Rules:
- 1–2 sentences only. No preamble, no sign-off.
- Warm and human, not clinical or corporate.
- Never diagnose, label, or analyse the user's emotional state.
- Never use advice language: no "you should", "try", "make sure", "consider".
- If the note is very brief or ambiguous, just acknowledge that they checked in.`

export interface AckResult {
  ack: string
  modelFlaggedDistress: boolean
}

export async function acknowledgeReflection(text: string): Promise<AckResult> {
  const raw = await askWith(ACK_SYSTEM, text, 150, HAIKU)
  const trimmed = raw.trim()
  const modelFlaggedDistress = trimmed.startsWith('[DISTRESS]')
  const ack = modelFlaggedDistress
    ? trimmed.replace(/^\[DISTRESS\]\s*\n?/, '').trim()
    : trimmed
  return { ack, modelFlaggedDistress }
}

// ─── Weekly coaching (Haiku) ─────────────────────────────────────────────────

const COACH_SYSTEM = `You are HERA, a warm and constructive weekly coaching companion for a trainee financial adviser. You've been given their reflection notes from the past week.

Write a weekly reflection summary: what's working, where they keep getting stuck (framed as next steps, not criticism), and one question or prompt they could raise with their senior adviser.

Rules:
- Lead with what's going well. Be specific — name the patterns you actually see in the reflections.
- Frame sticking points as "something to work on", not failures.
- If the week is sparse (few or very short entries), say so honestly and gently — do not fabricate patterns from thin data.
- End with ONE question or prompt for the senior adviser — grounded in what the reflections actually show. If the week doesn't clearly suggest a specific topic, a simple open question is fine (e.g. "Is there anything from this week you'd want to mention to your mentor?"). Do not manufacture a concern the reflections don't support.
- 3–5 short paragraphs. Warm, specific, and constructive. No bullet lists.
- Never diagnose, psychoanalyse, or label the user's mental state.
- Never use advice language: no "you should", "you must", "make sure".
- Internal sentiment tags are data only — never reference them or imply you're tracking how "low" someone felt.`

export async function coachWeekly(
  entries: Reflection[],
  focusAreas: string[],
): Promise<string> {
  const oldest = entries[entries.length - 1]
  const newest = entries[0]
  const periodStart = oldest ? new Date(oldest.created_at * 1000).toDateString() : 'unknown'
  const periodEnd = newest ? new Date(newest.created_at * 1000).toDateString() : 'unknown'
  const focusLine = focusAreas.length > 0
    ? `Focus areas: ${focusAreas.join(', ')}`
    : 'Focus areas: none set'

  const numbered = [...entries]
    .reverse()
    .map((r, i) => `${i + 1}. ${r.body}`)
    .join('\n')

  const userText = `Week: ${periodStart} to ${periodEnd}
Reflections: ${entries.length} entries
${focusLine}

${numbered}`

  return askWith(COACH_SYSTEM, userText, 600, HAIKU)
}
