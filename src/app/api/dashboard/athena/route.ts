import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { study_cards, study_reviews, quiz_sessions, mcq_attempts } from '@/db/schema'
import { desc, gte, lte, and, eq, count } from 'drizzle-orm'

function todayStartSecs() {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const tStart = todayStartSecs()
  const endOfToday = tStart + 86400
  const thirtyAgo = tStart - 30 * 86400

  // All cards by module
  const allCards = await db
    .select({ module: study_cards.module, due_at: study_cards.due_at, suspended: study_cards.suspended })
    .from(study_cards)

  const moduleMap = new Map<string, { total: number; due: number }>()
  for (const c of allCards) {
    const entry = moduleMap.get(c.module) ?? { total: 0, due: 0 }
    entry.total++
    if (c.suspended === 0 && c.due_at <= endOfToday) entry.due++
    moduleMap.set(c.module, entry)
  }

  // Reviews last 30 days for mastery per module
  const recentReviews = await db
    .select({ card_id: study_reviews.card_id, quality: study_reviews.quality, reviewed_at: study_reviews.reviewed_at })
    .from(study_reviews)
    .where(gte(study_reviews.reviewed_at, thirtyAgo))

  // Map card_id → module
  const cardModuleRows = await db
    .select({ id: study_cards.id, module: study_cards.module })
    .from(study_cards)
  const cardModule = new Map(cardModuleRows.map(r => [r.id, r.module]))

  const moduleMastery = new Map<string, { total: number; good: number }>()
  let totalReviews = 0
  let goodReviews = 0
  for (const r of recentReviews) {
    totalReviews++
    const mod = cardModule.get(r.card_id) ?? 'Unknown'
    const entry = moduleMastery.get(mod) ?? { total: 0, good: 0 }
    entry.total++
    if (r.quality >= 4) { entry.good++; goodReviews++ }
    moduleMastery.set(mod, entry)
  }

  const masteryPct = totalReviews > 0 ? Math.round(goodReviews / totalReviews * 100) : 0

  // Reviews today
  const [todayRevResult] = await db
    .select({ n: count() }).from(study_reviews).where(gte(study_reviews.reviewed_at, tStart))
  const reviewedToday = todayRevResult?.n ?? 0

  // Build modules array
  const modules = Array.from(moduleMap.entries()).map(([name, { total, due }]) => {
    const m = moduleMastery.get(name) ?? { total: 0, good: 0 }
    return {
      name,
      total,
      due,
      mastery: m.total > 0 ? Math.round(m.good / m.total * 100) : 0,
    }
  }).sort((a, b) => b.due - a.due || a.name.localeCompare(b.name))

  // Last 5 completed quiz sessions
  const recentQuizRows = await db
    .select({
      id: quiz_sessions.id,
      modules: quiz_sessions.modules,
      score: quiz_sessions.score,
      total: quiz_sessions.total,
      completed_at: quiz_sessions.completed_at,
      created_at: quiz_sessions.created_at,
    })
    .from(quiz_sessions)
    .where(lte(quiz_sessions.completed_at, endOfToday))
    .orderBy(desc(quiz_sessions.completed_at))
    .limit(5)

  const recentQuizzes = recentQuizRows
    .filter(r => r.completed_at != null)
    .map(r => ({
      id: r.id,
      date: new Date((r.completed_at ?? r.created_at) * 1000).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short',
      }),
      accuracy: r.total > 0 ? Math.round(r.score / r.total * 100) : 0,
      correct: r.score,
      total: r.total,
      modules: (() => { try { return JSON.parse(r.modules) as string[] } catch { return [] } })(),
    }))

  return NextResponse.json({
    totalCards: allCards.length,
    dueToday: Array.from(moduleMap.values()).reduce((s, e) => s + e.due, 0),
    reviewedToday,
    masteryPct,
    totalReviews,
    modules,
    recentQuizzes,
  })
}
