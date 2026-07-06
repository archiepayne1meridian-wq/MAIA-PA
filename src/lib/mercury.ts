// MERCURY draft generation — Claude Haiku call.

import { askWith } from './claude'
import { getVoicePreferences } from '../../tools/iris'

export type MercuryMedium = 'email' | 'whatsapp' | 'imessage'

export interface MercuryDraftResult {
  subject: string | null  // email only
  body: string
}

const HAIKU = 'claude-haiku-4-5-20251001'

const MEDIUM_GUIDELINES = {
  email: `Full professional structure: greeting, body, sign-off. Suggest a subject line as the very first line of your response in the format "Subject: [subject line]". Formal but warm — not stiff or corporate. No filler phrases like "I hope this email finds you well" or "As per my last email". Longer form where appropriate.`,
  whatsapp: `Shorter, more conversational. Still professional — no slang, no casual abbreviations. No subject line. Punchy, direct, easy to read on mobile.`,
  imessage: `Brief and professional. Appropriate for quick confirmations, scheduling, short follow-ups. Never for complex or sensitive topics. No subject line.`,
}

export async function generateDraft(
  medium: MercuryMedium,
  context: string,
  incoming?: string,
  feedback?: string,
): Promise<MercuryDraftResult> {
  const prefs = await getVoicePreferences()

  const prefLines = prefs.length > 0
    ? '\nVoice preferences from past refinements (apply these):\n' +
      prefs.map(p => `- ${p.preference_type}: ${p.value}`).join('\n')
    : ''

  const system = `You are MERCURY, a professional message drafting assistant for Archie Payne — a trainee financial adviser at deVere Group, relocating to Malta, serving expat clients across Europe.

Your job is to draft professional messages in Archie's voice. You never invent facts, figures, names, dates, or commitments not provided. You never give financial advice or make recommendations.

Medium guidelines for ${medium}:
${MEDIUM_GUIDELINES[medium]}

Voice rules:
- Sounds like Archie — not a template, not a corporate auto-reply
- Warm but professional regardless of medium
- Concise — says what needs to be said, no padding
- Never invents anything not given in the context
- Replies go to: prospects, colleagues, clients, seminar attendees, referrals — all professional${prefLines}`

  const lines: string[] = [`Medium: ${medium}`, `Context: ${context}`]
  if (incoming) lines.push(`Incoming message to reply to:\n${incoming}`)
  if (feedback) lines.push(`Previous draft feedback to apply: ${feedback}`)
  lines.push(`\nDraft a ${medium} based on this.${medium === 'email' ? ' Start your response with "Subject: [subject line]" on the first line, then the full draft body.' : ''}`)

  const raw = await askWith(system, lines.join('\n'), 600, HAIKU)

  if (medium === 'email') {
    const firstLine = raw.split('\n')[0] ?? ''
    const subjectMatch = firstLine.match(/^Subject:\s*(.+)$/i)
    if (subjectMatch) {
      const subject = (subjectMatch[1] ?? '').trim()
      const body = raw.slice(firstLine.length).replace(/^\n+/, '')
      return { subject, body }
    }
    // Subject line absent — return full text as body
    return { subject: null, body: raw }
  }

  return { subject: null, body: raw }
}
