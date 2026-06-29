'use client'

import { useEffect, useState } from 'react'
import { PanelSkeleton, PanelError } from './PanelShell'
import s from '../../dashboard.module.css'

interface Holding {
  ticker: string
  name?: string
  value: number
  dayChangePct: number
  allocation: number
  pnl: number | null
  currency: string
}

interface Snapshot {
  takenAt: number
  takenAtLabel: string
  baseCurrency: string
  totalValue: number
  totalCost: number
  dayChange: number
  dayChangePct: number
  holdings: Holding[]
}

function fmt(n: number, dp = 2) {
  return n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

function pctColor(n: number) {
  return n > 0 ? 'var(--online)' : n < 0 ? 'var(--alert)' : 'var(--text-dim)'
}

function pctStr(n: number, dp = 2) {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(dp)}%`
}

export default function DemeterPanel() {
  const [data, setData] = useState<{ snapshot: Snapshot | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/demeter')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<{ snapshot: Snapshot | null }>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <PanelError message={`Failed to load DEMETER data (${error})`} />
  if (!data) return <PanelSkeleton />

  if (!data.snapshot) {
    return (
      <div className={s.panelEmpty}>
        No portfolio snapshot yet. Say <strong>"portfolio"</strong> in Slack to run one.
      </div>
    )
  }

  const { snapshot } = data
  const totalPnl = snapshot.totalValue - snapshot.totalCost
  const totalPnlPct = snapshot.totalCost > 0 ? (totalPnl / snapshot.totalCost) * 100 : 0

  return (
    <>
      <div className={s.tiles}>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Total value</div>
          <div className={s.tileBig}>{snapshot.baseCurrency} {fmt(snapshot.totalValue)}</div>
          <div className={s.tileSub}>at last snapshot</div>
        </div>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Day change</div>
          <div className={s.tileBig} style={{ color: pctColor(snapshot.dayChangePct) }}>
            {pctStr(snapshot.dayChangePct)}
          </div>
          <div className={s.tileSub}>{snapshot.baseCurrency} {fmt(snapshot.dayChange)}</div>
        </div>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Total P&amp;L</div>
          <div className={s.tileBig} style={{ color: pctColor(totalPnl) }}>
            {pctStr(totalPnlPct)}
          </div>
          <div className={s.tileSub}>{snapshot.baseCurrency} {fmt(totalPnl)}</div>
        </div>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Snapshot</div>
          <div className={s.tileBig} style={{ fontSize: 13, lineHeight: 1.3 }}>{snapshot.takenAtLabel}</div>
          <div className={s.tileSub}>no live price fetch</div>
        </div>
      </div>

      {snapshot.holdings.length > 0 && (
        <>
          <div className={`${s.eyebrow} ${s.drawerSectionH}`}>My Book</div>
          <div className={s.holdingTable}>
            <div className={s.holdingHeader}>
              <span>Ticker</span>
              <span className={s.holdingRight}>Value ({snapshot.baseCurrency})</span>
              <span className={s.holdingRight}>Day</span>
              <span className={s.holdingRight}>Alloc</span>
            </div>
            {snapshot.holdings
              .slice()
              .sort((a, b) => b.value - a.value)
              .map((h: Holding, i) => (
                <div key={i} className={s.holdingRow}>
                  <span className={s.holdingTicker}>{h.ticker}</span>
                  <span className={s.holdingRight}>{fmt(h.value)}</span>
                  <span
                    className={s.holdingRight}
                    style={{ color: pctColor(h.dayChangePct) }}
                  >
                    {pctStr(h.dayChangePct, 1)}
                  </span>
                  <span className={s.holdingRight} style={{ color: 'var(--text-dim)' }}>
                    {h.allocation.toFixed(1)}%
                  </span>
                </div>
              ))}
          </div>
        </>
      )}
    </>
  )
}
