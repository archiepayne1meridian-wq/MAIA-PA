'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createChart, CandlestickSeries, LineStyle } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, CandlestickData, UTCTimestamp } from 'lightweight-charts'
import type { PortfolioResult, HoldingResult } from '../../../../tools/portfolio'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Extras {
  fxToBase:    number
  isLivePrice: boolean
  price:       number
  prevClose:   number
  currency:    string
}

interface LiveResponse {
  openbbDown: boolean
  portfolio:  PortfolioResult | null
  extras:     Record<string, Extras>
  fetchedAt:  number
  snapshot?:  { total_value: number; holdings_json: string } | null
}

// time is number (UTCTimestamp) for intraday, string ('YYYY-MM-DD') for daily/weekly
interface BarRow {
  time:   number | string
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
}

interface BarsResult {
  bars:       BarRow[]
  isIntraday: boolean
}

interface NewsItem {
  title:     string
  url:       string
  source:    string
  published: string
}

interface WatchlistItem {
  symbol:      string
  name:        string
  added_at:    number
  price:       number | null
  prevClose:   number | null
  currency:    string
  isLivePrice: boolean
}

type Range = '1D' | '1M' | '3M' | '1Y' | '5Y'

// ── Constants ─────────────────────────────────────────────────────────────────

const HOLDINGS_TICKERS = ['MU', 'VWRP', 'VDPG', 'AMAT', 'IONQ', 'MSTR']
const RANGES: Range[]  = ['1D', '1M', '3M', '1Y', '5Y']
const DEFAULT_RANGE: Range = '3M'

const NAMES: Record<string, string> = {
  MU:   'Micron Technology',
  VWRP: 'Vanguard FTSE All-World (Acc)',
  VDPG: 'Vanguard FTSE Dev Asia Pac',
  AMAT: 'Applied Materials',
  IONQ: 'IonQ Inc.',
  MSTR: 'Strategy (MicroStrategy)',
}
const EXCHANGE: Record<string, string> = {
  MU: 'NASDAQ', AMAT: 'NASDAQ', IONQ: 'NYSE', MSTR: 'NASDAQ',
  VWRP: 'LSE', VDPG: 'LSE',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, dp = 2): string {
  return n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

function sign(n: number, dp = 2): string {
  return (n >= 0 ? '+' : '') + fmt(Math.abs(n), dp)
}

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 3600)  return `${Math.round(diff / 60)}m`
  if (diff < 86400) return `${Math.round(diff / 3600)}h`
  return `${Math.round(diff / 86400)}d`
}

