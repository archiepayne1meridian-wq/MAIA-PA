'use client'

import { useEffect, useState } from 'react'
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

export default function HeraWorkspace() {
  const [data, setData] = useState<HeraData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPrevWeeks, setShowPrevWeeks] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard/hera')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<HeraData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

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
        </div>

      </div>
    </div>
  )
}
