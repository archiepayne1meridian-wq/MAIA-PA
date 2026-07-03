// Web adapter — score a quiz answer and advance the session.
// Fully deterministic — no Claude calls.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import {
  getQuizSession,
  advanceQuizSession,
  completeQuizSession,
} from '../../../../../../../../tools/study-db'
import { resultFeedback, currentQuestion, isComplete, moduleBreakdown } from '../../../../../../../../tools/mcq'
import { getDb } from '@/db'
import { mcq_attempts } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sessionId } = await params
  const { qIndex, choiceIndex } = await req.json().catch(() => ({})) as {
    qIndex?: number
    choiceIndex?: number
  }

  if (qIndex === undefined || choiceIndex === undefined) {
    return NextResponse.json({ error: 'qIndex and choiceIndex required' }, { status: 400 })
  }

  const session = await getQuizSession(sessionId)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Concurrency guard — only score the active question
  if (qIndex !== session.current_index) {
    return NextResponse.json({ error: 'Question index mismatch' }, { status: 409 })
  }

  const q = session.questions[qIndex]
  if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  const correct = choiceIndex === q.correctIndex
  const feedback = resultFeedback(q, choiceIndex)

  await advanceQuizSession(sessionId, qIndex, correct, q.q, q.module)

  const updated = await getQuizSession(sessionId)
  const complete = !updated || isComplete(updated)

  if (complete) {
    if (updated) await completeQuizSession(sessionId)

    const attempts = await getDb()
      .select({ module: mcq_attempts.module, correct: mcq_attempts.correct })
      .from(mcq_attempts)
      .where(eq(mcq_attempts.session_id, sessionId))

    const finalSession = updated ?? session
    const breakdown = moduleBreakdown(finalSession, attempts)
    const finalScore = finalSession.score + (correct ? 1 : 0)

    return NextResponse.json({
      correct,
      feedback,
      complete: true,
      score: finalScore,
      total: session.total,
      breakdown,
    })
  }

  const nextQ = currentQuestion(updated)
  return NextResponse.json({
    correct,
    feedback,
    complete: false,
    nextQuestion: nextQ,
    nextIndex: updated.current_index,
  })
}
