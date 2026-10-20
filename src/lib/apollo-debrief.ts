// APOLLO debrief chat — Claude calls only. Pure DB access lives in
// tools/apollo-debrief.ts and tools/apollo.ts.

import { askChat, askWith } from './claude'
import { extractJson } from './format'
import type { ApolloCall } from '../../tools/apollo'
import { EMPTY_COACHING_PROFILE, type CoachingProfile, type DebriefMessage } from '../../tools/apollo-debrief'

const SONNET = 'claude-sonnet-4-6'
const HAIKU = 'claude-haiku-4-5-20251001'

function formatCoachingProfile(profile: CoachingProfile): string {
  if (profile.call_count === 0) return 'No patterns yet — this is the first debrief.'
  const lines: string[] = [`Debriefed ${profile.call_count} call${profile.call_count === 1 ? '' : 's'} so far (last updated ${profile.last_updated}).`]
  if (profile.common_objections.length > 0) {
    lines.push('Common objections:')
    for (const o of profile.common_objections) {
      lines.push(`- "${o.objection}" (raised ${o.count}x) — works: ${o.what_works || 'nothing identified yet'}; doesn't: ${o.what_doesnt || 'nothing identified yet'}`)
    }
  }
  if (profile.opener_notes) lines.push(`Opener pattern: ${profile.opener_notes}`)
  if (profile.what_lands.length > 0) lines.push(`What lands: ${profile.what_lands.join('; ')}`)
  if (profile.what_kills_calls.length > 0) lines.push(`What kills calls: ${profile.what_kills_calls.join('; ')}`)
  return lines.join('\n')
}

// Booked debriefs weave in four questions feeding the Map (territory
// intelligence) and the referral reminder — lead source, prospect
// nationality, which Geneva office they're in (HQ or satellite), and the
// meeting date. Only asked while at least one of the four target fields
// (company_name/prospect_nationality/lead_source/meeting_date) is still
// unfilled — once Archie's answered, stop asking so re-opening an
// already-debriefed booked call doesn't repeat itself.
const MAP_FIELDS_PROMPT = `
Once you've covered the standard coaching feedback, weave these into the conversation naturally — not as a numbered list, one at a time as it fits:
1. Where did he source this contact? Sales Nav, LinkedIn search, webinar, referral, or something else?
2. What's the prospect's nationality — and was that relevant on the call?
3. Which company do they work for — and is that their main Geneva office or a satellite of somewhere else (where's the global HQ, any other Swiss offices)?
4. What date is the meeting booked for?`

export function needsMapFields(call: ApolloCall): boolean {
  return !call.company_name || !call.prospect_nationality || !call.lead_source || !call.meeting_date
}

function buildDebriefSystemPrompt(call: ApolloCall, profile: CoachingProfile): string {
  const objections = call.objections_raised_json ? (JSON.parse(call.objections_raised_json) as string[]) : []

  if (call.outcome === 'booked') {
    return `You are Apollo, Archie's call intelligence agent. Archie is a trainee wealth manager at DeVere Group making cold prospecting calls to English-speaking expatriates.

This call resulted in a booked meeting. Your job here is a short, genuine debrief — what worked, so Archie can repeat it — not a coaching intervention.

HOW TO DEBRIEF:
- Open by congratulating him briefly, then ask what he thinks landed well
- Reinforce what actually worked — be specific, reference moments from the transcript
- Keep it light — this isn't a problem to fix${needsMapFields(call) ? MAP_FIELDS_PROMPT : ''}

COACHING PROFILE:
${formatCoachingProfile(profile)}

CALL TRANSCRIPT:
${call.transcript ?? '(no transcript available)'}

CALL SUMMARY: ${call.call_summary ?? 'none'}`
  }

  const intelligence = [
    `Stage reached: ${call.stage_reached ?? 'unknown'}`,
    `Objections raised: ${objections.length > 0 ? objections.join('; ') : 'none recorded'}`,
    `Tone: ${call.tone_notes ?? 'not recorded'}`,
    `What resonated: ${call.what_resonated ?? 'nothing recorded'}`,
    `Call summary: ${call.call_summary ?? 'none'}`,
  ].join('\n')

  return `You are Apollo, Archie's call intelligence agent. Archie is a trainee wealth manager at DeVere Group making cold prospecting calls to English-speaking expatriates.

You have just analysed a call that did not result in a booking. Your job is to help Archie understand what went wrong and get better over time.

You have access to:
- The full call transcript
- The structured intelligence extracted from the call (objections raised, tone, what resonated, what didn't)
- Archie's coaching profile — patterns you've identified across previous calls

HOW TO DEBRIEF:
- Lead with what you spotted from the transcript — be specific, reference actual moments
- Be honest, not just reassuring. If the opener was weak, say so. If he talked too much, say so.
- When Archie tells you what he thinks went wrong, engage with it — agree, push back, or add to it
- Give specific alternative scripts or approaches he could have used at the moments that went wrong
- Ask one question at a time to deepen the analysis

COACHING PROFILE:
${formatCoachingProfile(profile)}

Use the coaching profile to identify recurring patterns. If the same objection keeps coming up, flag it. If something is consistently working, reinforce it.

CALL TRANSCRIPT:
${call.transcript ?? '(no transcript available)'}

CALL INTELLIGENCE:
${intelligence}`
}

