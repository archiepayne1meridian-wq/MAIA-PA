import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { holdings as holdingsTable, portfolio_snapshots } from '@/db/schema'
import { desc } from 'drizzle-orm'
import { getPricedHoldings } from '../../../../../../tools/market-data'
import { computePortfolio } from '../../../../../../tools/portfolio'
import type { Holding } from '../../../../../../tools/portfolio'

const CONFIG = {
  baseCurrency: 'GBP',
  concentrationThreshold: 25,
  dayMoveThreshold: 5,
}

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()

  // Load holdings from DB — the deterministic source of truth.
  const rows = await db.select().from(holdingsTable)
  const holdings: Holding[] = rows.map(r => ({
    ticker:   r.ticker,
    name:     r.name ?? r.ticker,
    quantity: r.quantity,
    avgCost:  r.avg_cost,
    currency: r.currency,
  }))

  if (holdings.length === 0) {
    return NextResponse.json({ openbbDown: false, portfolio: null, extras: {}, fetchedAt: Math.floor(Date.now() / 1000) })
  }

  let priced, unavailable: string[]
  try {
    ;({ priced, unavailable } = await getPricedHoldings(holdings, CONFIG.baseCurrency))
  } catch (err) {
    console.error('[demeter/live] getPricedHoldings threw:', err)
    // Full failure — try to return last snapshot so terminal can degrade gracefully.
    const [snap] = await db.select().from(portfolio_snapshots).orderBy(desc(portfolio_snapshots.taken_at)).limit(1)
    return NextResponse.json({ openbbDown: true, snapshot: snap ?? null, portfolio: null, extras: {}, fetchedAt: Math.floor(Date.now() / 1000) })
  }

  if (unavailable.length === holdings.length) {
    // All prices failed — OpenBB is down.
    const [snap] = await db.select().from(portfolio_snapshots).orderBy(desc(portfolio_snapshots.taken_at)).limit(1)
    return NextResponse.json({ openbbDown: true, snapshot: snap ?? null, portfolio: null, extras: {}, fetchedAt: Math.floor(Date.now() / 1000) })
  }

  const portfolio = computePortfolio(priced, CONFIG, unavailable)

  // Per-holding extras: fxToBase (for chart conversion to GBP) + isLivePrice (data-decides market state).
  const extras: Record<string, { fxToBase: number; isLivePrice: boolean; price: number; prevClose: number; currency: string }> = {}
  for (const p of priced) {
    extras[p.ticker] = {
      fxToBase:    p.fxToBase,
      isLivePrice: p.isLivePrice ?? true,
      price:       p.price,
      prevClose:   p.prevClose,
      currency:    p.currency,
    }
  }

  return NextResponse.json({
    openbbDown: false,
    portfolio,
    extras,
    fetchedAt: portfolio.timestamp,
  })
}
