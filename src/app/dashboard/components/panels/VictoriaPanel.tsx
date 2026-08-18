'use client'

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Legend,
} from 'recharts'
import { PanelSkeleton, PanelError } from './PanelShell'
import s from '../../dashboard.module.css'

interface BarRow {
  label: string
  weekStart: number
  isCurrent: boolean
  [key: string]: string | number | boolean
}

interface MetricTarget {
  daily: number | null
  weekly: number | null
}

interface VictoriaPanelData {
  bars: BarRow[]
  activeMetrics: string[]
  noDataMetrics: string[]
  targets: Record<string, MetricTarget>
  thisWeekTotals: Record<string, number>
}

// Display names and colors — order matches the funnel in context/victoria.md
const METRIC_META: Record<string, { label: string; color: string }> = {
  prospects_sourced: { label: 'Prospects sourced', color: '#E07A5F' },
  green_prospects:   { label: 'Green prospects',    color: '#C0C05B' },
  calls:             { label: 'Calls',              color: '#8AA9F0' },
  connects:          { label: 'Connects',           color: '#5BC08A' },
  meetings_booked:   { label: 'Meetings booked',    color: '#E0B341' },
  meetings_sat:      { label: 'Meetings sat',       color: '#B07EE0' },
}

export default function VictoriaPanel() {
  const [data, setData] = useState<VictoriaPanelData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/victoria')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<VictoriaPanelData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <PanelError message={`Failed to load VICTORIA data (${error})`} />
  if (!data) return <PanelSkeleton />

  const { bars, activeMetrics, noDataMetrics, targets, thisWeekTotals } = data

  const hasAnyData = activeMetrics.length > 0 && bars.length > 0

  return (
    <>
      {/* This-week summary row */}
      <div className={s.kpiSummaryRow}>
        {activeMetrics.map(m => {
          const meta = METRIC_META[m] ?? { label: m, color: '#8AA9F0' }
          const val = thisWeekTotals[m] ?? 0
          // This-week summary row shows weekly totals — only a weekly target is comparable here.
          const target = targets[m]?.weekly ?? null
          const isOnTrack = target != null && val >= target
          const isBelow = target != null && val < target
          return (
            <div key={m} className={s.kpiSummaryItem}>
              <span className={s.kpiMetricDot} style={{ background: meta.color }} />
              <span className={s.kpiMetricLabel}>{meta.label}</span>
              <span
                className={s.kpiMetricVal}
                style={{ color: isOnTrack ? 'var(--online)' : isBelow ? 'var(--idle)' : 'var(--text)' }}
              >
                {val}{target != null ? `/${target}` : ''}
              </span>
            </div>
          )
        })}
      </div>

      {hasAnyData ? (
        <>
          <div className={`${s.eyebrow} ${s.drawerSectionH}`}>Weekly activity</div>
          <div className={s.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} barGap={2} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontFamily: 'var(--mono)', fontSize: 9, fill: '#59616D' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontFamily: 'var(--mono)', fontSize: 9, fill: '#59616D' }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1B212C',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 8,
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: '#E9ECF1',
                  }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                {activeMetrics.length > 1 && (
                  <Legend
                    wrapperStyle={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#59616D' }}
                  />
                )}
                {activeMetrics.map(m => {
                  const meta = METRIC_META[m] ?? { label: m, color: '#8AA9F0' }
                  return (
                    <Bar
                      key={m}
                      dataKey={m}
                      name={meta.label}
                      fill={meta.color}
                      radius={[3, 3, 0, 0]}
                      fillOpacity={0.85}
                    />
                  )
                })}
                {/* Target reference line — meetings_booked is the funnel's headline weekly target
                    (calls/connects are daily-only targets and have no weekly line to draw here) */}
                {targets.meetings_booked?.weekly != null && activeMetrics.includes('meetings_booked') && (
                  <ReferenceLine
                    y={targets.meetings_booked.weekly}
                    stroke="#E07A5F"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{
                      value: `Target ${targets.meetings_booked.weekly}`,
                      position: 'insideTopRight',
                      fontFamily: 'var(--mono)',
                      fontSize: 9,
                      fill: '#E07A5F',
                    }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className={s.panelEmpty}>
          No KPI data yet. Log your first tally in Slack: <strong>&quot;8 calls, 2 meetings booked&quot;</strong>
        </div>
      )}

      {noDataMetrics.length > 0 && (
        <div className={s.noDataMetrics}>
          <span className={s.eyebrow}>No data yet · </span>
          {noDataMetrics.map(m => METRIC_META[m]?.label ?? m).join(' · ')}
        </div>
      )}
    </>
  )
}
