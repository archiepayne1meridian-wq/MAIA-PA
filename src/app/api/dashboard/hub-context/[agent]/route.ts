// Right-panel context data for the new three-column dashboard shell.
// Real data where a cheap query exists; explicit empty states otherwise —
// several of these agents (Social, Outreach, Prospects, Pipeline) have no
// backing tables yet, so their sections are honestly empty rather than fake.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { iris_posts, iris_voice_learnings, kpi_logs, kpi_weekly, diana_sessions, research_briefs, study_cards } from '@/db/schema'
import { desc, gte, eq, and, lte } from 'drizzle-orm'
import { getGoals } from '../../../../../../tools/goals'
import { getProgress, getWeaknessReport } from '../../../../../../tools/study-db'

function weekStartSecs(): number {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}
function todayStartSecs(): number {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

type Section =
  | { type: 'reminders'; title: string; items: { text: string; sub?: string }[] }
  | { type: 'goals'; title: string; shortTerm: { text: string; completed: boolean }[]; longTerm: { text: string; completed: boolean }[] }
  | { type: 'stats'; title: string; rows: { label: string; value: string; color?: string }[] }
  | { type: 'tags'; title: string; tags: { text: string; tone: 'red' | 'amber' | 'green' }[] }
  | { type: 'list'; title: string; items: { text: string; sub?: string }[] }
  | { type: 'empty'; title: string; message: string }

async function hubSections(): Promise<Section[]> {
  const db = getDb()
  const reminders: { text: string; sub?: string }[] = []

  const [draftRow] = await db.select({ topic: iris_posts.topic }).from(iris_posts).where(eq(iris_posts.status, 'draft')).orderBy(desc(iris_posts.created_at)).limit(1)
  if (draftRow) reminders.push({ text: 'Approve LinkedIn post', sub: `Draft ready · ${draftRow.topic}` })

  const dueCount = (await db.select({ id: study_cards.id }).from(study_cards).where(and(lte(study_cards.due_at, Math.floor(Date.now() / 1000)), eq(study_cards.suspended, 0)))).length
  if (dueCount > 0) reminders.push({ text: `Clear ${dueCount} Study flashcard${dueCount !== 1 ? 's' : ''} due`, sub: 'CII R01/R06' })

  const goals = await getGoals()

  const sections: Section[] = [
    reminders.length > 0
      ? { type: 'reminders', title: "TODAY'S REMINDERS", items: reminders }
      : { type: 'empty', title: "TODAY'S REMINDERS", message: 'Nothing pending right now.' },
    {
      type: 'goals',
      title: 'GOALS',
      shortTerm: goals.filter(g => g.goal_type === 'short_term').map(g => ({ text: g.goal_text, completed: g.completed === 1 })),
      longTerm: goals.filter(g => g.goal_type === 'long_term').map(g => ({ text: g.goal_text, completed: g.completed === 1 })),
    },
  ]
  return sections
}

async function newsSections(): Promise<Section[]> {
  const db = getDb()
  const following: Section = {
    type: 'list',
    title: 'FOLLOWING',
    items: [
      { text: 'UK Pension & Tax' },
      { text: 'Swiss Company News' },
      { text: 'Bond Markets & Rate Decisions' },
      { text: 'FCA New Rules Only' },
      { text: 'Swiss Regulation' },
    ],
  }

  const tStart = todayStartSecs()
  const [brief] = await db.select({ summary: research_briefs.summary, created_at: research_briefs.created_at })
    .from(research_briefs).where(gte(research_briefs.created_at, tStart)).orderBy(desc(research_briefs.created_at)).limit(1)

  const today: Section = brief
    ? { type: 'list', title: "TODAY'S ITEMS", items: [{ text: brief.summary.slice(0, 90) + (brief.summary.length > 90 ? '…' : ''), sub: 'Today\'s brief' }] }
    : { type: 'empty', title: "TODAY'S ITEMS", message: 'No brief yet today.' }

  return [following, today]
}

async function callsSections(): Promise<Section[]> {
  const db = getDb()
  const wStart = weekStartSecs()
  let calls = 0, connects = 0, meetingsBooked = 0, meetingsSat = 0

  const [weeklyRow] = await db.select({ totals_json: kpi_weekly.totals_json }).from(kpi_weekly).where(gte(kpi_weekly.week_start, wStart)).limit(1)
  if (weeklyRow) {
    try {
      const t = JSON.parse(weeklyRow.totals_json) as Record<string, number>
      calls = t.calls ?? 0; connects = t.connects ?? 0; meetingsBooked = t.meetings_booked ?? 0; meetingsSat = t.meetings_sat ?? 0
    } catch { /* ignore */ }
  }
  if (calls === 0 && connects === 0) {
    const dailyRows = await db.select({ metrics_json: kpi_logs.metrics_json }).from(kpi_logs).where(gte(kpi_logs.log_date, wStart))
    for (const row of dailyRows) {
      try {
        const m = JSON.parse(row.metrics_json) as Record<string, number>
        calls += m.calls ?? 0; connects += m.connects ?? 0; meetingsBooked += m.meetings_booked ?? 0; meetingsSat += m.meetings_sat ?? 0
      } catch { /* ignore */ }
    }
  }

  const stats: Section = {
    type: 'stats', title: 'THIS WEEK',
    rows: [
      { label: 'Calls made', value: String(calls) },
      { label: 'Connects', value: String(connects) },
      { label: 'Meetings booked', value: String(meetingsBooked) },
      { label: 'Meetings sat', value: String(meetingsSat) },
    ],
  }

  // No filler-word tracking table exists yet — honest empty state rather than fabricated numbers.
  const filler: Section = { type: 'empty', title: 'FILLER WORDS TODAY', message: 'Not tracked yet.' }
  const callbacks: Section = { type: 'empty', title: 'CALLBACKS DUE', message: 'Nothing due.' }

  return [stats, filler, callbacks]
}

async function linkedinSections(): Promise<Section[]> {
  const db = getDb()
  const wStart = weekStartSecs()
  const posts = await db.select({ status: iris_posts.status, created_at: iris_posts.created_at })
    .from(iris_posts).where(gte(iris_posts.created_at, wStart)).orderBy(desc(iris_posts.created_at))

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const byDay: Record<string, string> = {}
  for (const p of posts) {
    const d = new Date(p.created_at * 1000)
    const dayIdx = (d.getDay() + 6) % 7   // Mon=0
    if (dayIdx > 4) continue
    const label = DAYS[dayIdx]!
    if (p.status === 'approved' || p.status === 'posted') byDay[label] = 'Posted'
    else if (!byDay[label]) byDay[label] = 'Draft ready'
  }
  const tracker: Section = {
    type: 'stats', title: 'THIS WEEK',
    rows: DAYS.map(d => ({ label: d, value: byDay[d] ?? '—', color: byDay[d] === 'Posted' ? 'accent' : undefined })),
  }

  const learnings = await db.select({ learning: iris_voice_learnings.learning, applied_count: iris_voice_learnings.applied_count })
    .from(iris_voice_learnings).orderBy(desc(iris_voice_learnings.applied_count)).limit(8)
  const learningsSection: Section = learnings.length > 0
    ? { type: 'list', title: 'VOICE LEARNINGS', items: learnings.map(l => ({ text: l.learning })) }
    : { type: 'empty', title: 'VOICE LEARNINGS', message: 'Nothing learned yet.' }

  return [tracker, learningsSection]
}

async function practiceSections(): Promise<Section[]> {
  const db = getDb()
  const thirtyAgo = todayStartSecs() - 30 * 86400
  const rows = await db.select({ created_at: diana_sessions.created_at, status: diana_sessions.status })
    .from(diana_sessions).where(gte(diana_sessions.created_at, thirtyAgo))
  const distinctDays = new Set(rows.filter(r => r.status === 'ended').map(r => new Date(r.created_at * 1000).toISOString().slice(0, 10)))

  const streak: Section = { type: 'stats', title: 'STREAK', rows: [{ label: 'Days practiced (30d)', value: String(distinctDays.size) }] }
  const weak: Section = { type: 'empty', title: 'WEAK POINTS', message: 'Not tracked yet.' }
  const successful: Section = { type: 'empty', title: 'SUCCESSFUL CALLS', message: 'Nothing tagged yet.' }
  return [weak, successful, streak]
}

async function studySections(): Promise<Section[]> {
  const [progress, weakness] = await Promise.all([
    getProgress('qualification'),
    getWeaknessReport(30, 'qualification'),
  ])

  const strong = weakness.filter(w => w.score >= 70).slice(0, 6)
  const needsWork = weakness.filter(w => w.score < 70).slice(0, 6)

  const know: Section = strong.length > 0
    ? { type: 'tags', title: 'WHAT I KNOW', tags: strong.map(w => ({ text: w.module, tone: 'green' })) }
    : { type: 'empty', title: 'WHAT I KNOW', message: 'Not enough review data yet.' }

  const needs: Section = needsWork.length > 0
    ? { type: 'tags', title: 'NEEDS WORK', tags: needsWork.map(w => ({ text: w.module, tone: w.score < 40 ? 'red' : 'amber' })) }
    : { type: 'empty', title: 'NEEDS WORK', message: 'Nothing flagged yet.' }

  const progressSection: Section = {
    type: 'stats', title: 'PROGRESS',
    rows: [
      { label: 'Mastery', value: `${progress.masteryPct}%` },
      { label: 'Cards due today', value: String(progress.dueToday) },
      { label: 'Streak', value: `${progress.streakDays}d` },
    ],
  }
  return [know, needs, progressSection]
}

const EMPTY_AGENT_SECTIONS: Record<string, Section[]> = {
  social: [
    { type: 'empty', title: 'PENDING APPROVAL', message: 'Not connected yet.' },
    { type: 'empty', title: 'THIS WEEK', message: 'Not connected yet.' },
  ],
  outreach: [
    { type: 'empty', title: 'ACTIVE SEQUENCES', message: 'Not connected yet.' },
    { type: 'empty', title: 'THIS MONTH', message: 'Not connected yet.' },
  ],
  prospects: [
    { type: 'empty', title: 'LIST STATUS', message: 'NEXUS not built yet.' },
    { type: 'empty', title: 'TOP CLUSTERS', message: 'NEXUS not built yet.' },
  ],
  pipeline: [
    { type: 'empty', title: 'THIS WEEK', message: 'Not connected yet.' },
    { type: 'empty', title: 'FOLLOW-UP DUE', message: 'Nothing due.' },
  ],
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { agent } = await params

  try {
    let sections: Section[]
    switch (agent) {
      case 'hub': sections = await hubSections(); break
      case 'news': sections = await newsSections(); break
      case 'calls': sections = await callsSections(); break
      case 'linkedin': sections = await linkedinSections(); break
      case 'practice': sections = await practiceSections(); break
      case 'study': sections = await studySections(); break
      default: sections = EMPTY_AGENT_SECTIONS[agent] ?? [{ type: 'empty', title: 'CONTEXT', message: 'Unknown agent.' }]
    }
    return NextResponse.json({ sections })
  } catch (err) {
    console.error(`[hub-context/${agent}] failed:`, err)
    return NextResponse.json({ sections: [{ type: 'empty', title: 'CONTEXT', message: 'Failed to load.' }] })
  }
}
