// MEETINGS — Claude calls only. Structures a transcribed post-meeting debrief
// voice note into CRM-ready notes, then holds that structured state across a
// chat-based refinement loop (each message edits the current state in place,
// rather than generating fresh output).
//
// Deliberately stateless server-side — no new DB table for an in-progress
// session (see schema.ts comment on the MEETINGS feature). The client holds
// the current MeetingNotes object and the chat history, and resends both on
// every tweak; only "Save to CRM" and "Book follow-up call" write anything
// to the database.

import { askWith, askChat } from './claude'
import { extractJson } from './format'

const SONNET = 'claude-sonnet-4-6'

export interface MeetingNotes {
  prospectName: string | null
  prospectSnapshot: string
  meetingNotes: string
  actionsMine: string[]
  actionsSteve: string[]
  employerMentioned: string | null
  followUpDate: string | null
  followUpType: string | null
}

const JSON_SHAPE = `{
  "prospectName": "Full Name as stated, or null if not clear",
  "prospectSnapshot": "...",
  "meetingNotes": "...",
  "actionsMine": ["...", "..."],
  "actionsSteve": ["...", "..."],
  "employerMentioned": "Company Name, or null if not mentioned",
  "followUpDate": "YYYY-MM-DD, or null if no specific date/time was mentioned or it can't be resolved to a calendar date",
  "followUpType": "e.g. Zoom call / fact find meeting / next call, or null"
}`

const STRUCTURE_SYSTEM = `You are processing a post-meeting debrief voice note from a wealth management trainee at DeVere Group Geneva.

CRITICAL: Use Steve's exact words and terminology throughout. Do not paraphrase, correct or interpret specialist terms. If he says "CLD permit", write "CLD permit". If you don't recognise a term, leave it exactly as spoken and add [?] after it so Archie can check with Steve later. Never substitute your own wording for his.

Structure the output as follows — write in third person about the prospect:

PROSPECT SNAPSHOT
One paragraph. Personal details mentioned: full name, nationality, family situation (spouse, children, whether family is in Switzerland), how long in Switzerland, permit type, employer, role/seniority, anything personal that is useful context for a future meeting. Include everything Steve mentions — even small details matter for rapport later.

MEETING NOTES
What was discussed. Their financial situation, goals, concerns, what they seemed interested in, how the conversation went. Keep it factual — write it the way good CRM notes read: useful to someone who wasn't there. 2-4 short paragraphs. Mention everything Steve mentions, even if brief.

ACTIONS — MINE
Checkbox list of things Archie needs to do. Watch for: booking a Zoom or meeting room, sending a blank fact find, sending documents, following up by a specific date, scheduling a next call. If a date/time is mentioned, include it explicitly.

ACTIONS — STEVE'S
Checkbox list of tasks Steve mentioned that are his to handle.

If the prospect's employer is mentioned, note it clearly — it will be used to update the company map.
If a specific follow-up date or time is mentioned anywhere, extract it as a resolved calendar date — resolve relative references ("next Tuesday", "in two weeks") against today's date, given below. If you can't confidently resolve a specific date, return null rather than guessing.

Also extract the prospect's full name, plainly, for CRM matching.

Return ONLY valid JSON in exactly this shape — no markdown fences, no prose:
${JSON_SHAPE}`

function parseNotes(raw: string): MeetingNotes {
  const parsed = JSON.parse(extractJson(raw)) as Partial<MeetingNotes>
  return {
    prospectName: parsed.prospectName ?? null,
    prospectSnapshot: parsed.prospectSnapshot ?? '',
    meetingNotes: parsed.meetingNotes ?? '',
    actionsMine: Array.isArray(parsed.actionsMine) ? parsed.actionsMine : [],
    actionsSteve: Array.isArray(parsed.actionsSteve) ? parsed.actionsSteve : [],
    employerMentioned: parsed.employerMentioned ?? null,
    followUpDate: parsed.followUpDate ?? null,
    followUpType: parsed.followUpType ?? null,
  }
}

export async function structureMeetingNotes(transcript: string): Promise<MeetingNotes> {
  const today = new Date().toISOString().slice(0, 10)
  const userText = `Today's date: ${today}\n\nVoice note transcript:\n${transcript}`
  const raw = await askWith(STRUCTURE_SYSTEM, userText, 2048, SONNET)
  return parseNotes(raw)
}

const REFINE_SYSTEM = `You are editing a structured post-meeting debrief for a wealth management CRM, held as JSON in the exact shape below. Archie will give you a short instruction to tweak something — apply ONLY that change, and otherwise return every other field completely unchanged from the current state.

Preserve Steve's exact terminology and any [?] flags on unrecognised terms, unless Archie's instruction explicitly resolves one.

Reply with ONLY valid JSON in exactly this shape — no markdown fences, no prose:
{
  "reply": "a short confirmation of what you changed, one sentence",
  "notes": ${JSON_SHAPE.split('\n').map(l => `  ${l}`).join('\n').trim()}
}`

export interface RefineTurn { role: 'user' | 'assistant'; content: string }

// `history` is this session's own prior chat turns (loaded server-side from
// meeting_debrief_messages, scoped by session_id) — never another agent's
// conversation. `transcript` grounds a tweak in details Claude may not have
// carried into the structured notes the first time (e.g. "add that he
// mentioned his wife is still in London" when that line is in the original
// voice note but wasn't pulled into any section yet).
export async function refineMeetingNotes(
  transcript: string,
  currentNotes: MeetingNotes,
  history: RefineTurn[],
  instruction: string,
): Promise<{ reply: string; notes: MeetingNotes }> {
  const messages: RefineTurn[] = [
    { role: 'user', content: `Original voice note transcript:\n${transcript}\n\nCurrent notes:\n${JSON.stringify(currentNotes)}` },
    { role: 'assistant', content: JSON.stringify(currentNotes) },
    ...history,
    { role: 'user', content: instruction },
  ]
  const raw = await askChat(REFINE_SYSTEM, messages, 2048, SONNET)
  const parsed = JSON.parse(extractJson(raw)) as { reply?: string; notes?: Partial<MeetingNotes> }
  return {
    reply: parsed.reply ?? 'Updated.',
    notes: parsed.notes ? parseNotes(JSON.stringify(parsed.notes)) : currentNotes,
  }
}

// Formatted for appending into nexus_prospects.notes — a dated block so
// repeated meetings/saves accumulate rather than overwrite.
export function formatNotesForCrm(notes: MeetingNotes): string {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const lines: string[] = [`--- Meeting debrief, ${today} ---`, '', 'PROSPECT SNAPSHOT', notes.prospectSnapshot, '', 'MEETING NOTES', notes.meetingNotes]
  if (notes.actionsMine.length > 0) lines.push('', 'ACTIONS — MINE', ...notes.actionsMine.map(a => `[ ] ${a}`))
  if (notes.actionsSteve.length > 0) lines.push('', "ACTIONS — STEVE'S", ...notes.actionsSteve.map(a => `[ ] ${a}`))
  return lines.join('\n')
}
