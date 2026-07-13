'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import s from '../dashboard.module.css'

interface VictoriaData {
  bars: Record<string, number | string | boolean>[]
  activeMetrics: string[]
  noDataMetrics: string[]
  targets: Record<string, number | null>
  thisWeekTotals: Record<string, number>
  todayTotals: Record<string, number>
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
  calls: 'Calls',
  connects: 'Connects',
  meetings_booked: 'Meetings Booked',
  meetings_held: 'Meetings Held',
  follow_ups: 'Follow-ups',
  new_prospects: 'New Prospects',
  active_clients: 'Active Clients',
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

function scorecardStatus(totals: Record<string, number>, targets: Record<string, number | null>): 'on-track' | 'mixed' | 'off-track' {
  const checks = Object.entries(targets).filter(([, t]) => t != null).map(([k, t]) => ({
    val: totals[k] ?? 0, target: t!
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

  useEffect(() => {
    fetch('/api/dashboard/victoria')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<VictoriaData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

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

  const { activeMetrics, targets, todayTotals, thisWeekTotals, weeklyScorecardsHistory, dailyBars } = data

  // Best and worst metrics this week
  const metricRatios = activeMetrics
    .filter(m => targets[m] != null)
    .map(m => ({ m, ratio: (thisWeekTotals[m] ?? 0) / (targets[m] ?? 1) }))
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
      <div className={s.victoriaTopStrip}>
        <div className={s.victoriaTopStripInner}>
          {activeMetrics.length > 0 ? (
            activeMetrics.map(m => {
              const val = todayTotals[m] ?? 0
              const weekVal = thisWeekTotals[m] ?? 0
              const tgt = targets[m]
              return (
                <div key={m} className={s.victoriaStatBlock}>
                  <span className={s.victoriaStatName}>{METRIC_LABELS[m] ?? m}</span>
                  <span className={s.victoriaStatVal} style={{ color: statusColor(weekVal, tgt) }}>
                    {val}
                  </span>
                  <span className={s.victoriaStatTarget}>
                    {tgt != null ? `/ ${tgt} target · ${weekVal} this wk` : `${weekVal} this wk`}
                  </span>
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
                      const tgt = targets[m]
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
            const tgt = targets[m]
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
                      {tgt != null && (
                        <ReferenceLine y={tgt} stroke="var(--idle)" strokeDasharray="4 4" strokeWidth={1} />
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
