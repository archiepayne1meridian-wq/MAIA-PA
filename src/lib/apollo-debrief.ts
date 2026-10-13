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

function buildDebriefSystemPrompt(call: ApolloCall, profile: CoachingProfile): string {
  const objections = call.objections_raised_json ? (JSON.parse(call.objections_raised_json) as string[]) : []
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
