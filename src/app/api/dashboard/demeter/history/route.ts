import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { holdings as holdingsTable, watchlist as watchlistTable } from '@/db/schema'
import { getHistoricalBars } from '../../../../../../tools/market-data'

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

  const cfg = RANGE_CFG[rangeParam] ?? RANGE_CFG['3M']

  try {
    const bars = await getHistoricalBars(symbol, {
      interval:   cfg.interval,
      startDate:  isoDate(cfg.offsetDays),
      endDate:    isoDate(0),
      isIntraday: cfg.isIntraday,
    })
    return NextResponse.json({ bars, isIntraday: cfg.isIntraday, error: false })
  } catch (err) {
    console.error('[demeter/history] getHistoricalBars failed:', err)
    return NextResponse.json({
      bars: [],
      isIntraday: cfg.isIntraday,
      error: true,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
