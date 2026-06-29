import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { holdings as holdingsTable, watchlist as watchlistTable } from '@/db/schema'
import { providerSymbol } from '../../../../../../tools/market-data'

type Range = '1D' | '1M' | '3M' | '1Y' | '5Y'

interface RangeCfg {
  interval:   string
  offsetDays: number
  isIntraday: boolean
}

const RANGE_CFG: Record<Range, RangeCfg> = {
  '1D': { interval: '5m',  offsetDays: 2,    isIntraday: true  },
  '1M': { interval: '1d',  offsetDays: 31,   isIntraday: false },
  '3M': { interval: '1d',  offsetDays: 92,   isIntraday: false },
  '1Y': { interval: '1d',  offsetDays: 365,  isIntraday: false },
  '5Y': { interval: '1wk', offsetDays: 1826, isIntraday: false },
}

function isoDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  return d.toISOString().split('T')[0]!
}

// Parse a datetime string to unix seconds. If it includes timezone info, Date.parse
// handles it; naive strings (no tz) are treated as UTC.
function toUnixSec(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000)
}

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase().trim() ?? ''
  const rangeParam = (req.nextUrl.searchParams.get('range') ?? '3M').toUpperCase() as Range

  if (!symbol) {
    return NextResponse.json({ bars: [], isIntraday: false, error: true, message: 'No symbol' })
  }

  // Validate symbol: must be in holdings OR watchlist table.
  const db = getDb()
  const [holdingRows, watchlistRows] = await Promise.all([
    db.select({ ticker: holdingsTable.ticker }).from(holdingsTable),
    db.select({ symbol: watchlistTable.symbol }).from(watchlistTable),
  ])
  const allowedSymbols = new Set([
    ...holdingRows.map(r => r.ticker.toUpperCase()),
    ...watchlistRows.map(r => r.symbol.toUpperCase()),
  ])
  if (!allowedSymbols.has(symbol)) {
    return NextResponse.json({ bars: [], isIntraday: false, error: true, message: 'Unknown symbol' }, { status: 400 })
  }

  const openbbUrl   = process.env.OPENBB_URL
  const openbbToken = process.env.OPENBB_TOKEN
  if (!openbbUrl || !openbbToken) {
    return NextResponse.json({ bars: [], isIntraday: false, error: true, message: 'OpenBB not configured' })
  }

  const cfg      = RANGE_CFG[rangeParam] ?? RANGE_CFG['3M']
  const provSym  = providerSymbol(symbol)
  const start    = isoDate(cfg.offsetDays)
  const end      = isoDate(0)
  const url      = `${openbbUrl}/api/v1/equity/price/historical?symbol=${encodeURIComponent(provSym)}&start_date=${start}&end_date=${end}&interval=${cfg.interval}&provider=yfinance`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${openbbToken}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ bars: [], isIntraday: cfg.isIntraday, error: true, message: `OpenBB ${res.status}` })
    }

    const json = await res.json() as {
      results?: { date: string; open: number; high: number; low: number; close: number; volume?: number }[]
    }

    const raw = json.results ?? []

    if (cfg.isIntraday) {
      // For intraday, convert datetime strings to unix seconds (lightweight-charts UTCTimestamp).
      // Deduplicate by timestamp and sort ascending.
      const seen = new Set<number>()
      const bars = raw
        .map(r => ({
          time:   toUnixSec(r.date),
          open:   r.open,
          high:   r.high,
          low:    r.low,
          close:  r.close,
          volume: r.volume ?? 0,
        }))
        .filter(b => {
          if (seen.has(b.time)) return false
          seen.add(b.time)
          return true
        })
        .sort((a, b) => a.time - b.time)

      return NextResponse.json({ bars, isIntraday: true, error: false })
    } else {
      // For daily/weekly: date strings 'YYYY-MM-DD'. Deduplicate by date string, sort ascending.
      const seen = new Set<string>()
      const bars = raw
        .map(r => ({
          time:   r.date.slice(0, 10),
          open:   r.open,
          high:   r.high,
          low:    r.low,
          close:  r.close,
          volume: r.volume ?? 0,
        }))
        .filter(b => {
          if (seen.has(b.time as string)) return false
          seen.add(b.time as string)
          return true
        })
        .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))

      return NextResponse.json({ bars, isIntraday: false, error: false })
    }
  } catch (err) {
    console.error('[demeter/history] fetch failed:', err)
    return NextResponse.json({ bars: [], isIntraday: cfg.isIntraday, error: true, message: String(err) })
  }
}
