// HERA — Claude-facing functions: reflection acknowledgement, weekly coaching, distress detection.
//
// detectDistress: deterministic keyword check — runs always, no API dependency.
//   Tuned to over-flag (false positives are harmless; false negatives are the failure).
//   Low threshold: when in doubt, flag it.
//
// acknowledgeReflection / coachWeekly: STUBBED until Step 4 go-ahead.
//   Both throw so no accidental Claude spend.

import type { Reflection } from '../../tools/hera-db'

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

// Secondary signals — strong distress that may not be crisis but warrants the supportive path.
// Low threshold: better to check in than to miss it.
const DISTRESS_SECONDARY = [
  /\b(overwhelmed|exhausted|burned?\s*out|breaking point)\b/i,
  /\b(really\s+struggling|so\s+low|incredibly\s+low|very\s+low)\b/i,
  /\b(can'?t\s+keep\s+(going|up)|hitting\s+a\s+wall)\b/i,
  /\b(nothing\s+(is|feels)\s+working|nothing\s+helps)\b/i,
  /\b(hate\s+(this|my\s+life|everything))\b/i,
  /\b(feel\s+(alone|isolated|abandoned|numb|empty))\b/i,
  /\b(not\s+ok(?:ay)?|really\s+not\s+ok(?:ay)?)\b/i,
  /\b(dreading|dread\s+(going|tomorrow|everything))\b/i,
  /\b(crying\s+(all|every)\s+(day|night))\b/i,
  /\bcan'?t\s+(sleep|eat|function|concentrate)\b/i,
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

// ─── Acknowledgement stub (replaced at Step 4) ────────────────────────────────

export async function acknowledgeReflection(_text: string): Promise<string> {
  throw new Error('[hera] acknowledgeReflection not yet enabled — awaiting go-ahead')
}

// ─── Weekly coaching stub (replaced at Step 4) ────────────────────────────────

export async function coachWeekly(
  _reflections: Reflection[],
  _focusAreas: string[],
): Promise<string> {
  throw new Error('[hera] coachWeekly not yet enabled — awaiting go-ahead')
}
