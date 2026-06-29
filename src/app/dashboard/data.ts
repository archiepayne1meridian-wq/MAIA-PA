import { getDb } from '@/db'
import {
  activity, study_cards, study_reviews, research_briefs,
  portfolio_snapshots, holdings, reflections, diana_sessions,
  kpi_logs, kpi_weekly, approvals,
} from '@/db/schema'
import { desc, eq, gte, lte, and, count } from 'drizzle-orm'
import type { Agent, Task } from './types'

// ─── Time helpers ─────────────────────────────────────────────────────────────

function todayStartSecs(): number {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

function weekStartSecs(): number {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))  // back to Monday
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

function relTime(ts: number): string {
  const tStart = todayStartSecs()
  if (ts >= tStart) return new Date(ts * 1000).toTimeString().slice(0, 5)
  if (ts >= tStart - 86400) return 'Yest'
  return new Date(ts * 1000).toLocaleDateString('en-GB', { weekday: 'short' })
}

// ─── Inactive stubs (T3 / shelved — never show real data) ─────────────────────

export const INACTIVE_AGENTS: Agent[] = [
  {
    id: 'LUNA', role: 'Meeting prep', badge: 'L',
    status: 'idle', stat: 'Coming soon', statusLabel: 'Not yet active',
    prog: 0, progAlert: false, inactive: true,
    tiles: [
      ['Status', 'Coming soon', 'T2 — not yet built'],
      ['Role', 'Meeting prep', 'your eyes only'],
      ['Data', 'None', 'no real data shown'],
      ['Mode', 'Descriptive', 'never prescriptive'],
    ],
    feed: [['—', 'Not yet active']],
  },
  {
    id: 'IRIS', role: 'LinkedIn news-relay', badge: 'I',
    status: 'idle', stat: 'Coming soon', statusLabel: 'T3 — awaiting firm sign-off',
    prog: 0, progAlert: false, inactive: true,
    tiles: [
      ['Status', 'Shelved', 'T3 — firm approval required'],
      ['Role', 'News relay', 'factual only'],
      ['Data', 'None', 'no real data shown'],
      ['Mode', 'Draft-only', 'approval required'],
    ],
    feed: [['—', 'T3 agent — awaiting deVere compliance clearance']],
  },
  {
    id: 'JUNO', role: 'Compliance helper', badge: 'J',
    status: 'idle', stat: 'Coming soon', statusLabel: 'Not yet active',
    prog: 0, progAlert: false, inactive: true,
    tiles: [
      ['Status', 'Coming soon', 'T3 — not yet built'],
      ['Role', 'Compliance', 'first-pass only'],
      ['Data', 'None', 'no real data shown'],
      ['Note', 'Not a sign-off', 'human decides'],
    ],
    feed: [['—', 'Not yet active']],
  },
]

// ─── Activity feed for a single agent ─────────────────────────────────────────

async function agentFeed(
  db: ReturnType<typeof getDb>,
  agentName: string,
): Promise<[string, string][]> {
  const rows = await db
    .select({ output: activity.output, type: activity.type, created_at: activity.created_at })
    .from(activity)
    .where(eq(activity.agent, agentName))
    .orderBy(desc(activity.created_at))
    .limit(3)
  if (rows.length === 0) return [['—', 'No activity yet']]
  return rows.map(r => [
    relTime(r.created_at),
    (r.output ?? r.type).slice(0, 80),
  ]) as [string, string][]
}

// ─── Dashboard data ───────────────────────────────────────────────────────────

export interface DashboardData {
  agents: Agent[]
  tasks: Task[]
  onlineCount: number
  needYouCount: number
}

