import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { watchlist, holdings as holdingsTable } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { providerSymbol, TICKER_TO_PROVIDER_SYMBOL } from '../../../../../tools/market-data'

// Resolve a canonical ticker back from a provider symbol (e.g. VWRP.L → VWRP).
function canonicalTicker(provSym: string): string {
  const entry = Object.entries(TICKER_TO_PROVIDER_SYMBOL).find(([, v]) => v === provSym)
  return entry ? entry[0] : provSym.replace(/\.L$/, '')
}

// Fetch a live quote from OpenBB for an arbitrary symbol.
// Returns null if OpenBB is not configured or the symbol is unknown.
async function fetchOpenBBQuote(sym: string): Promise<{
  price: number
  prevClose: number
  currency: string
  isLivePrice: boolean
  name?: string
} | null> {
  const openbbUrl   = process.env.OPENBB_URL
  const openbbToken = process.env.OPENBB_TOKEN
  if (!openbbUrl || !openbbToken) return null

  const provSym = providerSymbol(sym)
  const url = `${openbbUrl}/api/v1/equity/price/quote?symbol=${encodeURIComponent(provSym)}&provider=yfinance`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${openbbToken}` },
      cache: 'no-store',
    })
    if (!res.ok) return null

    const json = await res.json() as { results?: unknown[] }
    const row = (json.results ?? [])[0] as Record<string, unknown> | undefined
    if (!row) return null

    const rawLast     = row.last_price ?? row.price
    const isLivePrice = rawLast != null && Number(rawLast) > 0
    const prevCloseRaw = Number(row.prev_close ?? row.previous_close ?? 0)
    const rawPrice    = isLivePrice ? Number(rawLast) : prevCloseRaw
    const prevClose   = prevCloseRaw > 0 ? prevCloseRaw : rawPrice

    let currency = String(row.currency ?? 'USD').toUpperCase()
    let price    = rawPrice
    let pc       = prevClose

    // Normalise pence → GBP
    if (currency === 'GBP' || currency === 'GBP') {
      // already fine
    } else if (currency === 'GBP' || currency === 'GBX') {
      price /= 100; pc /= 100; currency = 'GBP'
    }
    // Handle GBp explicitly
    if (String(row.currency) === 'GBp' || String(row.currency) === 'GBX') {
      price /= 100; pc /= 100; currency = 'GBP'
    }

    const name = row.name ? String(row.name) : undefined

    return { price, prevClose: pc, currency, isLivePrice, name }
  } catch {
    return null
  }
}

// ── GET /api/dashboard/watchlist ─────────────────────────────────────────────
// Returns all watchlist symbols with live prices + market state.

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const rows = await db.select().from(watchlist).orderBy(watchlist.added_at)

  if (rows.length === 0) {
    return NextResponse.json({ items: [] })
  }

  // Fetch live prices for all watchlist symbols in parallel.
  const priced = await Promise.all(
    rows.map(async r => {
      const quote = await fetchOpenBBQuote(r.symbol)
      return {
        symbol:      r.symbol,
        name:        r.name ?? r.symbol,
        added_at:    r.added_at,
        price:       quote?.price ?? null,
        prevClose:   quote?.prevClose ?? null,
        currency:    quote?.currency ?? 'USD',
        isLivePrice: quote?.isLivePrice ?? true,
      }
    }),
  )

  return NextResponse.json({ items: priced })
}

// ── POST /api/dashboard/watchlist ────────────────────────────────────────────
// Body: { symbol: string }. Validates, deduplicates, persists.

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch { body = {} }
  const raw = (body as Record<string, unknown>).symbol
  if (typeof raw !== 'string' || !raw.trim()) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  }

  const symbol = raw.trim().toUpperCase()
  const db = getDb()

  // Duplicate guard: check holdings first, then watchlist.
  const [holdingMatch] = await db
    .select({ ticker: holdingsTable.ticker })
    .from(holdingsTable)
    .where(eq(holdingsTable.ticker, symbol))
    .limit(1)

  if (holdingMatch) {
    return NextResponse.json({ error: 'already_held', message: `${symbol} is already in your book` }, { status: 409 })
  }

  const [existing] = await db
    .select({ symbol: watchlist.symbol })
    .from(watchlist)
    .where(eq(watchlist.symbol, symbol))
    .limit(1)

  if (existing) {
    return NextResponse.json({ error: 'already_watching', message: `${symbol} is already on your watchlist` }, { status: 409 })
  }

  // Resolve via OpenBB to confirm symbol is valid and get a display name.
  const quote = await fetchOpenBBQuote(symbol)
  if (!quote || (quote.price === 0 && quote.prevClose === 0)) {
    return NextResponse.json({ error: 'not_found', message: `Couldn't resolve ${symbol} — check the ticker and try again` }, { status: 404 })
  }

  const id = `wl_${symbol}_${Date.now()}`
  const name = quote.name ?? symbol
  await db.insert(watchlist).values({ id, symbol, name, added_at: Math.floor(Date.now() / 1000) })

  return NextResponse.json({ ok: true, symbol, name, price: quote.price, currency: quote.currency })
}

// ── DELETE /api/dashboard/watchlist ─────────────────────────────────────────
// Body: { symbol: string }

export async function DELETE(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch { body = {} }
  const raw = (body as Record<string, unknown>).symbol
  if (typeof raw !== 'string' || !raw.trim()) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  }

  const symbol = raw.trim().toUpperCase()
  const db = getDb()
  await db.delete(watchlist).where(eq(watchlist.symbol, symbol))

  return NextResponse.json({ ok: true, symbol })
}
