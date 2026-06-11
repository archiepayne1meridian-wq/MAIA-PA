import { eq, lte, and, gte, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { study_cards, study_reviews, quiz_sessions, mcq_attempts } from '@/db/schema'
import { sm2, GRADE_QUALITY } from './sm2'

export type Grade = keyof typeof GRADE_QUALITY

export interface CardInput {
  module: string
  front: string
  back: string
}

export interface QuizSessionInput {
  modules: string[]
  questions: MCQQuestion[]
}

export interface MCQQuestion {
  q: string
  options: [string, string, string, string]
  correctIndex: number
  explanation: string
  module: string
}

export interface ProgressStats {
  totalCards: number
  masteredCards: number
  masteryPct: number
  dueToday: number
  streakDays: number
  lastQuizScore: { score: number; total: number } | null
}

export interface WeaknessEntry {
  module: string
  mcqAccuracy: number | null
  lapseRate: number | null
  score: number
}

export async function addCards(cards: CardInput[]): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const db = getDb()
  for (const card of cards) {
    db.insert(study_cards).values({
      id: crypto.randomUUID(),
      module: card.module,
      front: card.front,
      back: card.back,
      ef: 2.5,
      interval_days: 0,
      repetitions: 0,
      due_at: now,
      suspended: 0,
      created_at: now,
    }).run()
  }
}

export async function getDueCards(limit: number) {
  const now = Math.floor(Date.now() / 1000)
  return getDb()
    .select()
    .from(study_cards)
    .where(and(lte(study_cards.due_at, now), eq(study_cards.suspended, 0)))
    .orderBy(study_cards.due_at)
    .limit(limit)
}

export async function getCardById(cardId: string) {
  const rows = await getDb()
    .select()
    .from(study_cards)
    .where(eq(study_cards.id, cardId))
    .limit(1)
  return rows[0] ?? null
}

export async function applyReview(cardId: string, grade: Grade): Promise<{ intervalDays: number }> {
  const quality = GRADE_QUALITY[grade]
  const card = await getCardById(cardId)
  if (!card) throw new Error(`Card not found: ${cardId}`)

  const result = sm2(
    { ef: card.ef, intervalDays: card.interval_days, repetitions: card.repetitions },
    quality
  )

  const now = Math.floor(Date.now() / 1000)
  await getDb()
    .update(study_cards)
    .set({
      ef: result.ef,
      interval_days: result.intervalDays,
      repetitions: result.repetitions,
      due_at: result.dueAt,
      last_reviewed_at: now,
    })
    .where(eq(study_cards.id, cardId))

  await getDb().insert(study_reviews).values({
    id: crypto.randomUUID(),
    card_id: cardId,
    quality,
    ef_after: result.ef,
    interval_after: result.intervalDays,
    reviewed_at: now,
  })

  return { intervalDays: result.intervalDays }
}

export async function getMaterialForModule(module: string): Promise<string> {
  const cards = await getDb()
    .select({ front: study_cards.front, back: study_cards.back })
    .from(study_cards)
    .where(and(eq(study_cards.module, module), eq(study_cards.suspended, 0)))
  return cards.map(c => `Q: ${c.front}\nA: ${c.back}`).join('\n\n')
}

export async function getModulesWithCards(): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ module: study_cards.module })
    .from(study_cards)
    .where(eq(study_cards.suspended, 0))
  return rows.map(r => r.module)
}

export async function saveQuizSession(input: QuizSessionInput): Promise<string> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(quiz_sessions).values({
    id,
    modules: JSON.stringify(input.modules),
    questions: JSON.stringify(input.questions),
    current_index: 0,
    score: 0,
    total: input.questions.length,
    created_at: now,
  })
  return id
}

export async function getQuizSession(sessionId: string) {
  const rows = await getDb()
    .select()
    .from(quiz_sessions)
    .where(eq(quiz_sessions.id, sessionId))
    .limit(1)
  if (!rows[0]) return null
  const row = rows[0]
  return {
    ...row,
    modules: JSON.parse(row.modules) as string[],
    questions: JSON.parse(row.questions) as MCQQuestion[],
  }
}

export async function advanceQuizSession(
  sessionId: string,
  qIndex: number,
  correct: boolean,
  question: string,
  module: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const db = getDb()

  await db.insert(mcq_attempts).values({
    id: crypto.randomUUID(),
    session_id: sessionId,
    module,
    question,
    correct: correct ? 1 : 0,
    created_at: now,
  })

  await db
    .update(quiz_sessions)
    .set({
      current_index: qIndex + 1,
      score: correct ? sql`${quiz_sessions.score} + 1` : quiz_sessions.score,
    })
    .where(eq(quiz_sessions.id, sessionId))
}

