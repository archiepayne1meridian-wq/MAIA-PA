// APOLLO — AI speaker labelling. OpenAI's whisper-1 (the transcription model
// this app uses) returns no diarization field at all in any response format
// — there's nothing to request or parse — so real diarization would mean
// switching transcription providers entirely. Until/unless that happens,
// this is the fallback the spec asks for: pass the raw transcript to Claude
// and have it infer who's speaking from context (what's actually being
// said), rather than the old pure-alternation-on-question-mark heuristic.

import { askWith } from './claude'

const OPUS = 'claude-opus-5-5'

const SPEAKER_LABEL_SYSTEM = `This is a sales call transcript between Archie (a wealth management trainee) and a prospect.
Archie is asking questions and pitching. The prospect is answering.
Identify which lines belong to Archie and which to the prospect.
Archie typically asks: how long have you been in Switzerland, where are you from, are you familiar with DeVere, etc.
The prospect answers with personal details, objections, or agreement.

Re-emit the entire transcript broken into natural speaking turns — merge consecutive sentences from the same speaker into one turn, don't force alternation. Label each turn as ARCHIE: or PROSPECT: at the start of its own line, using context to determine speaker, not just alternating.

Return ONLY the labelled transcript, one turn per line — no preamble, no explanation, no markdown.`

export interface LabelledTurn { speaker: 'Archie' | 'Prospect'; text: string }

// Returns null (never throws) on any failure or unparseable output, so the
// caller can fall back to the old alternation heuristic rather than losing
// the transcript entirely.
export async function labelTranscriptSpeakers(rawText: string): Promise<LabelledTurn[] | null> {
  if (!rawText.trim()) return null
  try {
    const raw = await askWith(SPEAKER_LABEL_SYSTEM, rawText, 8192, OPUS)
    const turns: LabelledTurn[] = []
    for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
      const m = line.match(/^(ARCHIE|PROSPECT):\s*(.*)$/i)
      if (!m) continue
      turns.push({ speaker: /^archie$/i.test(m[1]!) ? 'Archie' : 'Prospect', text: m[2]!.trim() })
    }
    return turns.length > 0 ? turns : null
  } catch (err) {
    console.error('[apollo] speaker labelling failed:', err)
    return null
  }
}

export function serialiseLabelledTurns(turns: LabelledTurn[]): string {
  return turns.map(t => `${t.speaker}: ${t.text}`).join('\n')
}
