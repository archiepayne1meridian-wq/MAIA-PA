import type { MCQQuestion } from './study-db'

// Single source of truth for letter↔index mapping.
// All display, scoring, and feedback code imports from here — never inlines its own labels.
export const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const

export function letterFor(index: number): string {
  return OPTION_LABELS[index] ?? String(index)
}

export function scoreAnswer(correctIndex: number, choiceIndex: number): boolean {
  return choiceIndex === correctIndex
}

export function resultFeedback(q: MCQQuestion, choiceIndex: number): string {
  const choseLetter = letterFor(choiceIndex)
  const correctLetter = letterFor(q.correctIndex)
  const correctText = q.options[q.correctIndex] ?? ''
  if (scoreAnswer(q.correctIndex, choiceIndex)) {
    return `✅ Correct. ${q.explanation}`
  }
  return `❌ You picked ${choseLetter}. Correct answer: ${correctLetter}. ${correctText} — ${q.explanation}`
}

export interface QuizSession {
  id: string
  modules: string[]
  questions: MCQQuestion[]
  current_index: number
  score: number
  total: number
  created_at: number
  completed_at: number | null
}

export interface ModuleBreakdown {
  module: string
  correct: number
  total: number
  pct: number
}

export function buildSessionPayload(questions: MCQQuestion[], modules: string[]) {
  return { modules, questions }
}

export function currentQuestion(session: QuizSession): MCQQuestion | null {
  if (isComplete(session)) return null
  return session.questions[session.current_index] ?? null
}

export function isComplete(session: QuizSession): boolean {
  return session.current_index >= session.total
}

export function moduleBreakdown(
  session: QuizSession,
  attempts: { module: string; correct: number }[]
): ModuleBreakdown[] {
  const map: Record<string, { correct: number; total: number }> = {}

  for (const q of session.questions) {
    if (!map[q.module]) map[q.module] = { correct: 0, total: 0 }
    map[q.module].total++
  }

  for (const a of attempts) {
    if (map[a.module]) {
      map[a.module].correct += a.correct
    }
  }

  return Object.entries(map).map(([module, { correct, total }]) => ({
    module,
    correct,
    total,
    pct: total > 0 ? Math.round((correct / total) * 100) : 0,
  }))
}
