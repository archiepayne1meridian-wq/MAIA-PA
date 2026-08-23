import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { diana_sessions } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { parseGeneratedProspect } from '@/lib/diana'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()

  // Web sessions (last 30)
  const rows = await db
    .select({
      id: diana_sessions.id,
      scenario: diana_sessions.scenario,
      difficulty: diana_sessions.difficulty,
      status: diana_sessions.status,
      generated_prospect: diana_sessions.generated_prospect,
      score_total: diana_sessions.score_total,
      created_at: diana_sessions.created_at,
      ended_at: diana_sessions.ended_at,
    })
    .from(diana_sessions)
    .where(eq(diana_sessions.slack_user, 'web'))
    .orderBy(desc(diana_sessions.created_at))
    .limit(30)

  const sessions = rows.map(r => {
    const prospect = parseGeneratedProspect(r.generated_prospect)
    return {
      id: r.id,
      // Old rows (pre-dynamic-generation) fall back to the objection scenario label.
      scenario: prospect ? `${prospect.firstName} ${prospect.lastInitial}` : (r.scenario ?? 'Unknown'),
      company: prospect?.company ?? null,
      score: r.score_total,
      difficulty: r.difficulty,
      status: r.status,
      date: new Date(r.created_at * 1000).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short',
      }),
      completed: r.status === 'ended',
      // Every generated prospect has a random name, so it can't be the stats
      // grouping key any more (every session would be its own 1/1 bucket) — the
      // early objection actually recurs across sessions, so group on that instead.
      objectionKey: prospect
        ? (prospect.earlyObjection ?? 'No early objection')
        : (r.scenario ?? 'Unknown'),
    }
  })

  // Per-objection stats — count sessions and completion per early objection
  const statsMap = new Map<string, { count: number; completed: number }>()
  for (const s of sessions) {
    const key = s.objectionKey
    const entry = statsMap.get(key) ?? { count: 0, completed: 0 }
    entry.count++
    if (s.completed) entry.completed++
    statsMap.set(key, entry)
  }

  const objectionStats = Array.from(statsMap.entries())
    .map(([label, { count, completed }]) => ({
      label,
      count,
      completedCount: completed,
      completionPct: count > 0 ? Math.round(completed / count * 100) : 0,
    }))
    .sort((a, b) => a.completionPct - b.completionPct)

  // objectionKey was only needed to compute objectionStats above.
  const publicSessions = sessions.map(({ objectionKey: _objectionKey, ...rest }) => rest)

  return NextResponse.json({ sessions: publicSessions, objectionStats })
}
