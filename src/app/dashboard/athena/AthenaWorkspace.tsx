'use client'

import { useEffect, useState } from 'react'
import s from '../dashboard.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudyCard {
  id: string
  module: string
  front: string
  back: string
  ef: number
  interval_days: number
  repetitions: number
  due_at: number
}

interface MCQQuestion {
  q: string
  options: [string, string, string, string]
  correctIndex: number
  explanation: string
  module: string
}

interface ModuleBreakdown {
  module: string
  correct: number
  total: number
  pct: number
}

type Mode = 'flashcard' | 'mcq'
type CardPhase = 'loading' | 'front' | 'back' | 'done'
type QuizPhase = 'loading_modules' | 'idle' | 'starting' | 'question' | 'answered' | 'complete'

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const

// ── Component ─────────────────────────────────────────────────────────────────

export default function AthenaWorkspace() {
  const [mode, setMode] = useState<Mode>('flashcard')
  const [error, setError] = useState<string | null>(null)

  // ── Flashcard state ───────────────────────────────────────────────────────
  const [card, setCard] = useState<StudyCard | null>(null)
  const [cardPhase, setCardPhase] = useState<CardPhase>('loading')
  const [grading, setGrading] = useState(false)
  const [scheduledDays, setScheduledDays] = useState<number | null>(null)

  // ── MCQ state ─────────────────────────────────────────────────────────────
  const [modules, setModules] = useState<string[]>([])
  const [selectedModules, setSelectedModules] = useState<string[]>([])
  const [quizPhase, setQuizPhase] = useState<QuizPhase>('loading_modules')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentQ, setCurrentQ] = useState<MCQQuestion | null>(null)
  const [nextQData, setNextQData] = useState<{ q: MCQQuestion; idx: number } | null>(null)
  const [qIndex, setQIndex] = useState(0)
  const [total, setTotal] = useState(0)
  const [userChoice, setUserChoice] = useState<number | null>(null)
  const [answerFeedback, setAnswerFeedback] = useState<string | null>(null)
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null)
  const [finalScore, setFinalScore] = useState<number | null>(null)
  const [breakdown, setBreakdown] = useState<ModuleBreakdown[]>([])
  const [submitting, setSubmitting] = useState(false)

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    void loadDueCard()
    void loadModules()
  }, [])

  async function loadDueCard() {
    setCardPhase('loading')
    setScheduledDays(null)
    setError(null)
    try {
      const data = await fetch('/api/dashboard/athena/cards/due').then(r => r.json()) as { card: StudyCard | null }
      setCard(data.card)
      setCardPhase(data.card ? 'front' : 'done')
    } catch (e) {
      setError(String(e))
      setCardPhase('done')
    }
  }

  async function loadModules() {
    try {
      const data = await fetch('/api/dashboard/athena/modules').then(r => r.json()) as { modules: string[] }
      setModules(data.modules)
      setSelectedModules(data.modules)
      setQuizPhase('idle')
    } catch (e) {
      setError(String(e))
      setQuizPhase('idle')
    }
  }

  // ── Flashcard actions ─────────────────────────────────────────────────────
  function revealCard() {
    setCardPhase('back')
  }

  async function gradeCard(grade: 'again' | 'hard' | 'good' | 'easy') {
    if (!card || grading) return
    setGrading(true)
    setError(null)
    try {
      const data = await fetch('/api/dashboard/athena/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id, grade }),
      }).then(r => r.json()) as { intervalDays: number; nextCard: StudyCard | null }

      setScheduledDays(data.intervalDays)
      setTimeout(() => {
        setCard(data.nextCard)
        setCardPhase(data.nextCard ? 'front' : 'done')
        setScheduledDays(null)
        setGrading(false)
      }, 1200)
    } catch (e) {
      setError(String(e))
      setGrading(false)
    }
  }

  // ── MCQ actions ───────────────────────────────────────────────────────────
  function toggleModule(m: string) {
    setSelectedModules(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    )
  }

  async function startQuiz() {
    setQuizPhase('starting')
    setError(null)
    try {
      const data = await fetch('/api/dashboard/athena/quiz/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: selectedModules }),
      }).then(r => r.json()) as {
        sessionId: string
        question: MCQQuestion
        qIndex: number
        total: number
      }
      setSessionId(data.sessionId)
      setCurrentQ(data.question)
      setQIndex(data.qIndex)
      setTotal(data.total)
      setNextQData(null)
      setUserChoice(null)
      setAnswerFeedback(null)
      setWasCorrect(null)
      setQuizPhase('question')
    } catch (e) {
      setError(String(e))
      setQuizPhase('idle')
    }
  }

  async function submitAnswer(choiceIndex: number) {
    if (!sessionId || !currentQ || submitting || userChoice !== null) return
    setSubmitting(true)
    setUserChoice(choiceIndex)
    setError(null)
    try {
      const data = await fetch(`/api/dashboard/athena/quiz/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qIndex, choiceIndex }),
      }).then(r => r.json()) as {
        correct: boolean
        feedback: string
        complete: boolean
        nextQuestion?: MCQQuestion
        nextIndex?: number
        score?: number
        breakdown?: ModuleBreakdown[]
      }
      setWasCorrect(data.correct)
      setAnswerFeedback(data.feedback)
      if (data.complete) {
        setFinalScore(data.score ?? null)
        setBreakdown(data.breakdown ?? [])
        setQuizPhase('complete')
      } else {
        if (data.nextQuestion && data.nextIndex !== undefined) {
          setNextQData({ q: data.nextQuestion, idx: data.nextIndex })
        }
        setQuizPhase('answered')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  function advanceToNext() {
    if (!nextQData) return
    setCurrentQ(nextQData.q)
    setQIndex(nextQData.idx)
    setNextQData(null)
    setUserChoice(null)
    setAnswerFeedback(null)
    setWasCorrect(null)
    setQuizPhase('question')
  }

  function resetQuiz() {
    setQuizPhase('idle')
    setSessionId(null)
    setCurrentQ(null)
    setNextQData(null)
    setUserChoice(null)
    setAnswerFeedback(null)
    setWasCorrect(null)
    setFinalScore(null)
    setBreakdown([])
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={s.athenaWs}>

      {/* Tab switcher */}
      <div className={s.athenaTabs}>
        <button
          className={`${s.athenaTab} ${mode === 'flashcard' ? s.athenaTabActive : ''}`}
          onClick={() => setMode('flashcard')}
        >
          Flashcards
        </button>
        <button
          className={`${s.athenaTab} ${mode === 'mcq' ? s.athenaTabActive : ''}`}
          onClick={() => setMode('mcq')}
        >
          MCQ Quiz
        </button>
      </div>

      {error && <p className={s.athenaErrorMsg}>{error}</p>}

      {/* ── FLASHCARD MODE ─────────────────────────────────────────────────── */}
      {mode === 'flashcard' && (
        <div className={s.athenaPane}>
          {cardPhase === 'loading' && (
            <p className={s.athenaLoading}>Loading…</p>
          )}

          {cardPhase === 'done' && (
            <div className={s.athenaNoDue}>
              <p className={s.athenaNoDueText}>No cards due right now.</p>
              <p className={s.athenaNoDueSub}>
                Add material in Slack: <span className={s.athenaCode}>ATHENA, add this to &lt;module&gt;: &lt;notes&gt;</span>
              </p>
              <button className={s.athenaRefreshBtn} onClick={() => void loadDueCard()}>
                Refresh
              </button>
            </div>
          )}

          {(cardPhase === 'front' || cardPhase === 'back') && card && (
            <>
              <div className={s.athenaCard}>
                <span className={s.athenaCardModule}>{card.module}</span>
                <p className={s.athenaCardFront}>{card.front}</p>

                {cardPhase === 'front' && (
                  <button className={s.athenaRevealBtn} onClick={revealCard}>
                    Show answer
                  </button>
                )}

                {cardPhase === 'back' && (
                  <>
                    <div className={s.athenaCardDivider} />
                    <p className={s.athenaCardBack}>{card.back}</p>
                  </>
                )}
              </div>

              {cardPhase === 'back' && !grading && (
                <div className={s.athenaGradeBtns}>
                  {(['again', 'hard', 'good', 'easy'] as const).map(g => (
                    <button
                      key={g}
                      className={`${s.athenaGradeBtn} ${s[`athenaGradeBtn${g.charAt(0).toUpperCase() + g.slice(1)}` as keyof typeof s]}`}
                      onClick={() => void gradeCard(g)}
                      disabled={grading}
                    >
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                  ))}
                </div>
              )}

              {scheduledDays !== null && (
                <p className={s.athenaScheduled}>
                  ✓ Next review in {scheduledDays} day{scheduledDays !== 1 ? 's' : ''}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── MCQ MODE ────────────────────────────────────────────────────────── */}
      {mode === 'mcq' && (
        <div className={s.athenaPane}>

          {/* IDLE — module picker */}
          {(quizPhase === 'idle' || quizPhase === 'loading_modules' || quizPhase === 'starting') && (
            <div className={s.athenaQuizIdle}>
              <span className={s.eyebrow}>Select modules</span>
              {quizPhase === 'loading_modules' && <p className={s.athenaLoading}>Loading…</p>}

              {quizPhase !== 'loading_modules' && modules.length === 0 && (
                <p className={s.athenaQuizNoMaterial}>
                  No CISI material yet — add notes in Slack to generate real questions.
                </p>
              )}

              {quizPhase !== 'loading_modules' && modules.length > 0 && (
                <div className={s.athenaModuleChips}>
                  {modules.map(m => (
                    <button
                      key={m}
                      className={`${s.athenaModuleChip} ${selectedModules.includes(m) ? s.athenaModuleChipActive : ''}`}
                      onClick={() => toggleModule(m)}
                      disabled={quizPhase === 'starting'}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}

              {quizPhase !== 'loading_modules' && (
                <button
                  className={s.athenaStartQuizBtn}
                  onClick={() => void startQuiz()}
                  disabled={quizPhase === 'starting'}
                >
                  {quizPhase === 'starting' ? 'Starting…' : 'Start quiz'}
                </button>
              )}
            </div>
          )}

          {/* QUESTION */}
          {(quizPhase === 'question' || quizPhase === 'answered') && currentQ && (
            <div className={s.athenaQuestionBlock}>
              <div className={s.athenaQMeta}>
                <span className={s.athenaQCount}>Q{qIndex + 1}/{total}</span>
                <span className={s.athenaQModule}>{currentQ.module}</span>
              </div>
              <p className={s.athenaQText}>{currentQ.q}</p>

              <div className={s.athenaOptions}>
                {currentQ.options.map((opt, i) => {
                  let optClass = s.athenaOption
                  if (quizPhase === 'answered' && userChoice !== null) {
                    if (i === currentQ.correctIndex) optClass = `${s.athenaOption} ${s.athenaOptionCorrect}`
                    else if (i === userChoice && !wasCorrect) optClass = `${s.athenaOption} ${s.athenaOptionWrong}`
                  }
                  return (
                    <button
                      key={i}
                      className={optClass}
                      onClick={() => void submitAnswer(i)}
                      disabled={quizPhase === 'answered' || submitting}
                    >
                      <span className={s.athenaOptionLabel}>{OPTION_LABELS[i]}</span>
                      <span className={s.athenaOptionText}>{opt}</span>
                    </button>
                  )
                })}
              </div>

              {quizPhase === 'answered' && answerFeedback && (
                <div className={`${s.athenaFeedbackRow} ${wasCorrect ? s.athenaFeedbackCorrect : s.athenaFeedbackWrong}`}>
                  <p className={s.athenaFeedbackText}>{answerFeedback}</p>
                  <button className={s.athenaNextBtn} onClick={advanceToNext}>
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* COMPLETE */}
          {quizPhase === 'complete' && (
            <div className={s.athenaScoreBlock}>
              <div className={s.athenaScoreMain}>
                <span className={s.eyebrow}>Quiz complete</span>
                <div className={s.athenaScoreNum}>{finalScore}/{total}</div>
                <div className={s.athenaScorePct}>
                  {total > 0 ? Math.round(((finalScore ?? 0) / total) * 100) : 0}%
                </div>
              </div>

              {breakdown.length > 0 && (
                <div className={s.athenaBreakdown}>
                  <span className={s.eyebrow} style={{ display: 'block', marginBottom: 10 }}>Module breakdown</span>
                  {breakdown.map(b => (
                    <div key={b.module} className={s.athenaBreakdownRow}>
                      <span className={s.athenaBreakdownMod}>{b.module}</span>
                      <span className={s.athenaBreakdownScore}>{b.correct}/{b.total}</span>
                      <span
                        className={s.athenaBreakdownPct}
                        style={{ color: b.pct >= 80 ? 'var(--online)' : b.pct >= 60 ? 'var(--idle)' : 'var(--alert)' }}
                      >
                        {b.pct}%
                      </span>
                      <span className={s.athenaBreakdownBar}>
                        <span className={s.athenaBreakdownFill} style={{ width: `${b.pct}%` }} />
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <button className={s.athenaNewQuizBtn} onClick={resetQuiz}>
                New quiz
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