function fmtPrice(price: number | null, currency: string): string {
  if (price === null) return '—'
  const sym = currency === 'GBP' ? '£' : (currency === 'USD' ? '$' : currency + ' ')
  return `${sym}${fmt(price)}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DemeterTerminal() {
  const router = useRouter()

  const [live, setLive]             = useState<LiveResponse | null>(null)
  const [selected, setSelected]     = useState<string>('MU')
  const [selectedIsHolding, setSelectedIsHolding] = useState(true)
  const [tab, setTab]               = useState<'research' | 'book'>('research')
  const [range, setRange]           = useState<Range>(DEFAULT_RANGE)
  const [barsResult, setBarsResult] = useState<BarsResult | null>(null)
  const [barsLoading, setBarsLoading] = useState(false)
  const [news, setNews]             = useState<NewsItem[]>([])
  const [error, setError]           = useState<string | null>(null)

  // Watchlist state
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([])
  const [wlLoading, setWlLoading]     = useState(false)
  const [showAddInput, setShowAddInput] = useState(false)
  const [addInput, setAddInput]       = useState('')
  const [addState, setAddState]       = useState<
    | { phase: 'idle' }
    | { phase: 'resolving' }
    | { phase: 'resolved'; symbol: string; name: string; price: number; currency: string }
    | { phase: 'error'; message: string }
    | { phase: 'adding' }
  >({ phase: 'idle' })

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef          = useRef<IChartApi | null>(null)
  const seriesRef         = useRef<ISeriesApi<'Candlestick'> | null>(null)

  // ── Fetch live portfolio ─────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/dashboard/demeter/live')
      .then(r => {
        if (r.status === 401) { router.push('/login'); throw new Error('401') }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<LiveResponse>
      })
      .then(setLive)
      .catch((e: Error) => setError(e.message === '401' ? '' : `Failed to load portfolio: ${e.message}`))
  }, [router])

  // ── Fetch watchlist ──────────────────────────────────────────────────────

  const loadWatchlist = useCallback(() => {
    setWlLoading(true)
    fetch('/api/dashboard/watchlist')
      .then(r => r.json() as Promise<{ items: WatchlistItem[] }>)
      .then(d => setWatchlistItems(d.items ?? []))
      .catch(() => setWatchlistItems([]))
      .finally(() => setWlLoading(false))
  }, [])

  useEffect(() => { loadWatchlist() }, [loadWatchlist])

  // ── Fetch history bars ───────────────────────────────────────────────────

  const loadBars = useCallback((sym: string, r: Range) => {
    setBarsLoading(true)
    setBarsResult(null)
    fetch(`/api/dashboard/demeter/history?symbol=${encodeURIComponent(sym)}&range=${r}`)
      .then(res => res.json() as Promise<{ bars: BarRow[]; isIntraday: boolean; error: boolean; message?: string }>)
      .then(d => {
        if (d.error) {
          setBarsResult({ bars: [], isIntraday: d.isIntraday })
        } else {
          setBarsResult({ bars: d.bars, isIntraday: d.isIntraday })
        }
      })
      .catch(() => setBarsResult({ bars: [], isIntraday: false }))
      .finally(() => setBarsLoading(false))
  }, [])

  // ── Fetch news ───────────────────────────────────────────────────────────

  const loadNews = useCallback((sym: string) => {
    fetch(`/api/dashboard/demeter/news?symbol=${sym}`)
      .then(r => r.json() as Promise<{ items: NewsItem[] }>)
      .then(d => setNews(d.items ?? []))
      .catch(() => setNews([]))
  }, [])

  // Reload bars + news when symbol or range changes
  useEffect(() => {
    loadBars(selected, range)
    loadNews(selected)
  }, [selected, range, loadBars, loadNews])

  // ── Build chart ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!chartContainerRef.current || !barsResult || barsResult.bars.length === 0) return

    // Destroy previous chart instance cleanly before rebuilding.
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; seriesRef.current = null }

    const { bars, isIntraday } = barsResult
    const extras  = live?.extras?.[selected]
    const holding = live?.portfolio?.holdings.find(h => h.ticker === selected)
    const fx      = extras?.fxToBase ?? 1

    // Convert bars to GBP. For intraday, time is already UTCTimestamp (number).
    const gbpBars: CandlestickData[] = bars.map(b => ({
      time:  b.time as CandlestickData['time'],
      open:  Math.round(b.open  * fx * 10000) / 10000,
      high:  Math.round(b.high  * fx * 10000) / 10000,
      low:   Math.round(b.low   * fx * 10000) / 10000,
      close: Math.round(b.close * fx * 10000) / 10000,
    }))

    const chart = createChart(chartContainerRef.current, {
      width:  chartContainerRef.current.clientWidth,
      height: Math.max(360, Math.min(520, chartContainerRef.current.clientHeight || 400)),
      layout: {
        background: { color: '#141921' },
        textColor:  '#99A1AD',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize:   11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.07)' },
      timeScale: {
        borderColor:  'rgba(255,255,255,0.07)',
        timeVisible:  isIntraday, // show HH:MM for intraday
        fixLeftEdge:  true,
        fixRightEdge: true,
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor:        '#5BC08A',
      downColor:      '#E07A5F',
      borderUpColor:  '#5BC08A',
      borderDownColor:'#E07A5F',
      wickUpColor:    '#5BC08A',
      wickDownColor:  '#E07A5F',
    })
    series.setData(gbpBars)

    // Avg-cost entry line — HOLDINGS only (watchlist symbols have no position).
    if (holding && holding.avgCost > 0 && selectedIsHolding) {
      const inProfit = holding.pnl !== null && holding.pnl >= 0
      series.createPriceLine({
        price:            holding.avgCost,
        color:            inProfit ? '#5BC08A' : '#E07A5F',
        lineWidth:        1,
        lineStyle:        LineStyle.Dashed,
        axisLabelVisible: true,
        title:            `avg £${fmt(holding.avgCost)}`,
      })
    }

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.resize(
          chartContainerRef.current.clientWidth,
          Math.max(360, chartContainerRef.current.clientHeight || 400),
        )
      }
    })
    if (chartContainerRef.current) ro.observe(chartContainerRef.current)

    chartRef.current  = chart
    seriesRef.current = series

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barsResult, selected, selectedIsHolding, live?.extras, live?.portfolio])

  // ── Select a symbol (holding or watchlist) ───────────────────────────────

  function selectSymbol(sym: string, isHolding: boolean) {
    setSelected(sym)
    setSelectedIsHolding(isHolding)
    setTab('research')
  }

  // ── Watchlist add flow ───────────────────────────────────────────────────

  async function handleResolve() {
    const sym = addInput.trim().toUpperCase()
    if (!sym) return
    setAddState({ phase: 'resolving' })

    try {
      const res = await fetch(`/api/dashboard/watchlist/resolve?symbol=${encodeURIComponent(sym)}`)
      const d = await res.json() as { found: boolean; symbol: string; name: string; price: number; currency: string; message?: string }
      if (d.found) {
        setAddState({ phase: 'resolved', symbol: d.symbol, name: d.name, price: d.price, currency: d.currency })
      } else {
        setAddState({ phase: 'error', message: d.message ?? `Couldn't resolve ${sym}` })
      }
    } catch {
      setAddState({ phase: 'error', message: 'Network error — try again' })
    }
  }

  async function handleConfirmAdd() {
    if (addState.phase !== 'resolved') return
    const { symbol } = addState
    setAddState({ phase: 'adding' })

    try {
      const res = await fetch('/api/dashboard/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      })
      const d = await res.json() as { ok?: boolean; error?: string; message?: string }

      if (res.ok && d.ok) {
        setAddInput('')
        setAddState({ phase: 'idle' })
        setShowAddInput(false)
        loadWatchlist()
      } else if (d.error === 'already_held') {
        setAddState({ phase: 'error', message: d.message ?? `${symbol} is already in your book` })
      } else if (d.error === 'already_watching') {
        setAddState({ phase: 'error', message: d.message ?? `${symbol} is already on your watchlist` })
      } else {
        setAddState({ phase: 'error', message: d.message ?? 'Failed to add' })
      }
    } catch {
      setAddState({ phase: 'error', message: 'Network error — try again' })
    }
  }

  async function handleRemove(sym: string) {
    try {
      await fetch('/api/dashboard/watchlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym }),
      })
      // If the removed symbol was selected, revert to first holding.
      if (selected === sym) selectSymbol('MU', true)
      loadWatchlist()
    } catch {
      // silent — UI will update on next load
    }
  }

  function cancelAdd() {
    setAddInput('')
    setAddState({ phase: 'idle' })
    setShowAddInput(false)
  }

  // ── Derived state ────────────────────────────────────────────────────────

  const portfolio = live?.portfolio ?? null
  const extras    = live?.extras    ?? {}

  function holdingFor(sym: string): HoldingResult | undefined {
    return portfolio?.holdings.find(h => h.ticker === sym)
  }

  const selectedHolding = selectedIsHolding ? holdingFor(selected) : undefined
  const selectedExtras  = extras[selected]
  const selectedWlItem  = !selectedIsHolding ? watchlistItems.find(w => w.symbol === selected) : undefined

  // For watchlist-selected symbols: derive price/change from the watchlist item
  const wlPrice      = selectedWlItem?.price ?? null
  const wlPrevClose  = selectedWlItem?.prevClose ?? null
  const wlDayChangePct = (wlPrice !== null && wlPrevClose !== null && wlPrevClose > 0)
    ? ((wlPrice - wlPrevClose) / wlPrevClose) * 100 : null
  const wlIsLive     = selectedWlItem?.isLivePrice ?? true
  const wlCurrency   = selectedWlItem?.currency ?? 'USD'
  const wlFx         = selectedExtras?.fxToBase ?? (wlCurrency === 'GBP' ? 1 : null)

  // Market state: data-driven for both holdings and watchlist
  const isLive = selectedIsHolding
    ? (selectedExtras?.isLivePrice ?? true)
    : wlIsLive

  // Ticker tape: holdings only (watchlist items are displayed in the rail)
  const tapeItems = HOLDINGS_TICKERS.map(sym => {
    const h = holdingFor(sym)
    const px = h ? `£${fmt(h.priceBase)}` : '—'
    const ch = h
      ? { text: `${h.dayChangePct >= 0 ? '+' : ''}${fmt(h.dayChangePct, 2)}%`, up: h.dayChangePct >= 0 }
      : { text: '—', up: true }
    return { sym, px, ch }
  })

  const totalPnl    = portfolio && portfolio.totalCost > 0 ? portfolio.totalPnl : null
  const totalPnlPct = (totalPnl !== null && portfolio && portfolio.totalCost > 0)
    ? (totalPnl / portfolio.totalCost) * 100 : null

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <style>{STYLES}</style>
      <div className="dt-app">

        {/* ── Topbar ── */}
        <header className="dt-topbar">
          <div className="dt-brand">
            <div className="dt-badge">D</div>
            <span className="dt-wordmark">DEMETER</span>
          </div>

          <div className="dt-tabs">
            <button className={`dt-tab${tab === 'research' ? ' active' : ''}`} onClick={() => setTab('research')}>Research</button>
            <button className={`dt-tab${tab === 'book'     ? ' active' : ''}`} onClick={() => setTab('book')}>My Book</button>
          </div>

          <button className="dt-back" onClick={() => router.push('/dashboard')}>← MAIA</button>
        </header>

        {/* ── Ticker tape ── */}
        <div className="dt-tape">
          <div className="dt-tape-track">
            {[...tapeItems, ...tapeItems].map((t, i) => (
              <span key={i} className="dt-tape-item">
                <span className="dt-tape-sym">{t.sym}</span>
                <span>{t.px}</span>
                <span className={t.ch.up ? 'dt-up' : 'dt-dn'}>{t.ch.text}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── OpenBB down banner ── */}
        {live?.openbbDown && (
          <div className="dt-banner">
            DATA UNAVAILABLE — showing last snapshot. OpenBB service may be restarting.
          </div>
        )}
        {error && <div className="dt-banner dt-banner-err">{error}</div>}

        {/* ── Main 3-column grid ── */}
        <div className="dt-main">

          {/* ── Left rail: MY BOOK + WATCHLIST ── */}
          <aside className="dt-rail dt-col">

            {/* MY BOOK section */}
            <div className="dt-sec-h">
              <span className="dt-eyebrow">My Book</span>
              <span className="dt-eyebrow dt-num">{HOLDINGS_TICKERS.length}</span>
            </div>
            {HOLDINGS_TICKERS.map(sym => {
              const h   = holdingFor(sym)
              const ext = extras[sym]
              const ch  = h
                ? { text: `${h.dayChangePct >= 0 ? '+' : ''}${fmt(h.dayChangePct, 2)}%`, up: h.dayChangePct >= 0 }
                : { text: '—', up: true }
              const isActive = selected === sym && selectedIsHolding
              return (
                <div
                  key={sym}
                  className={`dt-wl-item${isActive ? ' active' : ''}`}
                  onClick={() => selectSymbol(sym, true)}
                >
                  <div>
                    <div className="dt-wl-sym">{sym}</div>
                    <div className="dt-wl-name">{NAMES[sym]}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="dt-wl-px">{h ? `£${fmt(h.value)}` : '—'}</div>
                    <div className="dt-wl-unit">{h ? `£${fmt(h.priceBase)} /sh` : ''}</div>
                    <div className={`dt-wl-ch ${ch.up ? 'dt-up' : 'dt-dn'}`}>{ch.text}</div>
                    {ext && !ext.isLivePrice && <div className="dt-prev-badge">PREV</div>}
                  </div>
                </div>
              )
            })}

            {/* Divider */}
            <div className="dt-rail-divider" />

            {/* WATCHLIST section */}
            <div className="dt-sec-h">
              <span className="dt-eyebrow">Watchlist</span>
              <button
                className="dt-wl-add-btn"
                onClick={() => { setShowAddInput(v => !v); setAddState({ phase: 'idle' }); setAddInput('') }}
                title="Add ticker"
              >+</button>
            </div>

            {/* Add ticker inline UI */}
            {showAddInput && (
              <div className="dt-add-box">
                {addState.phase === 'idle' || addState.phase === 'resolving' || addState.phase === 'error' ? (
                  <>
                    <div className="dt-add-row">
                      <input
                        className="dt-add-input"
                        value={addInput}
                        onChange={e => { setAddInput(e.target.value); setAddState({ phase: 'idle' }) }}
                        onKeyDown={e => { if (e.key === 'Enter') handleResolve(); if (e.key === 'Escape') cancelAdd() }}
                        placeholder="e.g. NVDA, ISF.L"
                        autoFocus
                      />
                      <button
                        className="dt-add-go"
                        onClick={handleResolve}
                        disabled={addState.phase === 'resolving'}
                      >
                        {addState.phase === 'resolving' ? '…' : '↵'}
                      </button>
                    </div>
                    {addState.phase === 'error' && (
                      <div className="dt-add-err">{addState.message}</div>
                    )}
                  </>
                ) : addState.phase === 'resolved' ? (
                  <div className="dt-add-confirm">
                    <div className="dt-add-preview">
                      <span className="dt-add-sym">{addState.symbol}</span>
                      <span className="dt-add-name">{addState.name}</span>
                      <span className="dt-add-price">{fmtPrice(addState.price, addState.currency)}</span>
                    </div>
                    <div className="dt-add-actions">
                      <button className="dt-add-yes" onClick={handleConfirmAdd}>Add</button>
                      <button className="dt-add-no"  onClick={cancelAdd}>Cancel</button>
                    </div>
                  </div>
                ) : addState.phase === 'adding' ? (
                  <div className="dt-add-err" style={{ color: 'var(--dt-mid)' }}>Adding…</div>
                ) : null}
              </div>
            )}

            {wlLoading && watchlistItems.length === 0 && (
              <div className="dt-wl-empty">Loading…</div>
            )}
            {!wlLoading && watchlistItems.length === 0 && !showAddInput && (
              <div className="dt-wl-empty">No watchlist symbols yet.<br/>Tap + to add a ticker.</div>
            )}

            {watchlistItems.map(w => {
              const ch = (w.price !== null && w.prevClose !== null && w.prevClose > 0)
                ? { text: `${((w.price - w.prevClose) / w.prevClose) >= 0 ? '+' : ''}${fmt(((w.price - w.prevClose) / w.prevClose) * 100, 2)}%`, up: w.price >= w.prevClose }
                : { text: '—', up: true }
              const isActive = selected === w.symbol && !selectedIsHolding
              return (
                <div
                  key={w.symbol}
                  className={`dt-wl-item dt-wl-watch${isActive ? ' active' : ''}`}
                  onClick={() => selectSymbol(w.symbol, false)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dt-wl-sym">{w.symbol}</div>
                    <div className="dt-wl-name" style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="dt-wl-px">{fmtPrice(w.price, w.currency)}</div>
                    <div className={`dt-wl-ch ${ch.up ? 'dt-up' : 'dt-dn'}`}>{ch.text}</div>
                    {!w.isLivePrice && <div className="dt-prev-badge">PREV</div>}
                  </div>
                  <button
                    className="dt-wl-remove"
                    onClick={e => { e.stopPropagation(); handleRemove(w.symbol) }}
                    title={`Remove ${w.symbol}`}
                  >×</button>
                </div>
              )
            })}

            {/* Fetch timestamp */}
            {live && (
              <div className="dt-stamp">
                Updated {new Date(live.fetchedAt * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </aside>

          {/* ── Centre ── */}
          <section className="dt-centre dt-col">

            {/* ── Research view ── */}
            {tab === 'research' && (
              <div>
                {/* Symbol header */}
                <div className="dt-sym-head">
                  <div>
                    <div className="dt-sym-id">{selected}</div>
                    <div className="dt-sym-name">
                      {selectedIsHolding ? (NAMES[selected] ?? selected) : (selectedWlItem?.name ?? selected)}
                      {!selectedIsHolding && (
                        <span className="dt-wl-chip">WATCHLIST</span>
                      )}
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    {selectedIsHolding && selectedHolding ? (
                      <>
                        <div className={`dt-sym-px ${selectedHolding.dayChangePct >= 0 ? 'dt-up' : 'dt-dn'}`}>
                          £{fmt(selectedHolding.priceBase)}
                        </div>
                        <div className={`dt-sym-ch ${selectedHolding.dayChangePct >= 0 ? 'dt-up' : 'dt-dn'}`}>
                          {sign(selectedHolding.dayChange)} ({sign(selectedHolding.dayChangePct)}%)
                        </div>
                      </>
                    ) : !selectedIsHolding && wlPrice !== null ? (
                      <>
                        <div className={`dt-sym-px ${wlDayChangePct !== null && wlDayChangePct >= 0 ? 'dt-up' : 'dt-dn'}`}>
                          {fmtPrice(wlPrice, wlCurrency)}
                        </div>
                        {wlDayChangePct !== null && (
                          <div className={`dt-sym-ch ${wlDayChangePct >= 0 ? 'dt-up' : 'dt-dn'}`}>
                            {wlDayChangePct >= 0 ? '+' : ''}{fmt(wlDayChangePct, 2)}%
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="dt-sym-px">—</div>
                    )}
                  </div>
                </div>

                {/* Market state */}
                <div className="dt-sym-meta">
                  {selectedIsHolding && EXCHANGE[selected] ? `${EXCHANGE[selected]} · GBP · ` : ''}
                  {(selectedExtras || selectedWlItem) ? (
                    <span className={`dt-state-badge ${isLive ? 'live' : 'prev'}`}>
                      {isLive ? 'LIVE' : 'PREV CLOSE'}
                    </span>
                  ) : null}
                  {live ? ` ${new Date(live.fetchedAt * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '—'}
                </div>

                {/* Position badge — HOLDINGS ONLY */}
                {selectedIsHolding && selectedHolding && (
                  <div className="dt-pos-badge">
                    <span className="dt-pb-k">YOUR POSITION</span>
                    {fmt(selectedHolding.quantity, 4)} units
                    {' · '}avg £{fmt(selectedHolding.avgCost)}
                    {selectedHolding.pnl !== null && (
                      <span className={selectedHolding.pnl >= 0 ? 'dt-up' : 'dt-dn'}>
                        {' · '}{selectedHolding.pnl >= 0 ? '+' : ''}£{fmt(Math.abs(selectedHolding.pnl))}
                        {' '}
                        ({selectedHolding.pnl >= 0 ? '+' : ''}
                        {portfolio && portfolio.totalCost > 0
                          ? fmt(((selectedHolding.pnl) / (selectedHolding.quantity * selectedHolding.avgCost)) * 100, 1)
                          : '—'}%)
                      </span>
                    )}
                  </div>
                )}

                {/* Timeframe selector */}
                <div className="dt-range-row">
                  {RANGES.map(r => (
                    <button
                      key={r}
                      className={`dt-range-btn${range === r ? ' active' : ''}`}
                      onClick={() => setRange(r)}
                    >{r}</button>
                  ))}
                </div>

                {/* Chart */}
                <div className="dt-chart-box">
                  {barsLoading && <div className="dt-chart-loading">Loading chart…</div>}
                  {!barsLoading && barsResult !== null && barsResult.bars.length === 0 && (
                    <div className="dt-chart-loading">
                      {range === '1D' ? 'Intraday data not available for this symbol or market is closed' : 'No historical data available'}
                    </div>
                  )}
                  <div
                    ref={chartContainerRef}
                    className="dt-chart"
                    style={{ display: (!barsLoading && barsResult && barsResult.bars.length > 0) ? 'block' : 'none' }}
                  />
                </div>

                {/* Key stats — HOLDINGS ONLY */}
                {selectedIsHolding && selectedHolding && (
                  <>
                    <div className="dt-sec-h" style={{ marginTop: 16 }}>
                      <span className="dt-eyebrow">Key stats</span>
                      <span className="dt-eyebrow dt-num">{selected}</span>
                    </div>
                    <div className="dt-stats-strip">
                      {[
                        ['Current', `£${fmt(selectedHolding.priceBase)}`],
                        ['Prev close', selectedExtras ? `£${fmt(selectedExtras.prevClose * selectedExtras.fxToBase)}` : '—'],
                        ['Qty', fmt(selectedHolding.quantity, 4)],
                        ['Avg cost', `£${fmt(selectedHolding.avgCost)}`],
                        ['Day P&L', `${selectedHolding.dayChange >= 0 ? '+' : ''}£${fmt(selectedHolding.dayChange)}`],
                        ['Day %', `${selectedHolding.dayChangePct >= 0 ? '+' : ''}${fmt(selectedHolding.dayChangePct)}%`],
                        ['Value', `£${fmt(selectedHolding.value)}`],
                        ['Alloc', `${fmt(selectedHolding.allocation, 1)}%`],
                      ].map(([k, v]) => (
                        <div key={k} className="dt-stat">
                          <div className="dt-stat-k">{k}</div>
                          <div className="dt-stat-v">{v}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── My Book view ── */}
            {tab === 'book' && (
              <div>
                <div className="dt-summary">
                  <div className="dt-scard">
                    <div className="dt-scard-k">Account value</div>
                    <div className="dt-scard-v">£{portfolio ? fmt(portfolio.totalValue) : '—'}</div>
                    <div className="dt-scard-s">GBP · live</div>
                  </div>
                  <div className="dt-scard">
                    <div className="dt-scard-k">Total return</div>
                    <div className={`dt-scard-v ${totalPnl !== null && totalPnl >= 0 ? 'dt-up' : 'dt-dn'}`}>
                      {totalPnl !== null ? `${totalPnl >= 0 ? '+' : ''}£${fmt(Math.abs(totalPnl))}` : '—'}
                    </div>
                    <div className={`dt-scard-s ${totalPnlPct !== null && totalPnlPct >= 0 ? 'dt-up' : 'dt-dn'}`}>
                      {totalPnlPct !== null ? `${totalPnlPct >= 0 ? '↗' : '↘'} ${fmt(Math.abs(totalPnlPct), 1)}%` : '—'}
                    </div>
                  </div>
                  <div className="dt-scard">
                    <div className="dt-scard-k">Total cost</div>
                    <div className="dt-scard-v">£{portfolio && portfolio.totalCost > 0 ? fmt(portfolio.totalCost) : '—'}</div>
                    <div className="dt-scard-s">invested</div>
                  </div>
                </div>

                <div className="dt-sec-h">
                  <span className="dt-eyebrow">Holdings</span>
                  <span className="dt-eyebrow dt-num">{portfolio?.holdings.length ?? 0} positions</span>
                </div>
                <table className="dt-table">
                  <thead>
                    <tr>
                      <th className="l">Symbol</th>
                      <th>Qty</th>
                      <th>Value</th>
                      <th>Return</th>
                      <th>Alloc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(portfolio?.holdings ?? [])
                      .slice().sort((a, b) => b.value - a.value)
                      .map(h => {
                        const isHoldingRow = h.pnl !== null
                        const pnlPct = isHoldingRow && h.avgCost > 0
                          ? ((h.pnl!) / (h.quantity * h.avgCost)) * 100 : null
                        const ext = extras[h.ticker]
                        return (
                          <tr
                            key={h.ticker}
                            className="dt-hrow"
                            onClick={() => selectSymbol(h.ticker, true)}
                          >
                            <td className="l">
                              <div className="dt-t-sym">{h.ticker}</div>
                              <div className="dt-t-name">{NAMES[h.ticker] ?? h.ticker}</div>
                              {ext && !ext.isLivePrice && <div className="dt-prev-badge">PREV CLOSE</div>}
                            </td>
                            <td>{fmt(h.quantity, 4)}</td>
                            <td>£{fmt(h.value)}</td>
                            <td className={h.pnl !== null && h.pnl >= 0 ? 'dt-up' : 'dt-dn'}>
                              {h.pnl !== null
                                ? `${h.pnl >= 0 ? '+' : '−'}£${fmt(Math.abs(h.pnl))}${pnlPct !== null ? ` (${pnlPct >= 0 ? '+' : ''}${fmt(pnlPct, 1)}%)` : ''}`
                                : '—'}
                            </td>
                            <td>
                              <div className="dt-alloc">
                                <span>{fmt(h.allocation, 1)}%</span>
                                <div className="dt-alloc-bar">
                                  <div style={{ width: `${h.allocation}%` }} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── News side ── */}
          <aside className="dt-side dt-col">
            <div className="dt-sec-h">
              <span className="dt-eyebrow">News</span>
              <span className="dt-eyebrow dt-num">{selected}</span>
            </div>
            {news.length === 0 && (
              <div className="dt-news-empty">No news available</div>
            )}
            {news.map((item, i) => (
              <a
                key={i}
                href={item.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="dt-news-item"
              >
                <div className="dt-news-h">{item.title}</div>
                <div className="dt-news-m">
                  {item.source} · {timeAgo(item.published)}
                </div>
              </a>
            ))}
          </aside>

        </div>
        <div className="dt-note">DEMETER · read-only · data via OpenBB · no trading</div>
      </div>
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

  :root {
    --dt-bg:     #0D1014;
    --dt-surf:   #141921;
    --dt-raised: #1B212C;
    --dt-r2:     #222a37;
    --dt-bdr:    rgba(255,255,255,.07);
    --dt-hair:   rgba(255,255,255,.05);
    --dt-text:   #E9ECF1;
    --dt-mid:    #99A1AD;
    --dt-dim:    #59616D;
    --dt-acc:    #8AA9F0;
    --dt-acc-d:  #6E8BE0;
    --dt-up:     #5BC08A;
    --dt-dn:     #E07A5F;
    --dt-r:      12px;
    --dt-disp:   'Space Grotesk', system-ui, sans-serif;
    --dt-body:   'Inter', system-ui, sans-serif;
    --dt-mono:   'JetBrains Mono', ui-monospace, monospace;
  }

  .dt-app { display:flex; flex-direction:column; height:100vh; background:var(--dt-bg); color:var(--dt-text); font-family:var(--dt-body); font-size:14px; line-height:1.5; overflow:hidden; -webkit-font-smoothing:antialiased; }
  .dt-num  { font-family:var(--dt-mono); font-variant-numeric:tabular-nums; }
  .dt-eyebrow { font-family:var(--dt-mono); font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:var(--dt-dim); }
  .dt-up { color:var(--dt-up) !important; }
  .dt-dn { color:var(--dt-dn) !important; }

  /* Topbar */
  .dt-topbar { display:flex; align-items:center; gap:18px; padding:13px 22px; border-bottom:1px solid var(--dt-bdr); flex-shrink:0; background:var(--dt-bg); }
  .dt-brand  { display:flex; align-items:center; gap:10px; flex-shrink:0; }
  .dt-badge  { width:30px; height:30px; border-radius:8px; background:var(--dt-acc); color:#0D1014; display:grid; place-items:center; font-family:var(--dt-disp); font-weight:700; font-size:15px; }
  .dt-wordmark { font-family:var(--dt-disp); font-weight:600; font-size:17px; letter-spacing:.16em; }
  .dt-tabs { display:flex; gap:4px; background:var(--dt-surf); border:1px solid var(--dt-bdr); border-radius:100px; padding:3px; flex-shrink:0; margin-left:auto; }
  .dt-tab  { padding:7px 16px; border-radius:100px; font-size:12.5px; color:var(--dt-mid); font-weight:500; background:none; border:none; cursor:pointer; transition:.12s; font-family:var(--dt-body); }
  .dt-tab.active { background:var(--dt-acc); color:#0D1014; }
  .dt-back { font-family:var(--dt-mono); font-size:11px; color:var(--dt-dim); cursor:pointer; background:none; border:none; flex-shrink:0; white-space:nowrap; transition:.12s; }
  .dt-back:hover { color:var(--dt-text); }

  /* Tape */
  .dt-tape { border-bottom:1px solid var(--dt-bdr); overflow:hidden; flex-shrink:0; background:var(--dt-surf); }
  .dt-tape-track { display:inline-flex; gap:28px; padding:9px 0; white-space:nowrap; animation:dt-scroll 38s linear infinite; }
  .dt-tape:hover .dt-tape-track { animation-play-state:paused; }
  .dt-tape-item { font-family:var(--dt-mono); font-size:12px; display:inline-flex; gap:8px; align-items:baseline; }
  .dt-tape-sym { color:var(--dt-text); font-weight:500; }
  @keyframes dt-scroll { from { transform:translateX(0) } to { transform:translateX(-50%) } }

  /* Banner */
  .dt-banner { background:rgba(255,190,50,.08); border-bottom:1px solid rgba(255,190,50,.2); padding:8px 22px; font-family:var(--dt-mono); font-size:11px; color:rgb(255,190,50); letter-spacing:.06em; text-transform:uppercase; flex-shrink:0; }
  .dt-banner-err { background:rgba(224,122,95,.08); border-bottom-color:rgba(224,122,95,.3); color:var(--dt-dn); }

  /* Layout grid */
  .dt-main { flex:1; display:grid; grid-template-columns:210px 1fr 288px; min-height:0; }
  .dt-col  { overflow-y:auto; padding:16px; }
  .dt-rail { border-right:1px solid var(--dt-bdr); }
  .dt-side { border-left:1px solid var(--dt-bdr); }
  .dt-sec-h { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }

  /* Rail divider between My Book and Watchlist */
  .dt-rail-divider { height:1px; background:var(--dt-bdr); margin:14px -16px 14px; }

  /* Watchlist items */
  .dt-wl-item { display:flex; align-items:center; gap:6px; padding:9px 10px; border-radius:9px; cursor:pointer; transition:.12s; margin:0 -4px; }
  .dt-wl-item:hover { background:var(--dt-raised); }
  .dt-wl-item.active { background:var(--dt-raised); box-shadow:inset 2px 0 0 var(--dt-acc); }
  .dt-wl-watch { position:relative; }
  .dt-wl-sym  { font-family:var(--dt-disp); font-weight:600; font-size:13px; }
  .dt-wl-name { font-size:10px; color:var(--dt-dim); margin-top:1px; }
  .dt-wl-px   { font-family:var(--dt-mono); font-size:12px; }
  .dt-wl-unit { font-family:var(--dt-mono); font-size:9px; color:var(--dt-dim); margin-top:1px; }
  .dt-wl-ch   { font-family:var(--dt-mono); font-size:10px; margin-top:1px; }
  .dt-prev-badge { font-family:var(--dt-mono); font-size:8px; letter-spacing:.08em; color:var(--dt-dim); border:1px solid var(--dt-bdr); border-radius:4px; padding:0 4px; text-transform:uppercase; display:inline-block; margin-top:2px; }
  .dt-stamp { font-family:var(--dt-mono); font-size:9px; color:var(--dt-dim); margin-top:16px; padding:0 6px; letter-spacing:.04em; }
  .dt-wl-empty { font-family:var(--dt-mono); font-size:10px; color:var(--dt-dim); padding:8px 6px; line-height:1.6; }

  /* Watchlist + button */
  .dt-wl-add-btn { background:none; border:1px solid var(--dt-bdr); color:var(--dt-dim); border-radius:5px; width:20px; height:20px; line-height:1; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:.12s; padding:0; }
  .dt-wl-add-btn:hover { color:var(--dt-text); border-color:var(--dt-mid); }

  /* Watchlist remove button */
  .dt-wl-remove { background:none; border:none; color:var(--dt-dim); font-size:14px; cursor:pointer; padding:0 2px; line-height:1; opacity:0; transition:.12s; flex-shrink:0; }
  .dt-wl-item:hover .dt-wl-remove { opacity:1; }
  .dt-wl-remove:hover { color:var(--dt-dn); }

  /* Add ticker box */
  .dt-add-box { background:var(--dt-surf); border:1px solid var(--dt-bdr); border-radius:9px; padding:10px; margin-bottom:10px; }
  .dt-add-row { display:flex; gap:6px; }
  .dt-add-input { flex:1; background:var(--dt-raised); border:1px solid var(--dt-bdr); border-radius:6px; padding:6px 10px; color:var(--dt-text); font-family:var(--dt-mono); font-size:12px; outline:none; min-width:0; }
  .dt-add-input:focus { border-color:var(--dt-acc-d); }
  .dt-add-go { background:var(--dt-acc); color:#0D1014; border:none; border-radius:6px; padding:6px 10px; font-family:var(--dt-mono); font-size:12px; cursor:pointer; flex-shrink:0; }
  .dt-add-go:disabled { opacity:.5; cursor:default; }
  .dt-add-err { font-family:var(--dt-mono); font-size:10px; color:var(--dt-dn); margin-top:7px; letter-spacing:.02em; }
  .dt-add-confirm { display:flex; flex-direction:column; gap:8px; }
  .dt-add-preview { display:flex; flex-direction:column; gap:2px; }
  .dt-add-sym  { font-family:var(--dt-disp); font-weight:600; font-size:13px; }
  .dt-add-name { font-size:10px; color:var(--dt-mid); }
  .dt-add-price { font-family:var(--dt-mono); font-size:12px; }
  .dt-add-actions { display:flex; gap:6px; }
  .dt-add-yes { background:var(--dt-acc); color:#0D1014; border:none; border-radius:6px; padding:5px 12px; font-size:12px; cursor:pointer; font-family:var(--dt-body); font-weight:500; }
  .dt-add-no  { background:none; color:var(--dt-mid); border:1px solid var(--dt-bdr); border-radius:6px; padding:5px 12px; font-size:12px; cursor:pointer; font-family:var(--dt-body); }

  /* Chart panel */
  .dt-sym-head { display:flex; align-items:flex-end; gap:16px; margin-bottom:4px; flex-wrap:wrap; }
  .dt-sym-id   { font-family:var(--dt-disp); font-weight:700; font-size:26px; letter-spacing:.02em; }
  .dt-sym-name { color:var(--dt-mid); font-size:13px; margin-bottom:5px; display:flex; align-items:center; gap:8px; }
  .dt-sym-px   { font-family:var(--dt-mono); font-size:26px; font-weight:600; font-variant-numeric:tabular-nums; }
  .dt-sym-ch   { font-family:var(--dt-mono); font-size:14px; margin-bottom:5px; }
  .dt-sym-meta { font-family:var(--dt-mono); font-size:10px; color:var(--dt-dim); margin:6px 0 10px; letter-spacing:.04em; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .dt-state-badge { font-size:9px; letter-spacing:.1em; padding:2px 6px; border-radius:4px; text-transform:uppercase; font-weight:600; }
  .dt-state-badge.live { background:rgba(91,192,138,.15); color:var(--dt-up); border:1px solid rgba(91,192,138,.3); }
  .dt-state-badge.prev { background:rgba(255,190,50,.1); color:rgb(255,190,50); border:1px solid rgba(255,190,50,.25); }

  /* Watchlist chip next to symbol name */
  .dt-wl-chip { font-family:var(--dt-mono); font-size:8px; letter-spacing:.1em; padding:2px 6px; border-radius:4px; text-transform:uppercase; color:var(--dt-acc); border:1px solid rgba(138,169,240,.3); background:rgba(138,169,240,.08); }

  /* Position badge */
  .dt-pos-badge { font-family:var(--dt-mono); font-size:11px; color:var(--dt-mid); background:var(--dt-surf); border:1px solid var(--dt-bdr); border-radius:8px; padding:8px 12px; margin-bottom:12px; display:inline-block; line-height:1.6; }
  .dt-pb-k { font-size:9px; letter-spacing:.1em; color:var(--dt-dim); margin-right:9px; }

  /* Timeframe selector */
  .dt-range-row { display:flex; gap:3px; margin-bottom:10px; }
  .dt-range-btn { background:none; border:1px solid var(--dt-bdr); color:var(--dt-dim); border-radius:6px; padding:4px 10px; font-family:var(--dt-mono); font-size:11px; cursor:pointer; transition:.12s; }
  .dt-range-btn:hover { border-color:var(--dt-mid); color:var(--dt-text); }
  .dt-range-btn.active { background:var(--dt-raised); border-color:var(--dt-acc-d); color:var(--dt-acc); }

  /* Chart */
  .dt-chart-box { background:var(--dt-surf); border:1px solid var(--dt-bdr); border-radius:var(--dt-r); padding:8px 4px 4px; margin-bottom:14px; min-height:380px; position:relative; }
  .dt-chart { width:100%; height:clamp(360px,52vh,520px); }
  .dt-chart-loading { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:var(--dt-mono); font-size:11px; color:var(--dt-dim); letter-spacing:.06em; text-align:center; padding:20px; }

  /* Stats strip */
  .dt-stats-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:var(--dt-bdr); border:1px solid var(--dt-bdr); border-radius:var(--dt-r); overflow:hidden; margin-bottom:16px; }
  .dt-stat { background:var(--dt-surf); padding:11px 13px; }
  .dt-stat-k { font-family:var(--dt-mono); font-size:9px; letter-spacing:.08em; text-transform:uppercase; color:var(--dt-dim); }
  .dt-stat-v { font-family:var(--dt-mono); font-size:13.5px; font-variant-numeric:tabular-nums; margin-top:4px; }

  /* My Book */
  .dt-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px; }
  .dt-scard   { background:var(--dt-surf); border:1px solid var(--dt-bdr); border-radius:var(--dt-r); padding:15px; }
  .dt-scard-k { font-family:var(--dt-mono); font-size:9.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--dt-dim); }
  .dt-scard-v { font-family:var(--dt-mono); font-size:23px; font-weight:600; letter-spacing:-.01em; margin-top:6px; font-variant-numeric:tabular-nums; }
  .dt-scard-s { font-family:var(--dt-mono); font-size:11px; margin-top:3px; }

  /* Table */
  .dt-table { width:100%; border-collapse:collapse; font-size:13px; }
  .dt-table th { font-family:var(--dt-mono); font-size:9.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--dt-dim); text-align:right; padding:8px 12px; border-bottom:1px solid var(--dt-bdr); font-weight:500; }
  .dt-table th.l, .dt-table td.l { text-align:left; }
  .dt-table td { padding:11px 12px; border-bottom:1px solid var(--dt-hair); font-family:var(--dt-mono); font-variant-numeric:tabular-nums; text-align:right; }
  .dt-hrow { cursor:pointer; transition:.12s; }
  .dt-hrow:hover td { background:var(--dt-raised); }
  .dt-t-sym  { font-family:var(--dt-disp); font-weight:600; font-size:13px; text-align:left; }
  .dt-t-name { font-size:10px; color:var(--dt-dim); font-family:var(--dt-body); text-align:left; }
  .dt-alloc  { display:flex; align-items:center; gap:8px; justify-content:flex-end; }
  .dt-alloc-bar { width:54px; height:5px; background:var(--dt-r2); border-radius:5px; overflow:hidden; }
  .dt-alloc-bar div { height:100%; background:var(--dt-acc); border-radius:5px; }

  /* News */
  .dt-news-item  { display:block; padding:11px 0; border-bottom:1px solid var(--dt-hair); text-decoration:none; color:inherit; transition:.1s; }
  .dt-news-item:last-child { border:none; }
  .dt-news-item:hover { opacity:.8; }
  .dt-news-h { font-size:12.5px; line-height:1.4; }
  .dt-news-m { font-family:var(--dt-mono); font-size:9.5px; color:var(--dt-dim); margin-top:4px; letter-spacing:.04em; text-transform:uppercase; }
  .dt-news-empty { font-family:var(--dt-mono); font-size:11px; color:var(--dt-dim); padding:12px 0; }

  /* Footer note */
  .dt-note { position:fixed; bottom:10px; left:50%; transform:translateX(-50%); font-family:var(--dt-mono); font-size:9.5px; color:var(--dt-dim); letter-spacing:.06em; text-transform:uppercase; pointer-events:none; }

  /* Scrollbars */
  .dt-col::-webkit-scrollbar { width:6px; }
  .dt-col::-webkit-scrollbar-thumb { background:var(--dt-r2); border-radius:6px; }

  /* Responsive */
  @media (max-width:1000px) {
    .dt-main { grid-template-columns:1fr; overflow-y:auto; }
    .dt-col  { border:none !important; border-bottom:1px solid var(--dt-bdr) !important; }
    .dt-rail { order:3; }
    .dt-stats-strip { grid-template-columns:repeat(2,1fr); }
    .dt-app { height:auto; min-height:100vh; overflow:auto; }
  }
  @media (prefers-reduced-motion:reduce) { * { animation:none !important; } }
`
