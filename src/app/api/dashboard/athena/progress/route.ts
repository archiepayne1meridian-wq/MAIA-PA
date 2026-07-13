import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { quiz_sessions } from '@/db/schema'
import { desc, isNotNull } from 'drizzle-orm'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const rows = await db
    .select({
      id: quiz_sessions.id,
      score: quiz_sessions.score,
      total: quiz_sessions.total,
      modules: quiz_sessions.modules,
      completed_at: quiz_sessions.completed_at,
    })
    .from(quiz_sessions)
    .where(isNotNull(quiz_sessions.completed_at))
    .orderBy(desc(quiz_sessions.completed_at))
    .limit(20)

  const sessions = rows
    .filter(r => r.completed_at != null)
    .reverse()
    .map(r => ({
      date: new Date((r.completed_at ?? 0) * 1000).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short',
      }),
      accuracy: r.total > 0 ? Math.round(r.score / r.total * 100) : 0,
      correct: r.score,
      total: r.total,
    }))

  return NextResponse.json({ sessions })
}
