import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { diana_sessions } from '@/db/schema'
import { desc, gte } from 'drizzle-orm'

function weekStartSecs() {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const wStart = weekStartSecs()

  const weekRows = await db
    .select({
      id: diana_sessions.id,
      scenario: diana_sessions.scenario,
      difficulty: diana_sessions.difficulty,
      status: diana_sessions.status,
      transcript_json: diana_sessions.transcript_json,
      created_at: diana_sessions.created_at,
      ended_at: diana_sessions.ended_at,
    })
    .from(diana_sessions)
    .where(gte(diana_sessions.created_at, wStart))
    .orderBy(desc(diana_sessions.created_at))

  const sessions = weekRows.map(r => {
    let turnCount = 0
    try {
      const t = JSON.parse(r.transcript_json) as { role: string }[]
      turnCount = t.filter(x => x.role === 'user').length
    } catch { /* ignore */ }
    return {
      id: r.id,
      scenario: r.scenario ?? 'General roleplay',
      difficulty: r.difficulty,
      status: r.status,
      turnCount,
      date: new Date(r.created_at * 1000).toLocaleDateString('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short',
      }),
      time: new Date(r.created_at * 1000).toTimeString().slice(0, 5),
    }
  })

  // Last completed session across all time (for context)
  const [lastCompleted] = await db
    .select({
      id: diana_sessions.id,
      scenario: diana_sessions.scenario,
      difficulty: diana_sessions.difficulty,
      transcript_json: diana_sessions.transcript_json,
      ended_at: diana_sessions.ended_at,
    })
    .from(diana_sessions)
    .where(gte(diana_sessions.ended_at, 0))
    .orderBy(desc(diana_sessions.ended_at))
    .limit(1)

  let lastCompletedTurns = 0
  if (lastCompleted) {
    try {
      const t = JSON.parse(lastCompleted.transcript_json) as { role: string }[]
      lastCompletedTurns = t.filter(x => x.role === 'user').length
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    sessions,
    completedThisWeek: sessions.filter(s => s.status === 'ended').length,
    lastCompleted: lastCompleted
      ? {
          scenario: lastCompleted.scenario ?? 'General roleplay',
          difficulty: lastCompleted.difficulty,
          turns: lastCompletedTurns,
          date: lastCompleted.ended_at
            ? new Date(lastCompleted.ended_at * 1000).toLocaleDateString('en-GB', {
                weekday: 'short', day: '2-digit', month: 'short',
              })
            : null,
        }
      : null,
    // Feedback is posted to Slack only — not yet stored in the database.
    // Storage will be added in a future phase.
    feedbackNote: 'Full feedback is delivered to Slack. Database storage coming in a future phase.',
  })
}
