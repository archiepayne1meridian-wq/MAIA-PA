// MERCURY draft generation — email/sequence copy is the kind of writing
// where tone and naturalness matter most, so every Claude call here
// (drafts and the two chat tabs alike) runs on Opus, not Haiku/Sonnet.

import { askWith, askChat } from './claude'
import { getVoicePreferences } from '../../tools/iris'

export type MercuryMedium = 'email' | 'whatsapp' | 'imessage'

export interface MercuryDraftResult {
  subject: string | null  // email only
  body: string
}

const OPUS = 'claude-opus-5-5'

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
  templateAddition?: string,
): Promise<MercuryDraftResult> {
  const prefs = await getVoicePreferences()

  const prefLines = prefs.length > 0
    ? '\nVoice preferences from past refinements (apply these):\n' +
      prefs.map(p => `- ${p.preference_type}: ${p.value}`).join('\n')
    : ''

  const templateLines = templateAddition ? `\n${templateAddition}` : ''

  const system = `You are MERCURY, a professional message drafting assistant for Archie Payne — a trainee financial adviser at deVere Group, relocating to Malta, serving expat clients across Europe.

Your job is to draft professional messages in Archie's voice. You never invent facts, figures, names, dates, or commitments not provided. You never give financial advice or make recommendations.

Medium guidelines for ${medium}:
${MEDIUM_GUIDELINES[medium]}

Voice rules:
- Sounds like Archie — not a template, not a corporate auto-reply
- Warm but professional regardless of medium
- Concise — says what needs to be said, no padding
- Never invents anything not given in the context
- Replies go to: prospects, colleagues, clients, seminar attendees, referrals — all professional${prefLines}${templateLines}`

  const lines: string[] = [`Medium: ${medium}`, `Context: ${context}`]
  if (incoming) lines.push(`Incoming message to reply to:\n${incoming}`)
  if (feedback) lines.push(`Previous draft feedback to apply: ${feedback}`)
  lines.push(`\nDraft a ${medium} based on this.${medium === 'email' ? ' Start your response with "Subject: [subject line]" on the first line, then the full draft body.' : ''}`)

  const raw = await askWith(system, lines.join('\n'), 4096, OPUS)

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

// ─── Chat tabs (LinkedIn Messages / Quick Replies) ─────────────────────────
// Conversational drafting — history lives client-side in the browser tab, not
// the DB, so these just build a system prompt and hand the full turn list to
// Claude. Kept separate from generateDraft above (single-shot, DB-backed).

export type MercuryChatTab = 'linkedin_messages' | 'quick_replies'
export interface MercuryChatMessage { role: 'user' | 'assistant'; content: string }

async function voicePrefLines(): Promise<string> {
  const prefs = await getVoicePreferences()
  return prefs.length > 0
    ? '\nVoice preferences from past refinements (apply these):\n' +
      prefs.map(p => `- ${p.preference_type}: ${p.value}`).join('\n')
    : ''
}

async function linkedinMessagesSystemPrompt(): Promise<string> {
  const prefLines = await voicePrefLines()
  return `You are MAIA, helping Archie Payne (Wealth Management Associate, deVere Switzerland) draft LinkedIn connection messages and follow-up messages for prospecting.

Context:
- Archie prospects high-net-worth expat professionals in Switzerland
- Messages come from either Archie's account or his colleague Stephen's account
- Cold first connects use Template C (new to Switzerland) or Template D (established international professional)
- Reconnect messages are warmer and acknowledge the existing connection

Rules:
- British English throughout. No exclamation marks except "great to connect!"
- No banned phrases: "touch base", "add value", "financial planning and structuring"
- LinkedIn messages must be short — 3 sentences maximum for a cold connect
- If sending from Stephen's account: sign off "Best regards,\\nStephen"
- If sending from Archie's account: sign off "Kind regards,\\nArchie"
- Never advise, compare products, or recommend — inform and book a call
- Never name clients or employer
- Always output the full message ready to copy — no placeholders${prefLines}

When Archie gives you a prospect's name, role, company, and any notes — draft the message immediately. Ask only if you genuinely can't draft without more information.

Reply with ONLY the message text itself — no preamble ("Here's the message..."), no divider lines, no notes about which template you used or why. If Archie asks a question instead of giving you drafting details, answer it in plain prose instead of outputting a draft.`
}

async function quickRepliesSystemPrompt(): Promise<string> {
  const prefLines = await voicePrefLines()
  return `You are MAIA, helping Archie Payne (Wealth Management Associate, deVere Switzerland) draft quick replies for common prospecting situations.

Situations you handle:
- They've said yes to a call — send available time slots
- They've asked for more information — brief, engaging response
- Meeting reminder — the day before or day of
- Running late to a call
- Unaccepted calendar invite nudge
- Reconnect after a period of silence
- Unreachable by phone — follow up via WhatsApp
- They've declined — graceful exit
- Custom situations Archie describes

Channels: Email, LinkedIn message, WhatsApp

Date and time formatting rules (follow exactly):
- Dates: "Thursday 8th October" (day name + ordinal + month, no year unless needed)
- Times: 24-hour format, e.g. "14:00", "09:30"
- When offering call slots, group by day, list 2-3 options per day
- Close scheduling messages with: "Please let me know which works best for you, or suggest an alternative if none of these suit."

Rules:
- British English throughout
- No exclamation marks (except "great to connect!")
- No banned phrases: "touch base", "add value", "circle back"
- Emails: no sign-off (signature handles it)
- LinkedIn/WhatsApp: "Kind regards,\\nArchie"
- Keep it brief and human — this is reactive correspondence, not a pitch
- Output the full message ready to copy${prefLines}

When Archie describes the situation, draft immediately.

Reply with ONLY the message text itself — no preamble ("Here's the reply..."), no divider lines, no notes about the choices you made. If Archie asks a question instead of describing a situation to reply to, answer it in plain prose instead of outputting a draft.`
}

export async function runMercuryChat(tab: MercuryChatTab, messages: MercuryChatMessage[]): Promise<string> {
  if (tab === 'linkedin_messages') {
    const system = await linkedinMessagesSystemPrompt()
    return askChat(system, messages, 2048, OPUS)
  }
  const system = await quickRepliesSystemPrompt()
  return askChat(system, messages, 2048, OPUS)
}
