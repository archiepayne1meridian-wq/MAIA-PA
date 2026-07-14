// MAIA intelligence layer — Haiku routing, spoken summaries, task extraction.
// Plain spoken English responses only. No markdown. Max 3 sentences per call.

import { askWith } from './claude'
import type { DashboardData } from '../app/dashboard/data'
import { listHoldings } from '../../tools/demeter-db'
import { getProgress, getWeaknessReport } from '../../tools/study-db'
import { getCurrentWeekLogs } from '../../tools/victoria-db'
import { weeklyTotals } from '../../tools/kpi'
import { getRecentPosts, getSuggestedTopic } from '../../tools/iris'
import { getThisWeekIntentions, getActiveTasks } from '../../tools/maia-voice'
import { getDb } from '@/db'
import { research_briefs, diana_sessions, portfolio_snapshots } from '@/db/schema'
import { desc, gte } from 'drizzle-orm'

const HAIKU = 'claude-haiku-4-5-20251001'

const AVA_BASE = `You are Ava, MAIA's voice assistant for Archie Payne — a trainee financial adviser at deVere Group, Malta. You are sharp, witty, and professional. Maximum 3 sentences when speaking. Hit the headline, skip the waffle. Slightly dry humour is fine. Never sound like a corporate bot. Always end with "What do you need?" or a variation.`

export interface AgentAction {
  type: 'navigate' | 'add_task' | 'complete_task' | 'file_to_muse' | 'suggest_iris'
  payload?: Record<string, unknown>
}

export interface RouteResult {
  agent: string
  spokenResponse: string
  action?: AgentAction
}

// ── Greeting ──────────────────────────────────────────────────────────────────

export async function buildGreeting(data: DashboardData): Promise<string> {
  const [intentions, tasks] = await Promise.all([
    getThisWeekIntentions(),
    getActiveTasks(),
  ])

  const focusAreas = intentions
    ? (JSON.parse(intentions.focus_areas) as string[]).join(', ')
    : null

  const demeterAgent = data.agents.find(a => a.id === 'DEMETER')
  const athenaAgent  = data.agents.find(a => a.id === 'ATHENA')
  const irisAgent    = data.agents.find(a => a.id === 'IRIS')

  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'

  const lines: string[] = [
    `Time of day: ${timeOfDay}`,
    demeterAgent?.stat ? `Portfolio: ${demeterAgent.stat}` : null,
    athenaAgent?.stat  ? `ATHENA: ${athenaAgent.stat}`    : null,
    irisAgent?.stat.toLowerCase().includes('pending') ? 'IRIS has a draft pending review' : null,
    tasks.length > 0   ? `${tasks.length} task${tasks.length !== 1 ? 's' : ''} outstanding` : null,
    focusAreas         ? `This week's focus: ${focusAreas}` : null,
    data.needYouCount > 0 ? `${data.needYouCount} item${data.needYouCount !== 1 ? 's' : ''} awaiting approval` : null,
  ].filter((l): l is string => l !== null)

  return askWith(
    AVA_BASE,
    `Generate a spoken greeting for Archie. Context:\n${lines.join('\n')}\n\nPlain English only. No markdown. Max 3 sentences. End with a question.`,
    256,
    HAIKU,
  )
}

// ── Routing ───────────────────────────────────────────────────────────────────

const ROUTING_SYSTEM = `${AVA_BASE}

You are the routing brain for MAIA. Given user input, determine which agent to query and what action (if any) to take.

Return ONLY a single valid JSON object — no prose, no markdown, no code fences:
{"agent":"<AGENT>","spokenResponse":"<2-3 spoken sentences>","action":{"type":"<type>","payload":{}}}

The "action" key is optional — omit entirely if no action is needed.

Agent routing rules (case-insensitive):
- portfolio / holdings / stocks / performance / value → DEMETER
- brief / markets / news / FX / headlines / pound / dollar → CASSANDRA
- study / cards / quiz / ATHENA / exam / module / flashcard → ATHENA
- email / draft / message / WhatsApp / reply → MERCURY
- LinkedIn / post / IRIS / content / article → IRIS
- file this / MUSE / remember this / save this → MUSE
- KPI / calls / targets / scorecard / pipeline / VICTORIA → VICTORIA
- reflect / HERA / coaching / week review / feelings → HERA
- objection / DIANA / practice / roleplay / sales / weakest objection → DIANA (NEVER set action.type="navigate" for DIANA — only give performance summary)
- add task / remind me / task / to-do → TASKS (set action.type="add_task" and action.payload.title=<the task text>)
- calendar / schedule / today's plan → TASKS

For add_task: extract only the task description (not "add a task:", "remind me to", etc) and put it in action.payload.title.`

