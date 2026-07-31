'use client'

import { useEffect, useRef, useState } from 'react'
import s from '../dashboard.module.css'

interface Reflection {
  id: string
  body: string
  source: string
  date: string
  time: string
}

interface WeeklyReview {
  id: string
  summary: string
  periodStart: string
  periodEnd: string
}

interface HeraData {
  reflections: Reflection[]
  streak: number
  weeklyReview: WeeklyReview | null
  weeklyReviews: WeeklyReview[]
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'is', 'was', 'are', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'i', 'me', 'my', 'we', 'our',
  'you', 'your', 'he', 'she', 'it', 'they', 'them', 'this', 'that', 'these', 'those',
  'not', 'no', 'so', 'up', 'out', 'if', 'then', 'about', 'really', 'very', 'just',
  'get', 'got', 'getting', 'like', 'also', 'more', 'some', 'can', 'from', 'what',
  'when', 'how', 'who', 'which', 'there', 'here', 'into', 'by', 'as', 'than', 'been',
  'feel', 'felt', 'feeling', 'today', 'time',
])

const THEME_COLORS = [
  'var(--accent)', 'var(--online)', 'var(--idle)', 'var(--alert)', 'var(--accent-deep)',
  '#9D8EE0', '#60C2A0', '#C8A030', '#D06850', '#7088D0',
]

function extractThemes(reflections: Reflection[]): { word: string; count: number }[] {
  const freq = new Map<string, number>()
  for (const r of reflections) {
    const words = r.body.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
    for (const w of words) {
      if (w.length >= 4 && !STOPWORDS.has(w)) {
        freq.set(w, (freq.get(w) ?? 0) + 1)
      }
    }
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }))
}

