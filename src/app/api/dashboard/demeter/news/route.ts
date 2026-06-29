import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'

const ALLOWED = new Set(['MU', 'VWRP', 'VDPG', 'AMAT', 'IONQ', 'MSTR'])

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
    return NextResponse.json({ items: [], error: true })
  }

  // yfinance for news — confirmed working in D3a verification.
  // OPENBB_TOKEN stays server-side; browser never sees it.
  const url = `${openbbUrl}/api/v1/news/company?symbol=${encodeURIComponent(symbol)}&limit=6&provider=yfinance`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${openbbToken}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ items: [], error: true })
    }
    const json = await res.json() as { results?: { title?: string; url?: string; source?: string; published_utc?: string; provider_symbol?: string }[] }
    const items = (json.results ?? []).slice(0, 6).map(r => ({
      title:     r.title ?? '',
      url:       r.url ?? '',
      source:    r.source ?? 'yfinance',
      published: r.published_utc ?? '',
    }))
    return NextResponse.json({ items, error: false })
  } catch (err) {
    console.error('[demeter/news] fetch failed:', err)
    return NextResponse.json({ items: [], error: true })
  }
}
