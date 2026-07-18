'use client'

import { useEffect, useState } from 'react'
import s from '../dashboard.module.css'

interface IndexQuote {
  symbol: string
  level: number
  prevClose: number
  dayChangePct: number
}

interface FxQuote {
  pair: string
  rate: number
  prevClose: number
  dayChangePct: number
}

interface HeadlineItem {
  title: string
  digest: string | null
  link: string
  source: string
  section: 'regulatory' | 'headlines'
}

interface BriefData {
  id: string
  type: string
  briefTime: string
  briefDate: string
  indices: IndexQuote[]
  fx: FxQuote[]
  headlines: HeadlineItem[]
  summary: string
}

function pctColor(pct: number): string {
  return pct > 0 ? 'var(--online)' : pct < 0 ? 'var(--alert)' : 'var(--text-dim)'
}

function pctArrow(pct: number): string {
  return pct > 0 ? '▲' : pct < 0 ? '▼' : '—'
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function isMarketOpen(): boolean {
  const now = new Date()
  const day = now.getUTCDay()
  const hour = now.getUTCHours()
  const min = now.getUTCMinutes()
  const mins = hour * 60 + min
  return day >= 1 && day <= 5 && mins >= 480 && mins < 960  // 08:00–16:00 UTC
}

export default function CassandraWorkspace() {
  const [brief, setBrief] = useState<BriefData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [actionMsgs, setActionMsgs] = useState<Record<string, string>>({})

  useEffect(() => { void loadBrief(0) }, [])

  async function loadBrief(off: number) {
    setLoading(true)
    setError(null)
    try {
      const data = await fetch(`/api/dashboard/cassandra?offset=${off}`).then(r => r.json()) as { brief: BriefData | null }
      if (!data.brief) {
        if (off === 0) setBrief(null)
        setHasMore(false)
      } else {
        setBrief(data.brief)
        setOffset(off)
        setHasMore(true)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function sendToIris(item: HeadlineItem) {
    const key = item.link
    try {
      await fetch('/api/dashboard/iris/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.title, url: item.link, source: item.source }),
      })
      setActionMsgs(prev => ({ ...prev, [key]: '→ IRIS sent' }))
      setTimeout(() => setActionMsgs(prev => { const n = { ...prev }; delete n[key]; return n }), 3000)
    } catch {
      setActionMsgs(prev => ({ ...prev, [key]: 'Error' }))
    }
  }

  async function sendToMuse(item: HeadlineItem) {
    const key = `muse_${item.link}`
    try {
      await fetch('/api/dashboard/muse/braindump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${item.title} — ${item.link}`, source: 'cassandra' }),
      })
      setActionMsgs(prev => ({ ...prev, [key]: '→ MUSE sent' }))
      setTimeout(() => setActionMsgs(prev => { const n = { ...prev }; delete n[key]; return n }), 3000)
    } catch {
      setActionMsgs(prev => ({ ...prev, [key]: 'Error' }))
    }
  }

  const allHeadlines = brief?.headlines ?? []
  const marketOpen = isMarketOpen()

  return (
    <div className={s.fullPage}>
      <div className={s.fullPageTopbar}>
        <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
        <span className={s.fpPageTitle}>CASSANDRA</span>
        <span className={s.fpPageSubtitle}>Market & FX Morning Brief</span>
        {brief && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
            {brief.briefDate} · {brief.briefTime}
          </span>
        )}
      </div>

      <div className={s.fullPageCols}>

        {/* ── Panel 1: FX Dashboard (25%) ────────────────────────────────── */}
        <div className={s.fpCol} style={{ width: '25%', flexShrink: 0 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>Markets</div>
          </div>

          <div className={s.fpSection}>
            <span className={s.cassandraMarketStatus}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: marketOpen ? 'var(--online)' : 'var(--text-dim)',
              }} />
              {marketOpen ? 'Open' : 'Closed'}
            </span>
          </div>

          {brief && brief.fx.length > 0 && (
            <div className={s.fpSection}>
              <span className={s.fpSectionLabel}>FX Rates</span>
              {brief.fx.map((q, i) => (
                <div key={q.pair} className={s.cassandraFxEntry}>
                  <span className={s.cassandraFxPairLabel}>{q.pair}</span>
                  <span className={i === 0 ? `${s.cassandraFxBig} ${s.cassandraFxBigPrimary}` : s.cassandraFxBig}>
                    {fmt(q.rate)}
                  </span>
                  <span className={s.cassandraFxChange} style={{ color: pctColor(q.dayChangePct) }}>
                    {pctArrow(q.dayChangePct)} {Math.abs(q.dayChangePct).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {brief && brief.indices.length > 0 && (
            <div className={s.fpSection}>
              <span className={s.fpSectionLabel}>Indices</span>
              {brief.indices.map(q => (
                <div key={q.symbol} className={s.cassandraFxEntry}>
                  <span className={s.cassandraFxPairLabel}>{q.symbol}</span>
                  <span className={s.cassandraFxBig}>{fmt(q.level, 0)}</span>
                  <span className={s.cassandraFxChange} style={{ color: pctColor(q.dayChangePct) }}>
                    {pctArrow(q.dayChangePct)} {Math.abs(q.dayChangePct).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {!brief && !loading && (
            <p className={s.cassandraEmptyBrief}>No brief available yet. The cron runs at 07:35 BST, Mon–Fri.</p>
          )}
          {loading && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)', padding: '16px 0' }}>Loading…</p>
          )}
        </div>

        {/* ── Panel 2: Morning Brief (45%) ─────────────────────────────────── */}
        <div className={s.fpCol} style={{ flex: 1 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>Morning Brief</div>
          </div>

          {error && <p style={{ fontSize: 12, color: 'var(--alert)' }}>{error}</p>}
          {loading && <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</p>}

          {brief && !loading && (
            <>
              {brief.summary ? (
                brief.summary.split('\n').reduce<{ sections: { head: string | null; lines: string[] }[] }>((acc, line) => {
                  if (/^#{1,3}\s/.test(line)) {
                    acc.sections.push({ head: line.replace(/^#+\s*/, ''), lines: [] })
                  } else {
                    const last = acc.sections[acc.sections.length - 1]
                    if (last) last.lines.push(line)
                    else acc.sections.push({ head: null, lines: [line] })
                  }
                  return acc
                }, { sections: [] }).sections.map((sec, i) => (
                  <div key={i} className={s.cassandraSection}>
                    {sec.head && <div className={s.cassandraSectionHead}>{sec.head}</div>}
                    <p className={s.cassandraBriefText}>{sec.lines.join('\n').trim()}</p>
                  </div>
                ))
              ) : (
                <p className={s.cassandraEmptyBrief}>Brief data received but no summary text. Check the CASSANDRA cron.</p>
              )}

              <div className={s.cassandraNavRow}>
                <button
                  className={s.cassandraNavBtn}
                  onClick={() => void loadBrief(offset + 1)}
                  disabled={!hasMore}
                >
                  ← Previous
                </button>
                <span className={s.cassandraNavMeta}>{offset === 0 ? 'Latest' : `${offset} brief${offset > 1 ? 's' : ''} ago`}</span>
                <button
                  className={s.cassandraNavBtn}
                  onClick={() => { if (offset > 0) void loadBrief(offset - 1) }}
                  disabled={offset === 0}
                >
                  Next →
                </button>
              </div>
            </>
          )}

          {!brief && !loading && !error && (
            <p className={s.cassandraEmptyBrief}>
              No brief available yet. The CASSANDRA cron runs at 07:35 BST (Mon–Fri).
              You can also ask in Slack: <em>"CASSANDRA, brief me"</em>
            </p>
          )}
        </div>

        {/* ── Panel 3: Headlines (30%) ──────────────────────────────────────── */}
        <div className={s.fpCol} style={{ width: '30%', flexShrink: 0 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>Headlines</div>
            <div className={s.fpColSub}>Route to IRIS or MUSE for content use.</div>
          </div>

          {allHeadlines.length === 0 && !loading && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)', paddingTop: 16 }}>No headlines in this brief.</p>
          )}

          {allHeadlines.map((item, i) => {
            const irisMsg = actionMsgs[item.link]
            const museMsg = actionMsgs[`muse_${item.link}`]
            return (
              <div key={i} className={s.cassandraHeadItem}>
                <div className={s.cassandraHeadMeta}>
                  <span className={s.cassandraHeadChip}>{item.section === 'regulatory' ? 'REGULATORY' : 'HEADLINES'}</span>
                  <span className={s.cassandraHeadSource}>{item.source}</span>
                </div>
                <p className={s.cassandraHeadDigest}>{item.digest ?? item.title}</p>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={s.cassandraHeadReadMore}
                >
                  Read more →
                </a>
                <div className={s.cassandraHeadActions}>
                  {irisMsg ? (
                    <span className={s.cassandraHeadActionMsg}>{irisMsg}</span>
                  ) : (
                    <button className={s.cassandraHeadActionBtn} onClick={() => void sendToIris(item)}>
                      → IRIS
                    </button>
                  )}
                  {museMsg ? (
                    <span className={s.cassandraHeadActionMsg}>{museMsg}</span>
                  ) : (
                    <button className={s.cassandraHeadActionBtn} onClick={() => void sendToMuse(item)}>
                      → MUSE
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
