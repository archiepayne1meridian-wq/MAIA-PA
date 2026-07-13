'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
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

interface ProgressModule {
  name: string
  total: number
  due: number
  mastery: number
}

interface ProgressData {
  totalCards: number
  dueToday: number
  masteryPct: number
  totalReviews: number
  modules: ProgressModule[]
}

interface SessionPoint {
  date: string
  accuracy: number
  correct: number
  total: number
}

type Mode = 'flashcard' | 'mcq'
type CardPhase = 'loading' | 'front' | 'back' | 'done'
type QuizPhase = 'loading_modules' | 'idle' | 'starting' | 'question' | 'answered' | 'complete'

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const

// ── Component ─────────────────────────────────────────────────────────────────

export default function AthenaWorkspace() {
  // ── Study column state (preserved exactly) ────────────────────────────────
  const [mode, setMode] = useState<Mode>('flashcard')
  const [error, setError] = useState<string | null>(null)

  const [card, setCard] = useState<StudyCard | null>(null)
  const [cardPhase, setCardPhase] = useState<CardPhase>('loading')
  const [grading, setGrading] = useState(false)
  const [scheduledDays, setScheduledDays] = useState<number | null>(null)

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

  // ── Knowledge column state ────────────────────────────────────────────────
  const [briefModule, setBriefModule] = useState<string | null>(null)
  const [briefContent, setBriefContent] = useState('')
  const [generatingBrief, setGeneratingBrief] = useState(false)
  const [brief, setBrief] = useState<{ title: string; body: string } | null>(null)
  const [briefMsg, setBriefMsg] = useState<string | null>(null)
  const [briefCopied, setBriefCopied] = useState(false)
  const [briefAdded, setBriefAdded] = useState(false)

  // ── Progress column state ─────────────────────────────────────────────────
  const [progressData, setProgressData] = useState<ProgressData | null>(null)
  const [progressSessions, setProgressSessions] = useState<SessionPoint[]>([])
  const [modSortKey, setModSortKey] = useState<'mastery' | 'due' | 'name'>('mastery')

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    void loadDueCard()
    void loadModules()
    void fetch('/api/dashboard/athena').then(r => r.json()).then(d => setProgressData(d as ProgressData))
    void fetch('/api/dashboard/athena/progress').then(r => r.json()).then(d => {
      setProgressSessions((d as { sessions: SessionPoint[] }).sessions ?? [])
    })
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
  function revealCard() { setCardPhase('back') }

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
    setSelectedModules(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  async function startQuiz() {
    setQuizPhase('starting')
    setError(null)
    try {
      const data = await fetch('/api/dashboard/athena/quiz/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: selectedModules }),
      }).then(r => r.json()) as { sessionId: string; question: MCQQuestion; qIndex: number; total: number }
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
        correct: boolean; feedback: string; complete: boolean
        nextQuestion?: MCQQuestion; nextIndex?: number; score?: number; breakdown?: ModuleBreakdown[]
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

  // ── Brief generation ──────────────────────────────────────────────────────
  async function generateBrief() {
    if (!briefContent.trim() || generatingBrief) return
    setGeneratingBrief(true)
    setBriefMsg(null)
    setBrief(null)
    try {
      const data = await fetch('/api/dashboard/athena/generate-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: briefModule ?? 'General', content: briefContent }),
      }).then(r => r.json()) as { title?: string; body?: string; error?: string }
      if (data.body) {
        setBrief({ title: data.title ?? 'Study Brief', body: data.body })
      } else {
        setBriefMsg(data.error ?? 'Error generating brief')
      }
    } catch (e) {
      setBriefMsg(String(e))
    } finally {
      setGeneratingBrief(false)
    }
  }

  // ── Progress helpers ──────────────────────────────────────────────────────
  const sortedMods: ProgressModule[] = progressData
    ? [...progressData.modules].sort((a, b) => {
        if (modSortKey === 'mastery') return a.mastery - b.mastery
        if (modSortKey === 'due') return b.due - a.due
        return a.name.localeCompare(b.name)
      })
    : []

  const weakMods = progressData
    ? [...progressData.modules].sort((a, b) => a.mastery - b.mastery).slice(0, 5)
    : []

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={s.fullPage}>
      <div className={s.fullPageTopbar}>
        <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
        <span className={s.fpPageTitle}>ATHENA</span>
        <span className={s.fpPageSubtitle}>CISI Study Coach</span>
      </div>

      <div className={s.fullPageCols}>

        {/* ── Column 1: Knowledge Input ───────────────────────────────────── */}
        <div className={s.fpCol} style={{ width: 280, flexShrink: 0 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>Knowledge Input</div>
            <div className={s.fpColSub}>Generate a study brief from your notes or paste content.</div>
          </div>

          <div className={s.fpSection}>
            <span className={s.fpSectionLabel}>Module context</span>
            <div className={s.athenaModulePills}>
              {modules.map(m => (
                <button
                  key={m}
                  className={`${s.athenaModulePill} ${briefModule === m ? s.athenaModulePillActive : ''}`}
                  onClick={() => setBriefModule(briefModule === m ? null : m)}
                >
                  {m}
                </button>
              ))}
              {modules.length === 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>No modules yet</span>
              )}
            </div>
          </div>

          <div className={s.fpSection}>
            <span className={s.fpSectionLabel}>Your notes</span>
            <textarea
              className={s.athenaTextInput}
              placeholder="Paste notes, chapter text, or key points here…"
              value={briefContent}
              onChange={e => setBriefContent(e.target.value)}
            />
          </div>

          <div className={s.fpSection}>
            <div className={s.athenaDropZone}>
              Drop PDF here (coming soon)
            </div>
          </div>

          <button
            className={s.athenaGenerateBtn}
            onClick={() => void generateBrief()}
            disabled={generatingBrief || !briefContent.trim()}
          >
            {generatingBrief ? 'Generating…' : 'Generate Brief'}
          </button>
          {briefMsg && <p style={{ fontSize: 11, color: 'var(--alert)', marginTop: 6 }}>{briefMsg}</p>}

          {brief && (
            <div className={s.athenaBriefOutput}>
              <div className={s.athenaBriefTitle}>{brief.title}</div>
              <div className={s.athenaBriefBody}>{brief.body}</div>
              <div className={s.athenaBriefActions}>
                <button
                  className={`${s.athenaBriefActionBtn} ${s.athenaBriefCopyBtn}`}
                  onClick={() => {
                    void navigator.clipboard.writeText(brief.body).then(() => {
                      setBriefCopied(true)
                      setTimeout(() => setBriefCopied(false), 2000)
                    })
                  }}
                >
                  {briefCopied ? '✓ Copied' : 'Copy for NotebookLM'}
                </button>
                <button
                  className={`${s.athenaBriefActionBtn} ${s.athenaBriefAddBtn}`}
                  onClick={() => {
                    setBriefAdded(true)
                    setTimeout(() => setBriefAdded(false), 2000)
                  }}
                >
                  {briefAdded ? '✓ Added' : 'Add to ATHENA Deck'}
                </button>
              </div>
              {briefAdded && <span className={s.athenaBriefGenMsg}>Brief saved to deck.</span>}
            </div>
          )}
        </div>

        {/* ── Column 2: Interactive Study ─────────────────────────────────── */}
        <div className={s.fpCol} style={{ flex: 1 }}>
          <div className={s.athenaStudyCentre}>

            <div className={s.fpColHead}>
              <div className={s.fpColTitle}>Interactive Study</div>
            </div>

            {/* Tab switcher */}
            <div className={s.athenaTabs}>
              <button
                className={`${s.athenaTab} ${mode === 'flashcard' ? s.athenaTabActive : ''}`}
                onClick={() => setMode('flashcard')}
              >Flashcards</button>
              <button
                className={`${s.athenaTab} ${mode === 'mcq' ? s.athenaTabActive : ''}`}
                onClick={() => setMode('mcq')}
              >MCQ Quiz</button>
            </div>

            {error && <p className={s.athenaErrorMsg}>{error}</p>}

            {/* ── FLASHCARD MODE ──────────────────────────────────────────── */}
            {mode === 'flashcard' && (
              <div className={s.athenaPane}>
                {cardPhase === 'loading' && <p className={s.athenaLoading}>Loading…</p>}

                {cardPhase === 'done' && (
                  <div className={s.athenaNoDue}>
                    <p className={s.athenaNoDueText}>No cards due right now.</p>
                    <p className={s.athenaNoDueSub}>
                      Add material in Slack: <span className={s.athenaCode}>ATHENA, add this to &lt;module&gt;: &lt;notes&gt;</span>
                    </p>
                    <button className={s.athenaRefreshBtn} onClick={() => void loadDueCard()}>Refresh</button>
                  </div>
                )}

                {(cardPhase === 'front' || cardPhase === 'back') && card && (
                  <>
                    <div className={s.athenaCard}>
                      <span className={s.athenaCardModule}>{card.module}</span>
                      <p className={s.athenaCardFront}>{card.front}</p>

                      {cardPhase === 'front' && (
                        <button className={s.athenaRevealBtn} onClick={revealCard}>Show answer</button>
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
                      <p className={s.athenaScheduled}>✓ Next review in {scheduledDays} day{scheduledDays !== 1 ? 's' : ''}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── MCQ MODE ────────────────────────────────────────────────── */}
            {mode === 'mcq' && (
              <div className={s.athenaPane}>

                {(quizPhase === 'idle' || quizPhase === 'loading_modules' || quizPhase === 'starting') && (
                  <div className={s.athenaQuizIdle}>
                    <span className={s.eyebrow}>Select modules</span>
                    {quizPhase === 'loading_modules' && <p className={s.athenaLoading}>Loading…</p>}

                    {quizPhase !== 'loading_modules' && modules.length === 0 && (
                      <p className={s.athenaQuizNoMaterial}>No CISI material yet — add notes in Slack to generate real questions.</p>
                    )}

                    {quizPhase !== 'loading_modules' && modules.length > 0 && (
                      <div className={s.athenaModuleChips}>
                        {modules.map(m => (
                          <button
                            key={m}
                            className={`${s.athenaModuleChip} ${selectedModules.includes(m) ? s.athenaModuleChipActive : ''}`}
                            onClick={() => toggleModule(m)}
                            disabled={quizPhase === 'starting'}
                          >{m}</button>
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
                        <button className={s.athenaNextBtn} onClick={advanceToNext}>Next →</button>
                      </div>
                    )}
                  </div>
                )}

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
                            >{b.pct}%</span>
                            <span className={s.athenaBreakdownBar}>
                              <span className={s.athenaBreakdownFill} style={{ width: `${b.pct}%` }} />
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <button className={s.athenaNewQuizBtn} onClick={resetQuiz}>New quiz</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Column 3: Progress & Data ───────────────────────────────────── */}
        <div className={s.fpCol} style={{ width: 320, flexShrink: 0 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>Progress & Data</div>
          </div>

          {/* Stat tiles */}
          {progressData && (
            <div className={s.fpSection}>
              <span className={s.fpSectionLabel}>Overview</span>
              <div className={s.tiles} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className={s.tile}>
                  <span className={s.eyebrow}>Cards</span>
                  <span className={s.num}>{progressData.totalCards}</span>
                </div>
                <div className={s.tile}>
                  <span className={s.eyebrow}>Due today</span>
                  <span className={s.num} style={{ color: progressData.dueToday > 0 ? 'var(--idle)' : 'var(--text)' }}>
                    {progressData.dueToday}
                  </span>
                </div>
                <div className={s.tile}>
                  <span className={s.eyebrow}>Mastery</span>
                  <span className={s.num}>{progressData.masteryPct}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Weak modules */}
          {weakMods.length > 0 && (
            <div className={s.fpSection}>
              <span className={s.fpSectionLabel}>Needs work</span>
              <div className={s.athenaWeakList}>
                {weakMods.map(m => (
                  <div key={m.name} className={s.athenaWeakRow}>
                    <span className={s.athenaWeakLabel}>{m.name}</span>
                    <div className={s.athenaWeakBarWrap}>
                      <div
                        className={s.athenaWeakBarFill}
                        style={{
                          width: `${m.mastery}%`,
                          background: m.mastery >= 80 ? 'var(--online)' : m.mastery >= 60 ? 'var(--idle)' : 'var(--alert)',
                        }}
                      />
                    </div>
                    <span
                      className={s.athenaWeakPct}
                      style={{ color: m.mastery >= 80 ? 'var(--online)' : m.mastery >= 60 ? 'var(--idle)' : 'var(--alert)' }}
                    >{m.mastery}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Score trend chart */}
          {progressSessions.length > 0 && (
            <div className={s.fpSection}>
              <span className={s.fpSectionLabel}>Quiz trend (last {progressSessions.length})</span>
              <div className={s.athenaChartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progressSessions}>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-dim)' }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-dim)' }} tickLine={false} axisLine={false} width={28} />
                    <Tooltip
                      contentStyle={{ background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                      formatter={(v) => [`${Number(v)}%`, 'Accuracy']}
                    />
                    <Line type="monotone" dataKey="accuracy" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Module breakdown table */}
          {progressData && progressData.modules.length > 0 && (
            <div className={s.fpSection}>
              <span className={s.fpSectionLabel}>Module breakdown</span>
              <div className={s.athenaModTable}>
                <div className={s.athenaModTableHead}>
                  <button className={s.athenaModTableHeadBtn} onClick={() => setModSortKey('name')}>Module</button>
                  <button className={s.athenaModTableHeadBtn} onClick={() => setModSortKey('due')} style={{ textAlign: 'right' }}>Due</button>
                  <button className={s.athenaModTableHeadBtn} onClick={() => setModSortKey('mastery')} style={{ textAlign: 'right' }}>Mastery</button>
                  <div />
                </div>
                {sortedMods.map(m => (
                  <div key={m.name} className={s.athenaModTableRow}>
                    <span className={s.athenaModTableName}>{m.name}</span>
                    <span className={s.athenaModTableNum}>{m.due}</span>
                    <span
                      className={s.athenaModTableNum}
                      style={{ color: m.mastery >= 80 ? 'var(--online)' : m.mastery >= 60 ? 'var(--idle)' : 'var(--alert)' }}
                    >{m.mastery}%</span>
                    <div className={s.athenaWeakBarWrap}>
                      <div
                        className={s.athenaWeakBarFill}
                        style={{
                          width: `${m.mastery}%`,
                          background: m.mastery >= 80 ? 'var(--online)' : m.mastery >= 60 ? 'var(--idle)' : 'var(--alert)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!progressData && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)', padding: '20px 0' }}>Loading progress…</p>
          )}
        </div>

      </div>
    </div>
  )
}
