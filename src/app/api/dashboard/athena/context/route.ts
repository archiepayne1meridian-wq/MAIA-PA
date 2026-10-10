import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getR01Progress, listProducts, getProductAvgEase, getTodayStats, getStreakDays } from '../../../../../../tools/athena-db'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [r01, products, avgEase, todayStats, streakDays] = await Promise.all([
      getR01Progress(),
      listProducts(),
      getProductAvgEase(),
      getTodayStats(),
      getStreakDays(),
    ])

    return NextResponse.json({
      r01: {
        totalCards: r01.totalCards,
        dueToday: r01.dueToday,
        masteredCards: r01.masteredCards,
        masteredPct: r01.totalCards > 0 ? Math.round((r01.masteredCards / r01.totalCards) * 100) : 0,
      },
      products: products.map(p => ({
        id: p.id,
        name: p.name,
        avgEaseFactor: avgEase[p.id] ?? null,
        healthy: avgEase[p.id] !== undefined ? avgEase[p.id] > 2.0 : null,
      })),
      today: {
        cardsReviewed: todayStats.cardsReviewed,
        accuracyPct: todayStats.accuracyPct,
        streakDays,
      },
    })
  } catch (err) {
    console.error('[athena/context] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load context' }, { status: 500 })
  }
}