export async function completeQuizSession(sessionId: string): Promise<void> {
  await getDb()
    .update(quiz_sessions)
    .set({ completed_at: Math.floor(Date.now() / 1000) })
    .where(eq(quiz_sessions.id, sessionId))
}

export async function getProgress(): Promise<ProgressStats> {
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const mastered21dThreshold = now - 21 * 86400

  const allCards = await db.select({ interval_days: study_cards.interval_days }).from(study_cards).where(eq(study_cards.suspended, 0))
  const totalCards = allCards.length
  const masteredCards = allCards.filter(c => c.interval_days >= 21).length
  const masteryPct = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0

  const dueRows = await db
    .select({ id: study_cards.id })
    .from(study_cards)
    .where(and(lte(study_cards.due_at, now), eq(study_cards.suspended, 0)))
  const dueToday = dueRows.length

  // Streak: count consecutive days (UTC) with at least one review, going back from today
  const reviews = await db
    .select({ reviewed_at: study_reviews.reviewed_at })
    .from(study_reviews)
    .orderBy(study_reviews.reviewed_at)
  const reviewDays = new Set(reviews.map(r => Math.floor(r.reviewed_at / 86400)))
  let streakDays = 0
  let checkDay = Math.floor(now / 86400)
  while (reviewDays.has(checkDay)) {
    streakDays++
    checkDay--
  }

  // Last completed quiz score
  const lastSessions = await db
    .select({ score: quiz_sessions.score, total: quiz_sessions.total })
    .from(quiz_sessions)
    .where(sql`${quiz_sessions.completed_at} IS NOT NULL`)
    .orderBy(sql`${quiz_sessions.completed_at} DESC`)
    .limit(1)
  const lastQuizScore = lastSessions[0] ?? null

  return { totalCards, masteredCards, masteryPct, dueToday, streakDays, lastQuizScore }
}

export async function getWeaknessReport(days: number): Promise<WeaknessEntry[]> {
  const db = getDb()
  const since = Math.floor(Date.now() / 1000) - days * 86400

  // MCQ accuracy per module
  const attempts = await db
    .select({
      module: mcq_attempts.module,
      correct: mcq_attempts.correct,
    })
    .from(mcq_attempts)
    .where(gte(mcq_attempts.created_at, since))

  const mcqByModule: Record<string, { correct: number; total: number }> = {}
  for (const a of attempts) {
    if (!mcqByModule[a.module]) mcqByModule[a.module] = { correct: 0, total: 0 }
    mcqByModule[a.module].total++
    if (a.correct) mcqByModule[a.module].correct++
  }

  // Flashcard lapse rate per module (reviews with quality < 3)
  const recentReviews = await db
    .select({
      card_id: study_reviews.card_id,
      quality: study_reviews.quality,
    })
    .from(study_reviews)
    .where(gte(study_reviews.reviewed_at, since))

  const cardModules: Record<string, string> = {}
  const allCardsForLapse = await db.select({ id: study_cards.id, module: study_cards.module }).from(study_cards)
  for (const c of allCardsForLapse) cardModules[c.id] = c.module

  const lapseByModule: Record<string, { lapses: number; total: number }> = {}
  for (const r of recentReviews) {
    const mod = cardModules[r.card_id]
    if (!mod) continue
    if (!lapseByModule[mod]) lapseByModule[mod] = { lapses: 0, total: 0 }
    lapseByModule[mod].total++
    if (r.quality < 3) lapseByModule[mod].lapses++
  }

  // Combine into weakness score (lower accuracy / higher lapse = weaker)
  const modules = new Set([...Object.keys(mcqByModule), ...Object.keys(lapseByModule)])
  const entries: WeaknessEntry[] = []

  for (const module of modules) {
    const mcq = mcqByModule[module]
    const lapse = lapseByModule[module]
    const mcqAccuracy = mcq ? mcq.correct / mcq.total : null
    const lapseRate = lapse ? lapse.lapses / lapse.total : null

    // Combined weakness score (0 = weakest, 1 = strongest)
    const scores: number[] = []
    if (mcqAccuracy !== null) scores.push(mcqAccuracy)
    if (lapseRate !== null) scores.push(1 - lapseRate)
    const score = scores.length > 0 ? scores.reduce((a, b) => a + b) / scores.length : 0.5

    entries.push({ module, mcqAccuracy, lapseRate, score })
  }

  return entries.sort((a, b) => a.score - b.score)
}
