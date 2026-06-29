'use client'

import { useEffect, useState } from 'react'
import { PanelSkeleton, PanelError } from './PanelShell'
import s from '../../dashboard.module.css'

interface IndexQuote { symbol: string; level: number; prevClose: number; dayChangePct: number }
interface FxQuote { pair: string; rate: number; prevClose: number; dayChangePct: number }
interface FeedItem { title: string; link: string; source: string; published?: string }

interface Brief {
  id: string
  type: string
  briefTime: string
  briefDate: string
  indices: IndexQuote[]
  fx: FxQuote[]
  regulatory: FeedItem[]
  news: FeedItem[]
  summary: string
}

function pctColor(pct: number) {
  return pct > 0 ? 'var(--online)' : pct < 0 ? 'var(--alert)' : 'var(--text-dim)'
}

function fmtPct(n: number) {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export default function CassandraPanel() {
  const [data, setData] = useState<{ brief: Brief | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/cassandra')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<{ brief: Brief | null }>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <PanelError message={`Failed to load CASSANDRA data (${error})`} />
  if (!data) return <PanelSkeleton />

  if (!data.brief) {
    return (
      <div className={s.panelEmpty}>
        No brief on record yet. Say <strong>"brief me"</strong> in Slack to run one.
      </div>
    )
  }

  const { brief } = data

  return (
    <>
      <div className={s.briefMeta}>
        <span className={s.eyebrow}>{brief.briefDate} · {brief.briefTime}</span>
        <span className={s.briefTypePill}>{brief.type}</span>
      </div>

      {brief.indices.length > 0 && (
        <>
          <div className={`${s.eyebrow} ${s.drawerSectionH}`}>Indices</div>
          <div className={s.marketGrid}>
            {brief.indices.map((idx: IndexQuote) => (
              <div key={idx.symbol} className={s.marketItem}>
                <div className={s.marketSymbol}>{idx.symbol}</div>
                <div className={s.marketLevel}>{idx.level.toLocaleString('en-GB', { maximumFractionDigits: 1 })}</div>
                <div className={s.marketChange} style={{ color: pctColor(idx.dayChangePct) }}>
                  {fmtPct(idx.dayChangePct)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {brief.fx.length > 0 && (
        <>
          <div className={`${s.eyebrow} ${s.drawerSectionH}`} style={{ marginTop: 18 }}>FX</div>
          <div className={s.fxGrid}>
            {brief.fx.map((f: FxQuote) => (
              <div key={f.pair} className={s.fxRow}>
                <span className={s.fxPair}>{f.pair}</span>
                <span className={s.fxRate}>{f.rate.toFixed(4)}</span>
                <span className={s.fxChange} style={{ color: pctColor(f.dayChangePct) }}>
                  {fmtPct(f.dayChangePct)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {(brief.regulatory.length > 0 || brief.news.length > 0) && (
        <>
          <div className={`${s.eyebrow} ${s.drawerSectionH}`} style={{ marginTop: 18 }}>Headlines</div>
          {brief.regulatory.slice(0, 3).map((item: FeedItem, i) => (
            <div key={i} className={s.headlineItem}>
              <span className={s.headlineSource}>{item.source}</span>
              <a href={item.link} target="_blank" rel="noopener noreferrer" className={s.headlineTitle}>
                {item.title}
              </a>
            </div>
          ))}
          {brief.news.slice(0, 4).map((item: FeedItem, i) => (
            <div key={i} className={s.headlineItem}>
              <span className={s.headlineSource}>{item.source}</span>
              <a href={item.link} target="_blank" rel="noopener noreferrer" className={s.headlineTitle}>
                {item.title}
              </a>
            </div>
          ))}
        </>
      )}

      {brief.summary && (
        <>
          <div className={`${s.eyebrow} ${s.drawerSectionH}`} style={{ marginTop: 18 }}>Summary</div>
          <div className={s.briefSummary}>{brief.summary}</div>
        </>
      )}
    </>
  )
}
