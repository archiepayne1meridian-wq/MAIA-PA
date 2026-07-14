// MAIA weekly planning and daily check handlers.
// Called by cron routes and Slack events route.

import { postMessage } from './slack'
import { askWith } from './claude'
import { getConfig, setConfig, saveWeeklyIntentions, getDailyNonNegotiables, getActiveTasks, saveTasks } from '../../tools/maia-voice'
import { getDb } from '@/db'
import { maia_tasks } from '@/db/schema'
import { gte } from 'drizzle-orm'

const HAIKU = 'claude-haiku-4-5-20251001'

function currentWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function todayStartSecs(): number {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
}

// ── Weekly planning prompt ────────────────────────────────────────────────────

export async function handleWeeklyPlan(channel: string): Promise<void> {
  const msg = await postMessage(
    channel,
    [
      '*Happy Sunday, Archie!* :spiral_calendar_pad:',
      '',
      "What are you focusing on this week? Drop your priorities here — study goals, call targets, LinkedIn, whatever's live.",
      '',
      '_Reply here and I\'ll lock them in and build you a starter task list._',
    ].join('\n'),
  )
  // Store ts so thread replies to this message are recognised as weekly plan responses
  await setConfig('weekly_plan_ts', msg.ts)
}

// ── Weekly plan reply detection ───────────────────────────────────────────────

const WEEKLY_PHRASES = [
  "this week i'm focusing on",
  "this week im focusing on",
  'my focus this week',
  'weekly plan:',
  'weekly focus:',
  'this week i want to',
  'this week i will',
  'this week:',
]

export function detectWeeklyPlanReply(
  text: string,
  eventThreadTs: string | undefined,
  savedPlanTs: string | null,
): boolean {
  // Thread reply to the planning message — most reliable signal
  if (eventThreadTs && savedPlanTs && eventThreadTs === savedPlanTs) return true
  // Explicit trigger phrases work in any context
  const lower = text.toLowerCase().trim()
  return WEEKLY_PHRASES.some(p => lower.includes(p))
}

// ── Weekly plan reply handler ─────────────────────────────────────────────────

export async function handleWeeklyPlanReply(
  text: string,
  channel: string,
  threadAnchorTs: string,
): Promise<void> {
  // Extract focus areas via Haiku
  const focusJson = await askWith(
    'Extract the weekly focus areas from this message as a JSON array of concise strings (3-6 words each). Return ONLY valid JSON — no prose, no code fences. Max 6 items. Example: ["CISI exam prep","10 calls per day","2 LinkedIn posts"]',
    text,
    256,
    HAIKU,
  )

  let focusAreas: string[] = []
  try {
    const cleaned = focusJson.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const start = cleaned.indexOf('['), end = cleaned.lastIndexOf(']')
    if (start !== -1 && end !== -1) {
      focusAreas = (JSON.parse(cleaned.slice(start, end + 1)) as unknown[]).slice(0, 6).map(String)
    }
  } catch { /* fall back to raw text */ }
  if (focusAreas.length === 0) focusAreas = [text.trim().slice(0, 80)]

  // Save to DB
  await saveWeeklyIntentions(currentWeekStart(), focusAreas, text)

  // Generate 3 concrete task suggestions
  const tasksJson = await askWith(
    'You are a practical task planner. Given weekly focus areas, generate exactly 3 specific, actionable tasks for the week. Return ONLY a JSON array of strings — no prose, no code fences. Each task under 60 characters. Example: ["Book 3 discovery calls","Draft 2 LinkedIn posts","Complete Module 4 quiz"]',
    `Weekly focus areas: ${focusAreas.join(', ')}`,
    200,
    HAIKU,
  )

  let suggestedTasks: string[] = []
  try {
    const cleaned = tasksJson.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const start = cleaned.indexOf('['), end = cleaned.lastIndexOf(']')
    if (start !== -1 && end !== -1) {
      suggestedTasks = (JSON.parse(cleaned.slice(start, end + 1)) as unknown[]).slice(0, 3).map(String)
    }
  } catch { /* no tasks */ }

  // Auto-save suggested tasks to dashboard
  if (suggestedTasks.length > 0) {
    await saveTasks(suggestedTasks.map(title => ({ title, source: 'weekly_plan' })))
  }

  const taskLines = suggestedTasks.map((t, i) => `${i + 1}. ${t}`).join('\n')
  const replyText = [
    `✅ *Week locked in.* Focus: ${focusAreas.join(' · ')}`,
    '',
    suggestedTasks.length > 0
      ? `*3 tasks added to your dashboard:*\n${taskLines}`
      : '_Could not generate tasks — check input._',
    '',
    '_Good luck. Make it count._',
  ].join('\n')

  await postMessage(channel, replyText, threadAnchorTs)
}

