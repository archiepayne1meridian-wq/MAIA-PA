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

type ImpactLevel = 'direct' | 'watch' | 'awareness'

interface HeadlineItem {
  summary: string
  angle: string | null
  source: string
  url: string | null
  section: string       // e.g. 'pensions' — matches SECTION_COLOR below
  sectionLabel: string  // e.g. 'Pensions & Retirement'
  impact: ImpactLevel | null  // Regulatory / Tax & Legislation items only
}

// Two primary pairs get the larger, prominent display — GBP/USD and GBP/CHF are
// both headline pairs for a Malta/Switzerland-based adviser's client base.
const PRIMARY_FX_PAIRS = new Set(['GBP/USD', 'GBP/CHF'])

const IMPACT_META: Record<ImpactLevel, { emoji: string; label: string; color: string }> = {
  direct:    { emoji: '🔴', label: 'Direct',    color: 'var(--alert)' },
  watch:     { emoji: '🟡', label: 'Watch',     color: 'var(--idle)' },
  awareness: { emoji: '⚪', label: 'Awareness', color: 'var(--text-dim)' },
}

function showsImpact(section: string): boolean {
  return section === 'regulatory' || section === 'tax'
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

// Matches --cassandra-* vars in globals.css and CassandraSectionKey in src/lib/cassandra.ts.
const SECTION_COLOR: Record<string, string> = {
  sector: 'var(--cassandra-sector)',
  pensions: 'var(--cassandra-pensions)',
  tax: 'var(--cassandra-tax)',
  expat: 'var(--cassandra-expat)',
  political: 'var(--cassandra-political)',
  regulatory: 'var(--cassandra-regulatory)',
}

function sectionColor(key: string): string {
  return SECTION_COLOR[key] ?? 'var(--text-dim)'
}

interface GroupedSection {
  section: string
  sectionLabel: string
  items: HeadlineItem[]
}

// Groups the flat headlines array by section, preserving first-appearance order —
// which already matches the backend's canonical section order since headlines_json
// is built by flatMap-ing sections in that order.
function groupBySection(headlines: HeadlineItem[]): GroupedSection[] {
  const order: string[] = []
  const map = new Map<string, HeadlineItem[]>()
  for (const item of headlines) {
    if (!map.has(item.section)) { map.set(item.section, []); order.push(item.section) }
    map.get(item.section)!.push(item)
  }
  return order.map(section => ({
    section,
    sectionLabel: map.get(section)![0]!.sectionLabel,
    items: map.get(section)!,
  }))
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

  async function sendToIris(item: HeadlineItem, key: string) {
    try {
      await fetch('/api/dashboard/iris/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.summary, url: item.url ?? '', source: item.source }),
      })
      setActionMsgs(prev => ({ ...prev, [key]: '→ IRIS sent' }))
      setTimeout(() => setActionMsgs(prev => { const n = { ...prev }; delete n[key]; return n }), 3000)
    } catch {
      setActionMsgs(prev => ({ ...prev, [key]: 'Error' }))
    }
  }

  async function sendToMuse(item: HeadlineItem, key: string) {
    const museKey = `muse_${key}`
    try {
      await fetch('/api/dashboard/muse/braindump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: item.url ? `${item.summary} — ${item.url}` : item.summary, source: 'cassandra' }),
      })
      setActionMsgs(prev => ({ ...prev, [museKey]: '→ MUSE sent' }))
      setTimeout(() => setActionMsgs(prev => { const n = { ...prev }; delete n[museKey]; return n }), 3000)
    } catch {
      setActionMsgs(prev => ({ ...prev, [museKey]: 'Error' }))
    }
  }

  const allHeadlines = brief?.headlines ?? []
  const groupedSections = groupBySection(allHeadlines)
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
              {brief.fx.map(q => (
                <div key={q.pair} className={s.cassandraFxEntry}>
                  <span className={s.cassandraFxPairLabel}>{q.pair}</span>
                  <span className={PRIMARY_FX_PAIRS.has(q.pair) ? `${s.cassandraFxBig} ${s.cassandraFxBigPrimary}` : s.cassandraFxBig}>
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
              {groupedSections.length > 0 ? (
                groupedSections.map(sec => (
                  <div
                    key={sec.section}
                    className={s.cassandraStructSection}
                    style={{ borderLeftColor: sectionColor(sec.section) }}
                  >
                    <div className={s.cassandraStructLabel}>{sec.sectionLabel}</div>
                    {sec.items.map((item, i) => (
                      <div key={i} className={s.cassandraStructItem}>
                        <p className={s.cassandraStructSummary}>
                          {showsImpact(sec.section) && (
                            <>
                              <span className={s.cassandraStructNum}>{i + 1}.</span>
                              {item.impact && (
                                <span
                                  className={s.cassandraImpactChip}
                                  style={{ color: IMPACT_META[item.impact].color, borderColor: IMPACT_META[item.impact].color }}
                                  title={IMPACT_META[item.impact].label}
                                >
                                  {IMPACT_META[item.impact].emoji} {IMPACT_META[item.impact].label}
                                </span>
                              )}
                              {' '}
                            </>
                          )}
                          {item.summary}
                        </p>
                        {item.angle && <p className={s.cassandraStructAngle}>{item.angle}</p>}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <p className={s.cassandraEmptyBrief}>Brief data received but no sections. Check the CASSANDRA cron.</p>
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
            const key = item.url ?? `${item.section}-${i}`
            const irisMsg = actionMsgs[key]
            const museMsg = actionMsgs[`muse_${key}`]
            return (
              <div key={i} className={s.cassandraHeadItem}>
                <div className={s.cassandraHeadMeta}>
                  <span className={s.cassandraHeadChip} style={{ color: sectionColor(item.section) }}>
                    {item.sectionLabel.toUpperCase()}
                  </span>
                  {showsImpact(item.section) && item.impact && (
                    <span
                      className={s.cassandraImpactChip}
                      style={{ color: IMPACT_META[item.impact].color, borderColor: IMPACT_META[item.impact].color }}
                      title={IMPACT_META[item.impact].label}
                    >
                      {IMPACT_META[item.impact].emoji} {IMPACT_META[item.impact].label}
                    </span>
                  )}
                  <span className={s.cassandraHeadSource}>{item.source}</span>
                </div>
                <p className={s.cassandraHeadDigest}>{item.summary}</p>
                {item.angle && <p className={s.cassandraHeadAngle}>{item.angle}</p>}
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={s.cassandraHeadReadMore}
                  >
                    Read more →
                  </a>
                )}
                <div className={s.cassandraHeadActions}>
                  {irisMsg ? (
                    <span className={s.cassandraHeadActionMsg}>{irisMsg}</span>
                  ) : (
                    <button className={s.cassandraHeadActionBtn} onClick={() => void sendToIris(item, key)}>
                      → IRIS
                    </button>
                  )}
                  {museMsg ? (
                    <span className={s.cassandraHeadActionMsg}>{museMsg}</span>
                  ) : (
                    <button className={s.cassandraHeadActionBtn} onClick={() => void sendToMuse(item, key)}>
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