// Web Speech API types (not in default TS DOM lib without strictLib config)
type AnyWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionInstance
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechResultEvent) => void) | null
  onerror: ((e: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
}
interface SpeechResultEvent {
  results: { [i: number]: { [j: number]: { transcript: string } } }
}
interface SpeechErrorEvent {
  error: string
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  const win = window as AnyWindow
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
}

export default function HeraWorkspace() {
  const [data, setData] = useState<HeraData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPrevWeeks, setShowPrevWeeks] = useState(false)

  const [reflectionText, setReflectionText] = useState('')
  const [micActive, setMicActive] = useState(false)
  const [voiceUnavailable, setVoiceUnavailable] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [heraResponse, setHeraResponse] = useState<string | null>(null)
  const recogRef = useRef<SpeechRecognitionInstance | null>(null)

  useEffect(() => {
    setVoiceUnavailable(!getSpeechRecognition())
  }, [])

  function refetchData() {
    fetch('/api/dashboard/hera')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<HeraData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }

  useEffect(() => {
    refetchData()
  }, [])

  function handleMic() {
    if (micActive) {
      recogRef.current?.abort()
      recogRef.current = null
      setMicActive(false)
      return
    }

    const SR = getSpeechRecognition()
    if (!SR) {
      setVoiceUnavailable(true)
      return
    }

    setMicActive(true)

    const recog = new SR()
    recog.lang = 'en-GB'
    recog.interimResults = false
    recog.maxAlternatives = 1
    recogRef.current = recog

    recog.onresult = (e) => {
      const transcript = e.results[0][0].transcript
      recogRef.current = null
      setReflectionText(prev => prev.trim() ? `${prev.trim()} ${transcript}` : transcript)
    }

    recog.onerror = (e) => {
      console.warn('[hera] speech error', e.error)
      recogRef.current = null
      setMicActive(false)
      if (e.error === 'not-allowed') setVoiceUnavailable(true)
    }

    recog.onend = () => {
      recogRef.current = null
      setMicActive(false)
    }

    recog.start()
  }

  async function handleSubmitReflection() {
    if (!reflectionText.trim() || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/dashboard/hera/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reflectionText.trim() }),
      })
      const body = await res.json() as { response?: string; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Something went wrong')
      setHeraResponse(body.response ?? null)
      setReflectionText('')
      refetchData()
    } catch {
      setSubmitError('Something went wrong — try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (error) {
    return (
      <div className={s.fullPage}>
        <div className={s.fullPageTopbar}>
          <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
          <span className={s.fpPageTitle}>HERA</span>
        </div>
        <div style={{ padding: 40, color: 'var(--alert)', fontSize: 13 }}>{error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={s.fullPage}>
        <div className={s.fullPageTopbar}>
          <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
          <span className={s.fpPageTitle}>HERA</span>
        </div>
        <div style={{ padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
      </div>
    )
  }

  const themes = extractThemes(data.reflections)
  const latestReview = data.weeklyReviews[0] ?? null
  const prevReviews = data.weeklyReviews.slice(1)
  const maxThemeCount = themes[0]?.count ?? 1

  // Extract focus from weekly review summary (first sentence or first "focus" mention)
  const focusLine = (() => {
    if (!latestReview?.summary) return null
    const match = /focus[:\s]+([^\n.]+)/i.exec(latestReview.summary)
    if (match) return match[1].trim()
    return latestReview.summary.split('.')[0]?.trim() ?? null
  })()

  return (
    <div className={s.fullPage}>
      <div className={s.fullPageTopbar}>
        <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
        <span className={s.fpPageTitle}>HERA</span>
        <span className={s.fpPageSubtitle}>Daily Reflection & Coaching</span>
        {data.streak > 0 && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
            {data.streak} day streak
          </span>
        )}
      </div>

      <div className={s.fullPageCols}>

        {/* ── Panel 1: Weekly Summary (40%) ────────────────────────────────── */}
        <div className={s.fpCol} style={{ width: '40%', flexShrink: 0 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>Weekly Summary</div>
          </div>

          {latestReview ? (
            <>
              <div className={s.heraWeeklySummaryCard}>
                <span className={s.eyebrow} style={{ display: 'block', marginBottom: 10 }}>
                  {latestReview.periodStart} – {latestReview.periodEnd}
                </span>
                <p className={s.heraWeeklySummaryText}>{latestReview.summary}</p>
              </div>

              {focusLine && (
                <div style={{ marginTop: 12 }}>
                  <span className={s.fpSectionLabel}>Key focus</span>
                  <div className={s.heraFocusPill} style={{ marginTop: 8 }}>
                    {focusLine}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '20px 0' }}>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                No weekly review yet. HERA generates a review after you've logged reflections for the week.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
                Reflect in Slack: <em>"HERA, I'm reflecting: [your thoughts]"</em>
              </p>
            </div>
          )}

          {prevReviews.length > 0 && (
            <>
              <button
                className={s.heraPrevWeeksLink}
                onClick={() => setShowPrevWeeks(v => !v)}
              >
                {showPrevWeeks ? '▾' : '▸'} View previous weeks ({prevReviews.length})
              </button>

              {showPrevWeeks && (
                <div className={s.heraPrevWeeksList}>
                  {prevReviews.map(r => (
                    <div key={r.id} className={s.heraPrevWeekItem}>
                      <div className={s.heraPrevWeekDate}>{r.periodStart} – {r.periodEnd}</div>
                      <p className={s.heraPrevWeekText}>{r.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Stat tiles */}
          <div className={s.tiles} style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 20 }}>
            <div className={s.tile}>
              <span className={s.eyebrow}>Reflections</span>
              <span className={s.num}>{data.reflections.length}</span>
            </div>
            <div className={s.tile}>
              <span className={s.eyebrow}>Streak</span>
              <span className={s.num}>{data.streak}d</span>
            </div>
          </div>
        </div>

        {/* ── Panel 2: Themes + Reflection Feed (60%) ──────────────────────── */}
        <div className={s.fpCol} style={{ flex: 1 }}>

          {/* Top 30%: Themes Tracker */}
          {themes.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <div className={s.fpColHead}>
                <div className={s.fpColTitle}>Recurring Themes</div>
                <div className={s.fpColSub}>Extracted from your last {data.reflections.length} reflections.</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {themes.map((t, i) => (
                  <div key={t.word} className={s.heraThemeRow}>
                    <span className={s.heraThemeDot} style={{ background: THEME_COLORS[i % THEME_COLORS.length] }} />
                    <span className={s.heraThemeLabel}>{t.word}</span>
                    <div style={{ flex: 1, height: 3, background: 'var(--raised-2)', borderRadius: 2, margin: '0 12px' }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        width: `${Math.round(t.count / maxThemeCount * 100)}%`,
                        background: THEME_COLORS[i % THEME_COLORS.length],
                      }} />
                    </div>
                    <span className={s.heraThemeMeta}>{t.count}×</span>
                  </div>
                ))}
              </div>

              <div className={s.fpDivider} style={{ margin: '16px 0' }} />
            </div>
          )}

          {/* Bottom 70%: Reflection Feed */}
          <div style={{ flexShrink: 0 }}>
            <span className={s.fpColTitle} style={{ fontSize: 14 }}>Reflection Feed</span>
          </div>

          {data.reflections.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-dim)', paddingTop: 12, lineHeight: 1.65 }}>
              No reflections yet. Start in Slack: <em>"HERA, I'm reflecting: …"</em>
            </p>
          ) : (
            <div className={s.heraReflFeed}>
              {data.reflections.map(r => (
                <div key={r.id} className={s.heraReflEntry}>
                  <div className={s.heraReflMeta}>
                    <span className={s.heraReflDate}>{r.date}</span>
                    <span className={s.heraReflTime}>{r.time}</span>
                    {r.source === 'voice' && (
                      <span className={s.heraReflVoiceChip}>voice</span>
                    )}
                  </div>
                  <p className={s.heraReflBody}>{r.body}</p>
                </div>
              ))}
            </div>
          )}

          {/* Add Reflection */}
          <div className={s.heraReflectInput}>
            <span className={s.eyebrow} style={{ display: 'block', marginBottom: 8 }}>Add Reflection</span>

            {heraResponse && (
              <p className={s.heraReflectResponse}>{heraResponse}</p>
            )}

            <textarea
              style={{ height: 100 }}
              className={s.museBrainDumpInput}
              placeholder="How did today go? Speak or type..."
              value={reflectionText}
              onChange={e => setReflectionText(e.target.value)}
              disabled={submitting}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <button
                className={`${s.heraReflectMic} ${micActive ? s.active : ''}`}
                onClick={handleMic}
                disabled={voiceUnavailable}
                aria-label={micActive ? 'Stop listening' : 'Voice input'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3" />
                </svg>
              </button>
              {micActive && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>Listening...</span>}
              {voiceUnavailable && !micActive && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>Voice unavailable — type instead</span>
              )}
            </div>

            <button
              className={s.museBrainDumpBtn}
              style={{ alignSelf: 'stretch', textAlign: 'center', marginTop: 10, width: '100%' }}
              disabled={submitting || !reflectionText.trim()}
              onClick={() => void handleSubmitReflection()}
            >
              {submitting ? 'Submitting...' : 'Submit Reflection'}
            </button>

            {submitError && (
              <p style={{ fontSize: 11, color: 'var(--alert)', marginTop: 6 }}>{submitError}</p>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
