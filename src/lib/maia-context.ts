// MAIA orchestrator — shared context gatherer for the persistent chat bar
// (route.ts's Sonnet call) and the morning brief home screen. One query set,
// two consumers — keeps them from drifting apart.

import { getDb } from '@/db'
import { apollo_calls, iris_posts, diana_sessions, kpi_logs, kpi_weekly, study_cards } from '@/db/schema'
import { desc, eq, gte, isNotNull, and, lte } from 'drizzle-orm'
import { getTodayCallAngle } from '../../tools/hermes-db'
import { getProgress } from '../../tools/study-db'

function weekStartSecs(): number {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

export interface MaiaMeetingItem {
  prospectName: string
  meetingDetails: string
  hasBrief: boolean   // whether APOLLO has generated the full advisor brief yet
  callDate: string
}

export interface MaiaWeekStats {
  calls: number
  connects: number
  meetingsBooked: number
  meetingsSat: number
}

export interface MaiaIrisDraft {
  id: string
  topic: string
  pillar: number
}

export interface MaiaLastDiana {
  scenario: string | null
  createdAt: number
  daysSince: number
}

export interface MaiaContext {
  todayAngle: string | null
  thisWeekMeetings: MaiaMeetingItem[]
  irisDraft: MaiaIrisDraft | null
  lastDiana: MaiaLastDiana | null
  lastCoaching: string | null
  dueCardsQualification: number
  dueCardsByExam: { R01: number; R06: number }
  weekStats: MaiaWeekStats
  currentDate: string
}

// apollo_calls has no structured meeting_date/outcome column — meeting_details
// (free text pulled from the transcript by ANALYSE) is the closest proxy for
// "a meeting was discussed/booked" on a given call. Not a true chronological
// "upcoming meetings" list — it's recent calls this week where a meeting came up.
export async function gatherMaiaContext(): Promise<MaiaContext> {
  const db = getDb()
  const wStart = weekStartSecs()
  const now = Math.floor(Date.now() / 1000)

  const [todayAngle, progress] = await Promise.all([
    getTodayCallAngle(),
    getProgress('qualification'),
  ])

  const recentCalls = await db
    .select({
      prospect_name: apollo_calls.prospect_name,
      outcome: apollo_calls.outcome,
      call_summary: apollo_calls.call_summary,
      advisor_brief: apollo_calls.advisor_brief,   // repurposed: crm_notes — see schema.ts
      call_date: apollo_calls.call_date,
      created_at: apollo_calls.created_at,
    })
    .from(apollo_calls)
    .where(gte(apollo_calls.created_at, wStart))
    .orderBy(desc(apollo_calls.created_at))
    .limit(20)

  const thisWeekMeetings: MaiaMeetingItem[] = []
  for (const row of recentCalls) {
    if (row.outcome !== 'booked') continue
    thisWeekMeetings.push({
      prospectName: row.prospect_name ?? 'Unnamed prospect',
      meetingDetails: row.call_summary ?? 'Meeting booked',
      hasBrief: !!row.advisor_brief,
      callDate: row.call_date,
    })
    if (thisWeekMeetings.length >= 5) break
  }

  const [irisDraftRow] = await db
    .select({ id: iris_posts.id, topic: iris_posts.topic, pillar: iris_posts.pillar })
    .from(iris_posts)
    .where(eq(iris_posts.status, 'draft'))
    .orderBy(desc(iris_posts.created_at))
    .limit(1)

  const [lastDianaRow] = await db
    .select({ scenario: diana_sessions.scenario, created_at: diana_sessions.created_at })
    .from(diana_sessions)
    .orderBy(desc(diana_sessions.created_at))
    .limit(1)

  const [lastCoachingRow] = await db
    .select({ coaching_insight: apollo_calls.coaching_insight })
    .from(apollo_calls)
    .where(isNotNull(apollo_calls.coaching_insight))
    .orderBy(desc(apollo_calls.created_at))
    .limit(1)

  // Week KPI totals — same rolled-up-then-fallback approach as buildDashboardData.
  const weekStats: MaiaWeekStats = { calls: 0, connects: 0, meetingsBooked: 0, meetingsSat: 0 }
  const [weeklyRow] = await db
    .select({ totals_json: kpi_weekly.totals_json })
    .from(kpi_weekly).where(gte(kpi_weekly.week_start, wStart)).limit(1)
  if (weeklyRow) {
    try {
      const t = JSON.parse(weeklyRow.totals_json) as Record<string, number>
      weekStats.calls = t.calls ?? 0
      weekStats.connects = t.connects ?? 0
      weekStats.meetingsBooked = t.meetings_booked ?? 0
      weekStats.meetingsSat = t.meetings_sat ?? 0
    } catch { /* ignore */ }
  }
  if (weekStats.calls === 0 && weekStats.connects === 0) {
    const dailyRows = await db.select({ metrics_json: kpi_logs.metrics_json }).from(kpi_logs).where(gte(kpi_logs.log_date, wStart))
    for (const row of dailyRows) {
      try {
        const m = JSON.parse(row.metrics_json) as Record<string, number>
        weekStats.calls += m.calls ?? 0
        weekStats.connects += m.connects ?? 0
        weekStats.meetingsBooked += m.meetings_booked ?? 0
        weekStats.meetingsSat += m.meetings_sat ?? 0
      } catch { /* ignore */ }
    }
  }

  const lastDiana: MaiaLastDiana | null = lastDianaRow
    ? { scenario: lastDianaRow.scenario, createdAt: lastDianaRow.created_at, daysSince: Math.floor((now - lastDianaRow.created_at) / 86400) }
    : null

  // Per-exam due count (R01/R06) — getProgress() is track-level only, so this
  // mirrors its dueRows query with an added exam filter.
  const examDue = { R01: 0, R06: 0 }
  for (const exam of ['R01', 'R06'] as const) {
    const rows = await db
      .select({ id: study_cards.id })
      .from(study_cards)
      .where(and(
        lte(study_cards.due_at, now),
        eq(study_cards.suspended, 0),
        eq(study_cards.track, 'qualification'),
        eq(study_cards.exam, exam),
      ))
    examDue[exam] = rows.length
  }

  return {
    todayAngle,
    thisWeekMeetings,
    irisDraft: irisDraftRow ?? null,
    lastDiana,
    lastCoaching: lastCoachingRow?.coaching_insight ?? null,
    dueCardsQualification: progress.dueToday,
    dueCardsByExam: examDue,
    weekStats,
    currentDate: new Date().toISOString(),
  }
}
