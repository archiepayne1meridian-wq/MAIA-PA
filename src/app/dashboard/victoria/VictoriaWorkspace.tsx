'use client'

import { useEffect, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import s from '../dashboard.module.css'

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

interface MetricTarget {
  daily: number | null
  weekly: number | null
}

interface RatioItem {
  key: string
  label: string
  numerator: number
  denominator: number
  value: number | null
}

interface VictoriaData {
  bars: Record<string, number | string | boolean>[]
  activeMetrics: string[]
  noDataMetrics: string[]
  targets: Record<string, MetricTarget>
  thisWeekTotals: Record<string, number>
  todayTotals: Record<string, number>
  weekRatios: RatioItem[]
  todayRatios: RatioItem[]
  weeklyScorecardsHistory: {
    id: string
    weekStart: number
    label: string
    totals: Record<string, number>
    summary: string
  }[]
  dailyBars: Record<string, number | string>[]
}

const METRIC_LABELS: Record<string, string> = {
  prospects_sourced: 'Prospects Sourced',
  green_prospects: 'Green Prospects',
  calls: 'Calls',
  connects: 'Connects',
  meetings_booked: 'Meetings Booked',
  meetings_sat: 'Meetings Sat',
}

// The "primary" target for a metric — daily if it has one (calls/connects/meetings_booked),
// else weekly (prospects_sourced/meetings_sat/meetings_booked), else none (green_prospects).
// Drives the top-strip colour and the Best/Needs-work ranking.
function primaryTarget(t: MetricTarget | undefined): { period: 'daily' | 'weekly' | null; value: number | null } {
  if (!t) return { period: null, value: null }
  if (t.daily != null) return { period: 'daily', value: t.daily }
  if (t.weekly != null) return { period: 'weekly', value: t.weekly }
  return { period: null, value: null }
}

function statusColor(val: number, target: number | null): string {
  if (target == null) return 'var(--text)'
  if (val >= target) return 'var(--online)'
  if (val >= target * 0.7) return 'var(--idle)'
  return 'var(--alert)'
}

function statusDot(val: number, target: number | null): string {
  if (target == null) return ''
  if (val >= target) return '●'
  if (val >= target * 0.7) return '●'
  return '●'
}

// Scorecard-history cards show a whole week's totals, so only weekly targets apply here
// (a daily-only target like calls/connects can't be judged from a single weekly sum).
function scorecardStatus(totals: Record<string, number>, targets: Record<string, MetricTarget>): 'on-track' | 'mixed' | 'off-track' {
  const checks = Object.entries(targets).filter(([, t]) => t?.weekly != null).map(([k, t]) => ({
    val: totals[k] ?? 0, target: t!.weekly!,
  }))
  if (checks.length === 0) return 'mixed'
  const onTrack = checks.filter(c => c.val >= c.target).length
  const pct = onTrack / checks.length
  if (pct >= 0.8) return 'on-track'
  if (pct >= 0.4) return 'mixed'
  return 'off-track'
}

export default function VictoriaWorkspace() {
  const [data, setData] = useState<VictoriaData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedScorecardId, setExpandedScorecardId] = useState<string | null>(null)

  const [localToday, setLocalToday] = useState<Record<string, number>>({})
  const [flashMetric, setFlashMetric] = useState<string | null>(null)
  const [micActive, setMicActive] = useState(false)
  const [voiceUnavailable, setVoiceUnavailable] = useState(false)
  const [voiceConfirm, setVoiceConfirm] = useState<string | null>(null)
  const recogRef = useRef<SpeechRecognitionInstance | null>(null)

  function refetchData() {
    return fetch('/api/dashboard/victoria')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<VictoriaData>
      })
      .then(d => { setData(d); setLocalToday(d.todayTotals) })
      .catch((e: Error) => setError(e.message))
  }

  useEffect(() => {
    void refetchData()
    setVoiceUnavailable(!getSpeechRecognition())
  }, [])

  async function handleIncrement(metric: string) {
    const prevVal = localToday[metric] ?? 0
    setLocalToday(prev => ({ ...prev, [metric]: prevVal + 1 }))
    try {
      const res = await fetch('/api/dashboard/victoria/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metric, increment: 1 }),
      })
      if (!res.ok) throw new Error('log failed')
      await refetchData()
    } catch {
      setLocalToday(prev => ({ ...prev, [metric]: prevVal }))
      setFlashMetric(metric)
      setTimeout(() => setFlashMetric(null), 1200)
    }
  }

  function handleVoiceMic() {
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
      void handleVoiceTranscript(transcript)
    }

    recog.onerror = (e) => {
      console.warn('[victoria] speech error', e.error)
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

  async function handleVoiceTranscript(transcript: string) {
    try {
      const res = await fetch('/api/dashboard/victoria/voice-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      })
      const body = await res.json() as { logged?: { name: string; count: number }[]; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Voice log failed')
      const logged = body.logged ?? []
      if (logged.length === 0) {
        setVoiceConfirm("Didn't catch any numbers — try again")
      } else {
        setVoiceConfirm(`Logged: ${logged.map(l => `${l.count} ${(METRIC_LABELS[l.name] ?? l.name).toLowerCase()}`).join(', ')}`)
        await refetchData()
      }
    } catch {
      setVoiceConfirm('Voice log failed — try again')
    } finally {
      setTimeout(() => setVoiceConfirm(null), 3000)
    }
  }

  if (error) {
    return (
      <div className={s.fullPage}>
        <div className={s.fullPageTopbar}>
          <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
          <span className={s.fpPageTitle}>VICTORIA</span>
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
          <span className={s.fpPageTitle}>VICTORIA</span>
        </div>
        <div style={{ padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
      </div>
    )
  }

  const { activeMetrics, targets, todayTotals, thisWeekTotals, weekRatios, weeklyScorecardsHistory, dailyBars } = data

  // Best and worst metrics this week — ranked against each metric's weekly target where one
  // exists, else its daily target scaled across the week so far (green_prospects has neither
  // and is tracked as a % instead, so it's excluded from this ranking).
  const daysThisWeek = Math.max(1, Object.values(dailyBars).length > 0 ? new Set(dailyBars.map(b => b.date)).size : 1)
  const metricRatios = activeMetrics
    .map(m => {
      const t = targets[m]
      const weeklyEquivalent = t?.weekly ?? (t?.daily != null ? t.daily * daysThisWeek : null)
      return { m, weeklyEquivalent }
    })
    .filter((x): x is { m: string; weeklyEquivalent: number } => x.weeklyEquivalent != null && x.weeklyEquivalent > 0)
    .map(({ m, weeklyEquivalent }) => ({ m, ratio: (thisWeekTotals[m] ?? 0) / weeklyEquivalent }))
    .sort((a, b) => b.ratio - a.ratio)
  const bestMetric = metricRatios[0]
  const worstMetric = metricRatios[metricRatios.length - 1]

  // Streak: consecutive weeks on track
  let streak = 0
  for (const card of weeklyScorecardsHistory) {
    if (scorecardStatus(card.totals, targets) === 'on-track') streak++
    else break
  }

  const latestScorecard = weeklyScorecardsHistory[0]

  return (
    <div className={s.fullPage} style={{ overflow: 'auto' }}>
      <div className={s.fullPageTopbar}>
        <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
        <span className={s.fpPageTitle}>VICTORIA</span>
        <span className={s.fpPageSubtitle}>KPI & Pipeline Tracker</span>
      </div>

      {/* ── Top strip: Today's KPI Snapshot ─────────────────────────────── */}
      <div className={s.victoriaTopStrip} style={{ flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
            {voiceUnavailable ? 'Use + buttons' : 'Log by voice'}
          </span>
          <button
            className={`${s.victoriaVoiceMic} ${micActive ? s.active : ''}`}
            onClick={handleVoiceMic}
            disabled={voiceUnavailable}
            aria-label={micActive ? 'Stop listening' : 'Log by voice'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3" />
            </svg>
          </button>
          {micActive && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>Listening...</span>}
          {voiceConfirm && <span className={s.victoriaVoiceConfirm}>{voiceConfirm}</span>}
        </div>

        <div className={s.victoriaTopStripInner}>
          {activeMetrics.length > 0 ? (
            activeMetrics.map(m => {
              const val = localToday[m] ?? todayTotals[m] ?? 0
              const weekVal = thisWeekTotals[m] ?? 0
              const tgt = targets[m]
              const primary = primaryTarget(tgt)
              const primaryVal = primary.period === 'daily' ? val : weekVal
              const subLabelParts: string[] = []
              if (tgt?.daily != null) subLabelParts.push(`${val}/${tgt.daily} today`)
              if (tgt?.weekly != null) subLabelParts.push(`${weekVal}/${tgt.weekly} wk`)
              const subLabel = subLabelParts.length > 0 ? subLabelParts.join(' · ') : `${weekVal} this wk`
              return (
                <div key={m} className={s.victoriaStatBlock}>
                  <span className={s.victoriaStatName}>{METRIC_LABELS[m] ?? m}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className={s.victoriaStatVal}
                      style={{ color: flashMetric === m ? 'var(--alert)' : statusColor(primaryVal, primary.value) }}
                    >
                      {val}
                    </span>
                    <button className={s.victoriaLogBtn} onClick={() => void handleIncrement(m)} aria-label={`Log one ${METRIC_LABELS[m] ?? m}`}>+</button>
                  </div>
                  <span className={s.victoriaStatTarget}>{subLabel}</span>
                </div>
              )
            })
          ) : (
            <span className={s.victoriaNoDataStrip}>No KPI data logged yet. Post in Slack: "VICTORIA, log: calls=12, connects=5"</span>
          )}
        </div>
      </div>

      {/* ── 3-column body ───────────────────────────────────────────────── */}
      <div className={s.fullPageCols} style={{ overflow: 'auto' }}>

        {/* Column 1: Scorecard History (35%) */}
        <div className={s.fpCol} style={{ width: '35%', flexShrink: 0 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>Scorecard History</div>
            <div className={s.fpColSub}>Click to expand per-metric breakdown.</div>
          </div>

          {weeklyScorecardsHistory.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.65 }}>
              No weekly scorecards yet. The VICTORIA cron runs every Monday.
            </p>
          )}

          {weeklyScorecardsHistory.map(card => {
            const status = scorecardStatus(card.totals, targets)
            const expanded = expandedScorecardId === card.id
            return (
              <div
                key={card.id}
                className={s.victoriaHistCard}
                onClick={() => setExpandedScorecardId(expanded ? null : card.id)}
              >
                <div className={s.victoriaHistCardHead}>
                  <span className={s.victoriaHistDate}>{card.label}</span>
                  <span className={`${s.victoriaHistStatusChip} ${
                    status === 'on-track' ? s.victoriaHistOnTrack :
                    status === 'mixed' ? s.victoriaHistMixed : s.victoriaHistOffTrack
                  }`}>
                    {status === 'on-track' ? 'On track' : status === 'mixed' ? 'Mixed' : 'Off track'}
                  </span>
                </div>
                {expanded && (
                  <div className={s.victoriaHistExpanded}>
                    <div className={s.victoriaHistMetricRow} style={{ opacity: 0.6, fontSize: 9 }}>
                      <span>Metric</span><span style={{ textAlign: 'right' }}>Actual</span><span style={{ textAlign: 'right' }}>Target</span><span />
                    </div>
                    {activeMetrics.map(m => {
                      const val = card.totals[m] ?? 0
                      // A scorecard card is a whole week's totals — only the weekly target applies here.
                      const tgt = targets[m]?.weekly ?? null
                      return (
                        <div key={m} className={s.victoriaHistMetricRow}>
                          <span className={s.victoriaHistMetricName}>{METRIC_LABELS[m] ?? m}</span>
                          <span className={s.victoriaHistMetricNum} style={{ color: statusColor(val, tgt) }}>{val}</span>
                          <span className={s.victoriaHistMetricTarget}>{tgt ?? '—'}</span>
                          <span style={{ color: statusColor(val, tgt), fontSize: 10 }}>{statusDot(val, tgt)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Column 2: Activity Trends (40%) */}
        <div className={s.fpCol} style={{ flex: 1 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>Activity Trends</div>
            <div className={s.fpColSub}>Last 30 days, daily. Dashed line = target.</div>
          </div>

          {dailyBars.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>No daily data in the last 30 days.</p>
          )}

          {activeMetrics.map(m => {
            // This is a per-day chart, so only a daily target draws a reference line here.
            const dailyTgt = targets[m]?.daily ?? null
            return (
              <div key={m} className={s.victoriaTrendSection}>
                <div className={s.victoriaTrendLabel}>{METRIC_LABELS[m] ?? m}</div>
                <div className={s.victoriaTrendChart}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyBars}>
                      <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'var(--text-dim)' }} tickLine={false} axisLine={false} interval={6} />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                        formatter={(v) => [Number(v), METRIC_LABELS[m] ?? m]}
                      />
                      {dailyTgt != null && (
                        <ReferenceLine y={dailyTgt} stroke="var(--idle)" strokeDasharray="4 4" strokeWidth={1} />
                      )}
                      <Line
                        type="monotone"
                        dataKey={m}
                        stroke="var(--accent)"
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })}
        </div>

        {/* Column 3: VICTORIA's Read (25%) */}
        <div className={s.fpCol} style={{ width: '25%', flexShrink: 0 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>VICTORIA's Read</div>
          </div>

          {latestScorecard?.summary ? (
            <div className={s.victoriaInsightCard}>
              <div className={s.fpSectionLabel} style={{ marginBottom: 10 }}>Latest scorecard</div>
              <p className={s.victoriaInsightText}>{latestScorecard.summary}</p>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.65 }}>
              No scorecard summary yet. VICTORIA generates one each Monday.
            </p>
          )}

          <div className={s.victoriaHighlightRow}>
            {bestMetric && (
              <div className={s.victoriaHighlightItem}>
                <span className={s.victoriaHighlightKey}>Best</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--online)' }}>
                  {METRIC_LABELS[bestMetric.m] ?? bestMetric.m}
                  {' '}({Math.round(bestMetric.ratio * 100)}% of target)
                </span>
              </div>
            )}
            {worstMetric && worstMetric.m !== bestMetric?.m && (
              <div className={s.victoriaHighlightItem}>
                <span className={s.victoriaHighlightKey}>Needs work</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--idle)' }}>
                  {METRIC_LABELS[worstMetric.m] ?? worstMetric.m}
                  {' '}({Math.round(worstMetric.ratio * 100)}% of target)
                </span>
              </div>
            )}
            {streak > 0 && (
              <div className={s.victoriaHighlightItem}>
                <span className={s.victoriaHighlightKey}>Streak</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>
                  {streak} wk{streak > 1 ? 's' : ''} on track
                </span>
              </div>
            )}
          </div>

          {/* Funnel ratios — calculated here from raw totals, never entered manually */}
          <div style={{ marginTop: 20 }}>
            <span className={s.fpSectionLabel}>Funnel ratios (this wk)</span>
            <div className={s.victoriaRatioList}>
              {weekRatios.map(r => (
                <div key={r.key} className={s.victoriaRatioRow}>
                  <span className={s.victoriaRatioLabel}>{r.label}</span>
                  <span className={s.victoriaRatioVal}>
                    {r.value !== null ? `${r.value}%` : '—'}
                  </span>
                  <span className={s.victoriaRatioFraction}>{r.numerator}/{r.denominator}</span>
                </div>
              ))}
            </div>
          </div>

          {data.noDataMetrics.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <span className={s.fpSectionLabel}>Not yet tracked</span>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {data.noDataMetrics.map(m => (
                  <span key={m} style={{
                    fontFamily: 'var(--mono)', fontSize: 9.5, padding: '2px 8px',
                    border: '1px solid var(--border)', borderRadius: 100,
                    color: 'var(--text-dim)',
                  }}>{METRIC_LABELS[m] ?? m}</span>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
