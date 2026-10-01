// MAIA hub — morning brief card + chat message handling for the 'hub' conversation
// in the new three-column dashboard. Goal commands are handled deterministically
// (regex, not a Claude call) since their shape is fixed and reliability matters
// more than flexibility here; anything else falls back to a general Sonnet reply.

import { askWith } from './claude'
import { gatherMaiaContext } from './maia-context'
import { addGoal, findGoalByText, updateGoal } from '../../tools/goals'
import type { ConversationMessage } from '../../tools/maia-conversations'

export async function buildMorningBriefMessage(): Promise<ConversationMessage> {
  const context = await gatherMaiaContext()
  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return {
    id: crypto.randomUUID(),
    role: 'maia',
    type: 'morning_brief',
    content: context.todayAngle ?? "No specific angle today — check News for the latest brief.",
    metadata: {
      dateLabel,
      todayAngle: context.todayAngle,
      thisWeekMeetings: context.thisWeekMeetings,
    },
    timestamp: Math.floor(Date.now() / 1000),
  }
}

const ADD_GOAL_RE = /^add (?:to )?(short|long)[\s-]?term goals?[:\s]+(.+)/i
const COMPLETE_GOAL_RE = /^mark goal(?: as)? complete[:\s]+(.+)/i
const UPDATE_GOALS_RE = /^update (?:my )?goals?\.?\s*$/i

export async function handleHubMessage(message: string): Promise<{ replyText: string }> {
  const trimmed = message.trim()

  const addMatch = ADD_GOAL_RE.exec(trimmed)
  if (addMatch) {
    const goalType = addMatch[1]!.toLowerCase() === 'short' ? 'short_term' : 'long_term'
    const text = addMatch[2]!.trim()
    if (!text) return { replyText: "Didn't catch the goal text — try again, e.g. \"add to short term goals: make 50 calls today\"." }
    await addGoal(text, goalType)
    return { replyText: `Added to ${goalType === 'short_term' ? 'short' : 'long'} term goals: "${text}"` }
  }

  const completeMatch = COMPLETE_GOAL_RE.exec(trimmed)
  if (completeMatch) {
    const text = completeMatch[1]!.trim()
    const goal = await findGoalByText(text)
    if (!goal) return { replyText: `Couldn't find a goal matching "${text}" — check the Goals panel for the exact wording.` }
    await updateGoal(goal.id, { completed: 1 })
    return { replyText: `Marked complete: "${goal.goal_text}"` }
  }

  if (UPDATE_GOALS_RE.test(trimmed)) {
    return { replyText: 'Sure — what would you like to change? You can say "add to short term goals: ..." or "mark goal complete: ...".' }
  }

  // General conversational fallback — context-aware, no action routing (the
  // per-agent conversation logic this hub will eventually dispatch to is
  // wired up agent-by-agent in a later phase).
  const context = await gatherMaiaContext()
  const system = `You are MAIA, Archie's command-centre assistant at deVere and Partners Switzerland. He's a BDA making cold calls to British expats and internationally mobile professionals in Switzerland, booking meetings for his adviser Steven Smith.

CURRENT CONTEXT:
${JSON.stringify(context, null, 2)}

Reply briefly and directly — max 2-3 sentences, British English, no filler like "Great question!". Use CURRENT CONTEXT where relevant. If he's asking you to do something only a specific agent (News, Calls, LinkedIn, Practice, Study, etc.) can actually do, say so plainly rather than pretending to do it — those agents' conversation logic isn't wired into this chat yet.`

  const reply = await askWith(system, trimmed, 300)
  return { replyText: reply.trim() }
}
