import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { providerSymbol } from '../../../../../../tools/market-data'

// GET /api/dashboard/watchlist/resolve?symbol=NVDA
// Validates a symbol via OpenBB quote. Returns { found, symbol, name, price, currency }.
// Used by the UI's add-ticker flow to confirm the symbol exists before persisting.

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const raw = req.nextUrl.searchParams.get('symbol') ?? ''
  if (!raw.trim()) {
    return NextResponse.json({ found: false, message: 'No symbol provided' })
  }

  const symbol      = raw.trim().toUpperCase()
  const openbbUrl   = process.env.OPENBB_URL
  const openbbToken = process.env.OPENBB_TOKEN

  if (!openbbUrl || !openbbToken) {
    return NextResponse.json({ found: false, message: 'OpenBB not configured' })
  }

  const provSym = providerSymbol(symbol)
  const url = `${openbbUrl}/api/v1/equity/price/quote?symbol=${encodeURIComponent(provSym)}&provider=yfinance`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${openbbToken}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ found: false, message: `OpenBB ${res.status}` })
    }

    const json = await res.json() as { results?: unknown[] }
    const row  = (json.results ?? [])[0] as Record<string, unknown> | undefined

    if (!row) {
      return NextResponse.json({ found: false, message: `Couldn't resolve ${symbol}` })
    }

    const rawLast      = row.last_price ?? row.price
    const prevCloseRaw = Number(row.prev_close ?? row.previous_close ?? 0)
    const isLive       = rawLast != null && Number(rawLast) > 0
    const rawPrice     = isLive ? Number(rawLast) : prevCloseRaw

    if (rawPrice === 0 && prevCloseRaw === 0) {
      return NextResponse.json({ found: false, message: `Couldn't resolve ${symbol}` })
    }

    let price    = rawPrice
    let currency = String(row.currency ?? 'USD')

    // Normalise pence
    if (currency === 'GBp' || currency === 'GBX') {
      price /= 100
      currency = 'GBP'
    } else {
      currency = currency.toUpperCase()
    }

    const name = row.name ? String(row.name) : symbol

    return NextResponse.json({ found: true, symbol, name, price, currency })
  } catch (err) {
    console.error('[watchlist/resolve] error:', err)
    return NextResponse.json({ found: false, message: `Couldn't resolve ${symbol}` })
  }
}