export async function routeToAgent(input: string, data: DashboardData): Promise<RouteResult> {
  const context = `Agents online: ${data.onlineCount}. Pending approvals: ${data.needYouCount}.\nUser said: "${input}"`

  const raw = await askWith(ROUTING_SYSTEM, context, 512, HAIKU)

  try {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    // Find the JSON object in the response even if Haiku added surrounding text
    const jsonStart = cleaned.indexOf('{')
    const jsonEnd = cleaned.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('no JSON found')
    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as RouteResult
    return parsed
  } catch {
    return {
      agent: 'MAIA',
      spokenResponse: "I caught that but couldn't quite parse it — try rephrasing. What do you need?",
    }
  }
}

// ── Agent summaries ───────────────────────────────────────────────────────────

export async function generateAgentSummary(agent: string, data: DashboardData): Promise<string> {
  const SUMMARY_SYS = `${AVA_BASE}
Given structured data about ${agent}, produce a concise spoken summary. Plain English only. 2-3 sentences. No markdown, no bullet points. Never give financial advice.`

  try {
    const ag = agent.toUpperCase()

    if (ag === 'DEMETER') {
      const [snap] = await getDb()
        .select({ total_value: portfolio_snapshots.total_value, day_change: portfolio_snapshots.day_change, taken_at: portfolio_snapshots.taken_at })
        .from(portfolio_snapshots)
        .orderBy(desc(portfolio_snapshots.taken_at))
        .limit(1)
      const hdgs = await listHoldings()
      const changePct = snap
        ? (() => { const p = snap.total_value - snap.day_change; return p > 0 ? ((snap.day_change / p) * 100).toFixed(1) : null })()
        : null
      const ctx = snap
        ? `Total value: £${snap.total_value.toFixed(0)}. Day change: ${snap.day_change >= 0 ? '+' : ''}£${snap.day_change.toFixed(0)}${changePct ? ` (${snap.day_change >= 0 ? '+' : ''}${changePct}%)` : ''}. Holdings: ${hdgs.length} positions.`
        : 'No portfolio snapshot available yet.'
      return askWith(SUMMARY_SYS, `DEMETER data: ${ctx}`, 200, HAIKU)
    }

    if (ag === 'ATHENA') {
      const [progress, weaknesses] = await Promise.all([getProgress(), getWeaknessReport(30)])
      const weakest = weaknesses.slice(0, 2).map(w => w.module).join(' and ')
      const ctx = `Cards due today: ${progress.dueToday}. Mastery: ${progress.masteryPct}%. Total cards: ${progress.totalCards}. Streak: ${progress.streakDays} days.${weakest ? ` Weakest modules: ${weakest}.` : ''}`
      return askWith(SUMMARY_SYS, `ATHENA data: ${ctx}`, 200, HAIKU)
    }

    if (ag === 'CASSANDRA') {
      const [brief] = await getDb()
        .select({ summary: research_briefs.summary, created_at: research_briefs.created_at })
        .from(research_briefs)
        .orderBy(desc(research_briefs.created_at))
        .limit(1)
      const ctx = brief
        ? `Latest brief at ${new Date(brief.created_at * 1000).toTimeString().slice(0, 5)}: ${brief.summary.slice(0, 500)}`
        : 'No brief has been sent yet today.'
      return askWith(SUMMARY_SYS, `CASSANDRA data: ${ctx}`, 200, HAIKU)
    }

    if (ag === 'VICTORIA') {
      const logs = await getCurrentWeekLogs()
      const totals = weeklyTotals(logs.map(l => l.metrics))
      const calls = totals['calls'] ?? 0
      const connects = totals['connects'] ?? 0
      const ctx = `This week: ${calls} calls, ${connects} connects. Weekly target: 15 calls. Progress: ${Math.round(calls / 15 * 100)}% of target.`
      return askWith(SUMMARY_SYS, `VICTORIA KPI data: ${ctx}`, 200, HAIKU)
    }

    if (ag === 'DIANA') {
      const d = new Date(); const day = d.getDay()
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); d.setHours(0, 0, 0, 0)
      const weekStart = Math.floor(d.getTime() / 1000)

      const sessions = await getDb()
        .select({ scenario: diana_sessions.scenario, status: diana_sessions.status })
        .from(diana_sessions)
        .where(gte(diana_sessions.created_at, weekStart))
        .orderBy(desc(diana_sessions.created_at))

      const completed = sessions.filter(s => s.status === 'ended')
      const counts: Record<string, number> = {}
      for (const s of completed) {
        if (s.scenario) counts[s.scenario] = (counts[s.scenario] ?? 0) + 1
      }
      const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1])
      const mostDrilled = ranked.slice(0, 2).map(([k]) => k).join(' and ')
      const ctx = `Sessions this week: ${sessions.length} total, ${completed.length} completed.${mostDrilled ? ` Most drilled: ${mostDrilled}.` : ' No completed sessions yet.'}`
      return askWith(SUMMARY_SYS, `DIANA roleplay performance (do not suggest navigating away — just summarise and offer to start a session if needed): ${ctx}`, 200, HAIKU)
    }

    if (ag === 'IRIS') {
      const [posts, draft] = await Promise.all([getRecentPosts(7), getSuggestedTopic()])
      const approved = posts.filter(p => p.status === 'approved').length
      const ctx = `Posts this week: ${posts.length} total, ${approved} approved.${draft ? ` Pending draft on: "${draft.topic}".` : ' No pending draft.'}`
      return askWith(SUMMARY_SYS, `IRIS LinkedIn data: ${ctx}`, 200, HAIKU)
    }

    // Fallback for MERCURY, HERA, MUSE, etc. — use dashboard agent data
    const agentData = data.agents.find(a => a.id === ag)
    if (!agentData) return `I don't have specific data for ${agent} right now. What do you need?`
    const ctx = `${agentData.role}: ${agentData.statusLabel}. ${agentData.stat}.`
    return askWith(SUMMARY_SYS, `${agent} status: ${ctx}`, 200, HAIKU)

  } catch (err) {
    console.error(`[maia-voice] generateAgentSummary error for ${agent}:`, err)
    const fallback = data.agents.find(a => a.id === agent.toUpperCase())
    return fallback
      ? `${fallback.role} — ${fallback.stat.toLowerCase()}. What do you need?`
      : `I had trouble pulling ${agent} data right now. What do you need?`
  }
}

// ── Task extraction ───────────────────────────────────────────────────────────

export function extractTask(input: string): { title: string; dueDate?: string } | null {
  const lower = input.toLowerCase()

  const addMatch  = lower.match(/^(?:add (?:a )?task:|task:)\s*(.+)$/i)
  const remindMatch = lower.match(/^remind me to\s+(.+)$/i)

  let title = (addMatch?.[1] ?? remindMatch?.[1] ?? '').trim()
  if (!title) return null

  // Strip optional "by <date>" suffix
  const byDate = title.match(/^(.+?)\s+by\s+(.+)$/i)
  if (byDate) {
    const parsed = new Date(byDate[2].trim())
    if (!isNaN(parsed.getTime())) {
      return { title: byDate[1].trim(), dueDate: parsed.toISOString().slice(0, 10) }
    }
    title = byDate[1].trim()
  }

  return { title }
}
