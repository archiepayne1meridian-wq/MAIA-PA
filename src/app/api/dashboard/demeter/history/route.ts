import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { providerSymbol } from '../../../../../../tools/market-data'

const ALLOWED = new Set(['MU', 'VWRP', 'VDPG', 'AMAT', 'IONQ', 'MSTR'])

function isoDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]!
}

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase() ?? ''
  if (!ALLOWED.has(symbol)) {
    return NextResponse.json({ error: 'Unknown symbol' }, { status: 400 })
  }

  const openbbUrl   = process.env.OPENBB_URL
  const openbbToken = process.env.OPENBB_TOKEN
  if (!openbbUrl || !openbbToken) {
    return NextResponse.json({ bars: [], error: true, message: 'OpenBB not configured' })
  }

  const provSym  = providerSymbol(symbol)
  const start    = isoDate(-32) // 32d buffer to get 30 trading bars
  const end      = isoDate(0)
  const url      = `${openbbUrl}/api/v1/equity/price/historical?symbol=${encodeURIComponent(provSym)}&start_date=${start}&end_date=${end}&interval=1d&provider=yfinance`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${openbbToken}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ bars: [], error: true, message: `OpenBB ${res.status}` })
    }
    const json = await res.json() as { results?: { date: string; open: number; high: number; low: number; close: number; volume?: number }[] }
    const bars = (json.results ?? []).map(r => ({
      time:   r.date.slice(0, 10), // 'YYYY-MM-DD'
      open:   r.open,
      high:   r.high,
      low:    r.low,
      close:  r.close,
      volume: r.volume ?? 0,
    }))
    return NextResponse.json({ bars, error: false })
  } catch (err) {
    console.error('[demeter/history] fetch failed:', err)
    return NextResponse.json({ bars: [], error: true, message: String(err) })
  }
}