export async function buildDashboardData(): Promise<DashboardData> {
  const db = getDb()
  const tStart = todayStartSecs()
  const wStart = weekStartSecs()
  const endOfToday = tStart + 86400
  const thirtyAgo = tStart - 30 * 86400

  // ── MAIA ─────────────────────────────────────────────────────────────────────
  const [todayActResult] = await db
    .select({ n: count() }).from(activity).where(gte(activity.created_at, tStart))
  const maiaCount = todayActResult?.n ?? 0

  const maiaFeedRows = await db
    .select({ output: activity.output, type: activity.type, created_at: activity.created_at })
    .from(activity).orderBy(desc(activity.created_at)).limit(3)
  const maiaFeed: [string, string][] = maiaFeedRows.length > 0
    ? maiaFeedRows.map(r => [relTime(r.created_at), (r.output ?? r.type).slice(0, 80)] as [string, string])
    : [['—', 'No activity yet']]

  // ── ATHENA ───────────────────────────────────────────────────────────────────
  const [dueResult] = await db
    .select({ n: count() }).from(study_cards)
    .where(and(lte(study_cards.due_at, endOfToday), eq(study_cards.suspended, 0)))
  const dueCount = dueResult?.n ?? 0

  const recentReviews = await db
    .select({ quality: study_reviews.quality }).from(study_reviews)
    .where(gte(study_reviews.reviewed_at, thirtyAgo))
  const masteryPct = recentReviews.length > 0
    ? Math.round(recentReviews.filter(r => r.quality >= 4).length / recentReviews.length * 100)
    : 0

  const [reviewsTodayResult] = await db
    .select({ n: count() }).from(study_reviews)
    .where(gte(study_reviews.reviewed_at, tStart))
  const reviewedToday = reviewsTodayResult?.n ?? 0

  const athenaFeed = await agentFeed(db, 'ATHENA')

  // ── CASSANDRA ─────────────────────────────────────────────────────────────────
  const [lastBriefRow] = await db
    .select({ created_at: research_briefs.created_at, type: research_briefs.type })
    .from(research_briefs).orderBy(desc(research_briefs.created_at)).limit(1)
  const briefSentToday = (lastBriefRow?.created_at ?? 0) >= tStart
  const briefTime = lastBriefRow
    ? new Date(lastBriefRow.created_at * 1000).toTimeString().slice(0, 5)
    : null

  const cassandraFeed = await agentFeed(db, 'CASSANDRA')

  // ── DEMETER — reads portfolio_snapshots only, no live price fetch ─────────────
  const [snapRow] = await db
    .select({
      total_value: portfolio_snapshots.total_value,
      day_change: portfolio_snapshots.day_change,
      taken_at: portfolio_snapshots.taken_at,
    })
    .from(portfolio_snapshots).orderBy(desc(portfolio_snapshots.taken_at)).limit(1)

  const [holdingCountResult] = await db.select({ n: count() }).from(holdings)
  const holdingCount = holdingCountResult?.n ?? 0

  let dayChangePct: string | null = null
  if (snapRow) {
    const prevValue = snapRow.total_value - snapRow.day_change
    if (prevValue > 0) {
      const sign = snapRow.day_change >= 0 ? '+' : ''
      dayChangePct = `${sign}${((snapRow.day_change / prevValue) * 100).toFixed(1)}%`
    }
  }
  const snapshotToday = (snapRow?.taken_at ?? 0) >= tStart
  const demeterFeed = await agentFeed(db, 'DEMETER')

  // ── HERA ─────────────────────────────────────────────────────────────────────
  const [lastRefRow] = await db
    .select({ created_at: reflections.created_at })
    .from(reflections).orderBy(desc(reflections.created_at)).limit(1)
  const refToday = (lastRefRow?.created_at ?? 0) >= tStart

  const recentRefRows = await db
    .select({ created_at: reflections.created_at })
    .from(reflections).where(gte(reflections.created_at, thirtyAgo))
  const distinctDays = new Set(
    recentRefRows.map(r => {
      const d = new Date(r.created_at * 1000)
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    }),
  )
  const streak = distinctDays.size
  const heraFeed = await agentFeed(db, 'HERA')

  // ── DIANA ─────────────────────────────────────────────────────────────────────
  const dianaRows = await db
    .select({ created_at: diana_sessions.created_at, scenario: diana_sessions.scenario, status: diana_sessions.status })
    .from(diana_sessions).where(gte(diana_sessions.created_at, wStart))
    .orderBy(desc(diana_sessions.created_at))
  const sessionCount = dianaRows.length
  const completedCount = dianaRows.filter(r => r.status === 'ended').length

  const [lastSessionRow] = await db
    .select({ created_at: diana_sessions.created_at, scenario: diana_sessions.scenario })
    .from(diana_sessions).orderBy(desc(diana_sessions.created_at)).limit(1)

  const dianaFeed: [string, string][] = dianaRows
    .filter(r => r.status === 'ended').slice(0, 3)
    .map(r => [relTime(r.created_at), `Drill: ${r.scenario ?? 'roleplay'}`] as [string, string])
  if (dianaFeed.length === 0) dianaFeed.push(['—', 'No sessions yet — start a drill in Slack'])

  const dianaTarget = 5
  const dianaProg = Math.min(Math.round(sessionCount / dianaTarget * 100), 100)

  // ── VICTORIA ─────────────────────────────────────────────────────────────────
  let callsThisWeek = 0
  const [weeklyRow] = await db
    .select({ totals_json: kpi_weekly.totals_json })
    .from(kpi_weekly).where(gte(kpi_weekly.week_start, wStart)).limit(1)
  if (weeklyRow) {
    try { callsThisWeek = (JSON.parse(weeklyRow.totals_json) as { calls?: number }).calls ?? 0 }
    catch { /* ignore */ }
  }
  if (callsThisWeek === 0) {
    const dailyRows = await db
      .select({ metrics_json: kpi_logs.metrics_json })
      .from(kpi_logs).where(gte(kpi_logs.log_date, wStart))
    for (const row of dailyRows) {
      try { callsThisWeek += (JSON.parse(row.metrics_json) as { calls?: number }).calls ?? 0 }
      catch { /* ignore */ }
    }
  }
  const [todayKpiResult] = await db
    .select({ n: count() }).from(kpi_logs).where(gte(kpi_logs.log_date, tStart))
  const kpiLoggedToday = (todayKpiResult?.n ?? 0) > 0
  const victoriaFeed = await agentFeed(db, 'VICTORIA')
  const victoriaTarget = 15
  const victoriaProg = Math.min(Math.round(callsThisWeek / victoriaTarget * 100), 100)

  // ── Pending approvals ─────────────────────────────────────────────────────────
  const [pendingResult] = await db
    .select({ n: count() }).from(approvals).where(eq(approvals.status, 'pending'))
  const needYouCount = pendingResult?.n ?? 0

  // ── Tasks (real signals + clearly-labelled stubs) ─────────────────────────────
  const tasks: Task[] = []
  if (needYouCount > 0) {
    tasks.push({
      text: `${needYouCount} item${needYouCount !== 1 ? 's' : ''} awaiting your approval`,
      meta: 'MAIA', warn: 'Action required', done: false,
    })
  }
  if (dueCount > 0) {
    tasks.push({
      text: `Clear ${dueCount} ATHENA flashcard${dueCount !== 1 ? 's' : ''} due today`,
      meta: 'ATHENA', done: false,
    })
  }
  // Stub: HERA reflection (real signal: done if reflected today)
  tasks.push({ text: 'HERA evening reflection', meta: 'HERA', warn: '22:00', done: refToday })
  // Stub: CASSANDRA brief review (real signal: done if brief was sent today)
  tasks.push({ text: 'Review morning market brief', meta: 'CASSANDRA', done: briefSentToday })

  // ── Online count ──────────────────────────────────────────────────────────────
  const onlineFlags = [
    maiaCount > 0,
    dueCount > 0 || reviewedToday > 0,
    briefSentToday,
    snapshotToday,
    refToday,
    sessionCount > 0,
    kpiLoggedToday,
  ]
  const onlineCount = onlineFlags.filter(Boolean).length

  // ── Agents array ──────────────────────────────────────────────────────────────
  const agents: Agent[] = [
    {
      id: 'MAIA', role: 'Orchestrator', badge: 'M',
      status: maiaCount > 0 ? 'online' : 'idle',
      stat: maiaCount > 0 ? `${maiaCount} action${maiaCount !== 1 ? 's' : ''} today` : 'No activity today',
      statusLabel: `Orchestrating — ${maiaCount} action${maiaCount !== 1 ? 's' : ''} today`,
      prog: Math.min(maiaCount * 5, 100),
      progAlert: false,
      tiles: [
        ['Actions today', String(maiaCount), 'across all agents'],
        ['Pending approvals', String(needYouCount), needYouCount > 0 ? 'need you' : 'all clear'],
        ['Agents active', String(onlineCount), 'of 7 built'],
        ['Status', 'Online', 'routing'],
      ],
      feed: maiaFeed,
    },
    {
      id: 'ATHENA', role: 'CISI study coach', badge: 'A',
      status: dueCount > 0 ? 'online' : 'idle',
      stat: dueCount > 0 ? `${dueCount} cards due` : reviewedToday > 0 ? `${reviewedToday} reviewed today` : 'No cards due',
      statusLabel: dueCount > 0
        ? `${dueCount} cards due — review before end of day`
        : reviewedToday > 0 ? `${reviewedToday} reviewed today — up to date` : 'No cards scheduled today',
      prog: masteryPct,
      progAlert: false,
      tiles: [
        ['Cards due today', String(dueCount), dueCount > 0 ? 'review now' : 'all clear'],
        ['Reviewed today', String(reviewedToday), 'cards'],
        ['Mastery', `${masteryPct}%`, 'last 30 days'],
        ['Reviews tracked', String(recentReviews.length), 'last 30 days'],
      ],
      feed: athenaFeed,
    },
    {
      id: 'CASSANDRA', role: 'Market & FX brief', badge: 'C',
      status: briefSentToday ? 'online' : 'idle',
      stat: briefTime ? `Brief sent ${briefTime}` : 'No brief yet today',
      statusLabel: briefTime ? `Morning brief delivered at ${briefTime}` : 'No brief sent today',
      prog: briefSentToday ? 100 : 0,
      progAlert: false,
      tiles: [
        ['Last brief', briefTime ?? 'None', briefSentToday ? 'today' : 'not yet today'],
        ['Brief type', lastBriefRow?.type ?? 'N/A', 'morning / on_demand'],
        ['Status', briefSentToday ? 'Delivered' : 'Pending', 'today'],
        ['Source', 'Twelve Data', '+ RSS feeds'],
      ],
      feed: cassandraFeed,
    },
    {
      id: 'DEMETER', role: 'Portfolio tracker', badge: 'D',
      status: snapshotToday ? 'online' : 'idle',
      stat: snapRow
        ? `${holdingCount} holdings${dayChangePct ? ' · ' + dayChangePct : ''}`
        : 'No snapshot — send "portfolio" in Slack',
      statusLabel: snapRow
        ? `Portfolio last updated ${relTime(snapRow.taken_at)}`
        : 'No snapshot in DB yet — trigger a brief in Slack',
      prog: snapshotToday ? 100 : 0,
      progAlert: !snapshotToday && snapRow !== undefined,
      tiles: [
        ['Holdings', String(holdingCount), 'positions'],
        ['Day change', dayChangePct ?? 'N/A', 'from last close (snapshot)'],
        ['Last snapshot', snapRow ? relTime(snapRow.taken_at) : 'None', 'no live fetch on page load'],
        ['Mode', 'Info only', 'no trading signals'],
      ],
      feed: demeterFeed,
    },
    {
      id: 'HERA', role: 'Reflection & coaching', badge: 'H',
      status: refToday ? 'online' : 'idle',
      stat: lastRefRow ? `Last check-in ${relTime(lastRefRow.created_at)}` : 'No reflections yet',
      statusLabel: refToday ? 'Reflection logged today' : 'Awaiting tonight\'s reflection',
      prog: Math.min(streak * 10, 100),
      progAlert: false,
      tiles: [
        ['Streak', `${streak}d`, 'days with reflections'],
        ['Last check-in', lastRefRow ? relTime(lastRefRow.created_at) : 'None', refToday ? 'today' : 'not yet today'],
        ['Tonight', refToday ? 'Done ✓' : 'Pending', '22:00 reflection'],
        ['Mode', 'Slack', 'voice or text'],
      ],
      feed: heraFeed,
    },
    {
      id: 'DIANA', role: 'Objection roleplay', badge: 'D',
      status: 'idle',
      stat: sessionCount > 0 ? `${sessionCount} session${sessionCount !== 1 ? 's' : ''} this week` : 'Ready to drill',
      statusLabel: lastSessionRow
        ? `Last session: ${lastSessionRow.scenario ?? 'roleplay'} — ${relTime(lastSessionRow.created_at)}`
        : 'Ready for a drill',
      prog: dianaProg,
      progAlert: false,
      tiles: [
        ['Sessions this week', String(sessionCount), 'drills'],
        ['Completed', String(completedCount), 'ended sessions'],
        ['Target', String(dianaTarget), 'per week'],
        ['Last drill', lastSessionRow ? relTime(lastSessionRow.created_at) : 'None', lastSessionRow?.scenario ?? '—'],
      ],
      feed: dianaFeed,
    },
    {
      id: 'VICTORIA', role: 'KPI & pipeline', badge: 'V',
      status: kpiLoggedToday ? 'online' : 'idle',
      stat: callsThisWeek > 0 ? `Calls ${callsThisWeek} / ${victoriaTarget}` : 'No KPIs logged yet',
      statusLabel: callsThisWeek > 0
        ? `${callsThisWeek}/${victoriaTarget} calls logged this week`
        : 'No KPI data yet — log in Slack',
      prog: victoriaProg,
      progAlert: false,
      tiles: [
        ['Calls this week', String(callsThisWeek), `target ${victoriaTarget}`],
        ['Progress', `${victoriaProg}%`, 'of weekly target'],
        ['KPI logged today', kpiLoggedToday ? 'Yes' : 'No', 'via Slack'],
        ['Scorecard', 'Weekly', 'sent via Slack'],
      ],
      feed: victoriaFeed,
    },
    ...INACTIVE_AGENTS,
  ]

  return { agents, tasks, onlineCount, needYouCount }
}
