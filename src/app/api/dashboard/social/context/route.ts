import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { cassandra_items } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getApprovedStreakDays, getContentMix } from '../../../../../../tools/social-db'

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const today = todayDateString()
    const todaysItems = await getDb().select().from(cassandra_items).where(eq(cassandra_items.date, today))
    const topItem = [...todaysItems].sort((a, b) => {
      if (a.relevance !== b.relevance) return a.relevance === 'high' ? -1 : 1
      return b.created_at - a.created_at
    })[0]

    const [postStreakDays, contentMix] = await Promise.all([getApprovedStreakDays(), getContentMix(30)])

    return NextResponse.json({
      todaysAngle: topItem ? { headline: topItem.title, summary: topItem.summary } : null,
      postStreakDays,
      contentMix,
      styleReminder: [
        'Hook hard. One sentence.',
        "Talk about their life, not your product.",
        'End with a question.',
      ],
    })
  } catch (err) {
    console.error('[social/context] failed:', err)
    return NextResponse.json({ error: 'Failed to load context' }, { status: 500 })
  }
}
