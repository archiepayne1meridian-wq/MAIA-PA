// Right-panel context data for the Calls agent — real data from apollo_calls
// and kpi_logs/kpi_weekly, with today-vs-yesterday trend arrows on filler words.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { kpi_logs, kpi_weekly } from '@/db/schema'
import { gte } from 'drizzle-orm'
import { getCallbacksDue, getRecentWinningPhrases, getFillerWordsForDate } from '../../../../../../tools/apollo'

function weekStartSecs(): number {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

function dateStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  const [todayFiller, yesterdayFiller, callbacksDue, recentWins] = await Promise.all([
    getFillerWordsForDate(dateStr(0)),
    getFillerWordsForDate(dateStr(1)),
    getCallbacksDue(),
    getRecentWinningPhrases(5),
  ])

  const FILLER_LABELS: [string, string][] = [
    ['you_know', '"you know"'],
    ['sort_of', '"sort of"'],
    ['obviously', '"obviously"'],
    ['basically', '"basically"'],
  ]
  const fillerWords = FILLER_LABELS.map(([key, label]) => {
    const today = todayFiller[key] ?? 0
    const yesterday = yesterdayFiller[key] ?? 0
    const trend = today > yesterday ? 'up' : today < yesterday ? 'down' : 'flat'
    return { label, count: today, trend }
  })

  return NextResponse.json({
    thisWeek: { calls, connects, connectRate: calls > 0 ? Math.round((connects / calls) * 100) : 0, meetingsBooked, meetingsSat },
    fillerWords,
    callbacksDue: callbacksDue.map(c => ({ name: c.prospect_name ?? 'Unknown', date: c.follow_up_date })),
    recentWins,
  })
}
