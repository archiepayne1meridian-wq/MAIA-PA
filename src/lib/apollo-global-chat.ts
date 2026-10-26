// APOLLO — global chat bar, pinned at the bottom of the Calls page. Not
// scoped to one call — pulls from a digest of recent calls so Archie can
// ask things like "what's worked as a not-interested objection handle?",
// "summarise my last 5 calls", "what's my booking rate this week?". Same
// "digest prepended as the first turn" pattern CASSANDRA's chat uses.

import { askChat } from './claude'
import type { ApolloCall } from '../../tools/apollo'
import type { GlobalChatMessage } from '../../tools/apollo-global-chat'

const OPUS = 'claude-opus-5-5'

function weekStartSecs(): number {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

function parseArr(json: string | null): string[] {
  if (!json) return []
  try { const a = JSON.parse(json) as unknown; return Array.isArray(a) ? a as string[] : [] } catch { return [] }
}

function buildDigest(calls: ApolloCall[]): string {
  const wStart = weekStartSecs()
  const thisWeek = calls.filter(c => c.created_at >= wStart)
  const bookedThisWeek = thisWeek.filter(c => c.outcome === 'booked').length
  const rate = thisWeek.length > 0 ? Math.round((bookedThisWeek / thisWeek.length) * 100) : 0
  const statsLine = `This week so far: ${thisWeek.length} call${thisWeek.length === 1 ? '' : 's'} analysed, ${bookedThisWeek} booked (${rate}% booking rate).`

  const lines = calls.slice(0, 50).map(c => {
    const objections = parseArr(c.objections_raised_json)
    const phrases = parseArr(c.winning_phrases_json)
    const parts = [
      `${c.call_date} | ${c.prospect_name ?? 'Unnamed'} | outcome: ${c.outcome ?? 'unknown'}`,
      c.call_summary ? `summary: ${c.call_summary}` : '',
      objections.length > 0 ? `objections: ${objections.join('; ')}` : '',
      phrases.length > 0 ? `winning phrases: ${phrases.join('; ')}` : '',
      c.coaching_insight ? `coaching: ${c.coaching_insight}` : '',
    ].filter(Boolean)
    return `- ${parts.join(' | ')}`
  }).join('\n')

  return `${statsLine}\n\nRecent calls, most recent first:\n${lines || '(none yet)'}`
}

const SYSTEM = `You are Apollo, Archie's call intelligence agent at deVere and Partners Switzerland.

You have a digest of his recent cold calls below — summaries, outcomes, objections raised, winning phrases, and coaching notes. Answer his questions by analysing patterns across these calls: objection handling that's worked, booking rates, trends in his coaching feedback, summaries of recent activity.

Be specific — reference actual calls/phrases/objections from the digest when relevant. Never invent a statistic or quote that isn't actually in the digest; if the digest doesn't have enough to answer precisely, say so rather than guessing.`

export async function answerGlobalChat(recentCalls: ApolloCall[], history: GlobalChatMessage[], newMessage: string): Promise<string> {
  const digest = buildDigest(recentCalls)
  const messages: GlobalChatMessage[] = [
    { role: 'user', content: `Call history digest:\n${digest}` },
    { role: 'assistant', content: "Got it — I've got your call history in hand. What do you need?" },
    ...history,
    { role: 'user', content: newMessage },
  ]
  return askChat(SYSTEM, messages, 4096, OPUS)
}