// ── Daily afternoon check ─────────────────────────────────────────────────────

export async function handleAfternoonCheck(channel: string): Promise<void> {
  const [nonNeg, tasks] = await Promise.all([getDailyNonNegotiables(), getActiveTasks()])

  const checks = [
    `LinkedIn: ${nonNeg.linkedinToday}/2 posts`,
    `DIANA practice: ${nonNeg.dianaToday > 0 ? '✅' : '❌'}`,
    `ATHENA study: ${nonNeg.athenaToday > 0 ? '✅' : '❌'}`,
  ]
  const allDone = nonNeg.linkedinToday >= 2 && nonNeg.dianaToday > 0 && nonNeg.athenaToday > 0

  const nudge = await askWith(
    "You are Ava, MAIA's voice assistant for Archie Payne — trainee financial adviser. Generate a short afternoon check-in for Slack. Plain text only. 2 sentences max. Direct and slightly dry — never corporate. Acknowledge progress if on track; nudge (without nagging) if not.",
    [
      `Afternoon check-in`,
      `Non-negotiables: ${checks.join(', ')}`,
      `Active tasks remaining: ${tasks.length}`,
      allDone ? 'All non-negotiables complete.' : 'Some non-negotiables still outstanding.',
    ].join('\n'),
    150,
    HAIKU,
  )

  const block = [
    `*Afternoon check · ${todayLabel()}*`,
    '',
    checks.map(c => `• ${c}`).join('\n'),
    tasks.length > 0 ? `• ${tasks.length} task${tasks.length !== 1 ? 's' : ''} outstanding` : '',
    '',
    nudge,
  ].filter(Boolean).join('\n')

  await postMessage(channel, block)
}

// ── Daily evening summary ─────────────────────────────────────────────────────

export async function handleEveningCheck(channel: string): Promise<void> {
  const [nonNeg, activeTasks] = await Promise.all([getDailyNonNegotiables(), getActiveTasks()])

  const completedToday = await getDb()
    .select({ id: maia_tasks.id, title: maia_tasks.title })
    .from(maia_tasks)
    .where(gte(maia_tasks.completed_at, todayStartSecs()))

  const checks = [
    `LinkedIn posts: ${nonNeg.linkedinToday}/2`,
    `DIANA practice: ${nonNeg.dianaToday > 0 ? '✅' : '❌'}`,
    `ATHENA study: ${nonNeg.athenaToday > 0 ? '✅' : '❌'}`,
  ]
  const allDone = nonNeg.linkedinToday >= 2 && nonNeg.dianaToday > 0 && nonNeg.athenaToday > 0
  const missed = [
    nonNeg.linkedinToday < 2 ? 'LinkedIn' : '',
    nonNeg.dianaToday === 0 ? 'DIANA' : '',
    nonNeg.athenaToday === 0 ? 'ATHENA' : '',
  ].filter(Boolean).join(' and ')

  const summary = await askWith(
    "You are Ava, MAIA's voice assistant for Archie Payne — trainee financial adviser. Generate an end-of-day Slack summary. Plain text only. 2-3 sentences. Acknowledge what was done, note what wasn't without guilt-tripping, end with one forward-looking prompt for tomorrow.",
    [
      `Evening summary`,
      `Non-negotiables: ${checks.join(', ')}`,
      allDone ? 'All non-negotiables hit.' : `Missed today: ${missed}.`,
      `Tasks completed today: ${completedToday.length}`,
      `Tasks still active: ${activeTasks.length}`,
    ].join('\n'),
    200,
    HAIKU,
  )

  const carryLines = activeTasks.length > 0
    ? ['\n*Carrying forward:*', ...activeTasks.slice(0, 3).map(t => `• ${t.title}`), activeTasks.length > 3 ? `• …and ${activeTasks.length - 3} more` : ''].filter(Boolean)
    : []

  const block = [
    `*Evening wrap · ${todayLabel()}*`,
    '',
    checks.map(c => `• ${c}`).join('\n'),
    completedToday.length > 0 ? `• ${completedToday.length} task${completedToday.length !== 1 ? 's' : ''} completed` : '',
    '',
    summary,
    ...carryLines,
  ].filter(Boolean).join('\n')

  await postMessage(channel, block)
}