export async function chatWithApolloDebrief(
  call: ApolloCall,
  profile: CoachingProfile,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
  const system = buildDebriefSystemPrompt(call, profile)
  return askChat(system, history, 1024, SONNET)
}

const PROFILE_UPDATE_SYSTEM = `You maintain a coaching profile tracking patterns across a trainee wealth manager's cold prospecting calls. Update it based on one debrief conversation.

Return ONLY the updated profile as JSON, in exactly this shape — no markdown fences, no prose:
{
  "common_objections": [{ "objection": "...", "count": 0, "what_works": "...", "what_doesnt": "..." }],
  "opener_notes": "...",
  "what_lands": ["..."],
  "what_kills_calls": ["..."],
  "call_count": 0,
  "last_updated": "YYYY-MM-DD"
}

Rules:
- Merge, don't duplicate — if an objection already exists (even phrased slightly differently), increment its count and refine what_works/what_doesnt rather than adding a near-duplicate entry
- Keep opener_notes, what_lands, what_kills_calls concise and specific — real patterns, not generic advice
- Increment call_count by exactly 1 from the profile given
- Set last_updated to today's date`

const EXTRACT_MAP_FIELDS_SYSTEM = `You extract five pieces of information from a debrief conversation about a wealth management cold call that resulted in a booked meeting.

Return ONLY JSON, in exactly this shape — no markdown fences, no prose:
{
  "company_name": "the company name as a plain string, or null if not mentioned",
  "prospect_nationality": "a single nationality adjective (e.g. 'British', 'Australian'), or null if not mentioned",
  "lead_source": "one of: Sales Navigator | LinkedIn | Webinar | Referral | Cold Call | Other — or null if not mentioned",
  "rapport_notes": "a short free-text note on what helped on the call, or null if nothing clear was said",
  "meeting_date": "the booked meeting's date as YYYY-MM-DD, or null if not mentioned or not resolvable to a specific date"
}

Only extract what's actually stated in the conversation — never guess or invent a value. null is correct and expected when something hasn't come up yet. For meeting_date, resolve relative references ("next Tuesday", "the 14th") against today's date if given in the conversation context; if you can't confidently resolve a specific calendar date, return null rather than guessing.`

export interface ExtractedBookingFields {
  company_name: string | null
  prospect_nationality: string | null
  lead_source: string | null
  rapport_notes: string | null
  meeting_date: string | null
}

// Fire-and-forget after each exchange in a booked debrief, same pattern as
// updateCoachingProfile — only called while needsMapFields(call) is true,
// so this stops running once all three structured fields are captured.
export async function extractBookingFields(
  debriefTranscript: DebriefMessage[],
): Promise<ExtractedBookingFields> {
  const today = new Date().toISOString().slice(0, 10)
  const transcriptText = `Today's date: ${today}\n\n` + debriefTranscript.map(m => `${m.role === 'user' ? 'Archie' : 'Apollo'}: ${m.content}`).join('\n')
  const empty: ExtractedBookingFields = { company_name: null, prospect_nationality: null, lead_source: null, rapport_notes: null, meeting_date: null }
  if (!debriefTranscript.length) return empty

  try {
    const raw = await askWith(EXTRACT_MAP_FIELDS_SYSTEM, transcriptText, 300, HAIKU)
    const parsed = JSON.parse(extractJson(raw)) as Partial<ExtractedBookingFields>
    return { ...empty, ...parsed }
  } catch (err) {
    console.error('[apollo-debrief] extractBookingFields failed:', err)
    return empty
  }
}

export async function updateCoachingProfile(
  currentProfile: CoachingProfile,
  debriefTranscript: DebriefMessage[],
  callSummary: string | null,
): Promise<CoachingProfile> {
  const today = new Date().toISOString().slice(0, 10)
  const transcriptText = debriefTranscript.map(m => `${m.role === 'user' ? 'Archie' : 'Apollo'}: ${m.content}`).join('\n')

  const prompt = `CURRENT PROFILE:
${JSON.stringify(currentProfile)}

CALL SUMMARY: ${callSummary ?? 'none'}

DEBRIEF CONVERSATION:
${transcriptText || '(no debrief conversation yet — nothing to add beyond incrementing call_count)'}

Today's date: ${today}`

  try {
    const raw = await askWith(PROFILE_UPDATE_SYSTEM, prompt, 1000, HAIKU)
    const parsed = JSON.parse(extractJson(raw)) as Partial<CoachingProfile>
    return { ...EMPTY_COACHING_PROFILE, ...currentProfile, ...parsed }
  } catch (err) {
    console.error('[apollo-debrief] updateCoachingProfile failed, keeping existing profile:', err)
    return currentProfile
  }
}
