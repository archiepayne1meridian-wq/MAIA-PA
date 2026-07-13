import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { diana_sessions } from '@/db/schema'
import { eq, desc, and, isNotNull } from 'drizzle-orm'

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
      created_at: diana_sessions.created_at,
      ended_at: diana_sessions.ended_at,
    })
    .from(diana_sessions)
    .where(eq(diana_sessions.slack_user, 'web'))
    .orderBy(desc(diana_sessions.created_at))
    .limit(30)

  const sessions = rows.map(r => ({
    id: r.id,
    scenario: r.scenario ?? 'Unknown',
    difficulty: r.difficulty,
    status: r.status,
    date: new Date(r.created_at * 1000).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short',
    }),
    completed: r.status === 'ended',
  }))

  // Per-objection stats — count sessions and completion per scenario
  const statsMap = new Map<string, { count: number; completed: number }>()
  for (const s of sessions) {
    const key = s.scenario
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

  return NextResponse.json({ sessions, objectionStats })
}
