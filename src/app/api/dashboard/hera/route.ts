import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { reflections, weekly_reviews } from '@/db/schema'
import { desc, gte } from 'drizzle-orm'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const thirtyAgo = Math.floor(Date.now() / 1000) - 30 * 86400

  // Last 5 reflections — deliberately omit the `sentiment` column (internal only)
  const refRows = await db
    .select({
      id: reflections.id,
      body: reflections.body,
      source: reflections.source,
      created_at: reflections.created_at,
    })
    .from(reflections)
    .orderBy(desc(reflections.created_at))
    .limit(5)

  // Streak: distinct days with reflections in last 30 days
  const recentRows = await db
    .select({ created_at: reflections.created_at })
    .from(reflections)
    .where(gte(reflections.created_at, thirtyAgo))
  const distinctDays = new Set(
    recentRows.map(r => {
      const d = new Date(r.created_at * 1000)
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    }),
  )

  // Latest weekly review
  const [weeklyRow] = await db
    .select()
    .from(weekly_reviews)
    .orderBy(desc(weekly_reviews.created_at))
    .limit(1)

  return NextResponse.json({
    reflections: refRows.map(r => ({
      id: r.id,
      body: r.body,
      source: r.source,
      date: new Date(r.created_at * 1000).toLocaleDateString('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short',
      }),
      time: new Date(r.created_at * 1000).toTimeString().slice(0, 5),
    })),
    streak: distinctDays.size,
    weeklyReview: weeklyRow
      ? {
          id: weeklyRow.id,
          summary: weeklyRow.summary,
          periodStart: new Date(weeklyRow.period_start * 1000).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short',
          }),
          periodEnd: new Date(weeklyRow.period_end * 1000).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short',
          }),
        }
      : null,
  })
}
