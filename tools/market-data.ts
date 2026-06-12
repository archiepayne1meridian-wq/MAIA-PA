// Market data layer — fetches current prices and FX rates.
// Provider priority: OpenBB (OPENBB_URL + OPENBB_TOKEN) → Yahoo Finance (no key, all tickers)
// → StubProvider (USE_STUB_PRICES=true, with a warning).
//
// TwelveDataProvider is kept for reference (US-only free tier) but not in the active chain;
// Yahoo Finance covers all 6 holdings including the LSE ETFs Twelve Data paywalls.
//
// Pence handling is per-symbol from the currency field returned by each provider.
// Never hardcode which tickers are pence — read the response.

import type { Holding, PricedHolding } from './portfolio'

export interface Quote {
  ticker: string    // canonical ticker (e.g. VWRP, not VWRP.L)
  price: number     // current price, pence already normalised to GBP
  prevClose: number
  currency: string  // normalised: USD or GBP (never GBp/GBX after this point)
}

// Yahoo Finance .L suffix mapping for LSE-listed tickers
const YF_SYMBOL: Record<string, string> = {
  VWRP: 'VWRP.L',
  VDPG: 'VDPG.L',
}

// OpenBB uses Yahoo-style .L suffixes — kept separate so both providers coexist.
export const TICKER_TO_PROVIDER_SYMBOL: Record<string, string> = {
  VWRP: 'VWRP.L',
  VDPG: 'VDPG.L',
}

export function providerSymbol(ticker: string): string {
  return TICKER_TO_PROVIDER_SYMBOL[ticker] ?? ticker
}

// Shared pence normalisation — called per symbol with the raw currency string
// returned by the provider. Divides by 100 only when the field says GBp/GBX.
function normalisePence(
  price: number,
  prevClose: number,
  rawCurrency: string,
): { price: number; prevClose: number; currency: string } {
  if (rawCurrency === 'GBp' || rawCurrency.toUpperCase() === 'GBX') {
    return { price: price / 100, prevClose: prevClose / 100, currency: 'GBP' }
  }
  return { price, prevClose, currency: rawCurrency.toUpperCase() }
}

// ─── Stub provider ────────────────────────────────────────────────────────────
// Approximate mid-2026 prices. Activate with USE_STUB_PRICES=true.

const STUB_FX: Record<string, number> = { GBPUSD: 1.34 }

const STUB_QUOTES: Record<string, Quote> = {
  MU:   { ticker: 'MU',   price: 983.0,  prevClose: 995.87,  currency: 'USD' },
  VWRP: { ticker: 'VWRP', price: 140.08, prevClose: 137.80,  currency: 'GBP' },
  VDPG: { ticker: 'VDPG', price: 45.21,  prevClose: 43.40,   currency: 'GBP' },
  AMAT: { ticker: 'AMAT', price: 566.0,  prevClose: 552.64,  currency: 'USD' },
  IONQ: { ticker: 'IONQ', price: 57.92,  prevClose: 57.99,   currency: 'USD' },
  MSTR: { ticker: 'MSTR', price: 124.26, prevClose: 120.15,  currency: 'USD' },
}

class StubProvider {
  async getQuotes(tickers: string[]): Promise<Quote[]> {
    return tickers.map(t => STUB_QUOTES[t] ?? { ticker: t, price: 1, prevClose: 1, currency: 'USD' })
  }

  async getFxRate(from: string, to: string): Promise<number> {
    const key = `${from.toUpperCase()}${to.toUpperCase()}`
    const rev = `${to.toUpperCase()}${from.toUpperCase()}`
    if (STUB_FX[key]) return STUB_FX[key]
    if (STUB_FX[rev]) return 1 / STUB_FX[rev]
    return 1
  }
}

// ─── Yahoo Finance provider ───────────────────────────────────────────────────
// No API key needed. Covers US equities and LSE ETFs (VWRP.L, VDPG.L).
// Uses the public chart/v8 endpoint — returns regularMarketPrice + currency.
// LSE ETF prices from Yahoo are in GBP (not pence); normalisePence handles GBp if ever returned.

interface YFMeta {
  regularMarketPrice?: number
  chartPreviousClose?: number
  currency?: string
}

class YahooFinanceProvider {
  private yfSymbol(ticker: string): string {
    return YF_SYMBOL[ticker] ?? ticker
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const settled = await Promise.allSettled(
      tickers.map(ticker => this.fetchOne(ticker)),
    )

    const results: Quote[] = []
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i]!
      if (r.status === 'fulfilled') {
        results.push(r.value)
      } else {
        const ticker = tickers[i]!
        throw new Error(
          `[market-data] ${ticker}: Yahoo Finance failed — ${(r.reason as Error)?.message ?? r.reason}`,
        )
      }
    }
    return results
  }

  private async fetchOne(ticker: string): Promise<Quote> {
    const sym = this.yfSymbol(ticker)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${sym}`)
    const json = await res.json() as { chart?: { result?: { meta: YFMeta }[]; error?: unknown } }
    const meta = json.chart?.result?.[0]?.meta
    if (!meta?.regularMarketPrice) {
      throw new Error(`no price in response for ${sym}: ${JSON.stringify(json.chart?.error ?? json)}`)
    }
    const price = meta.regularMarketPrice
    const prevClose = meta.chartPreviousClose ?? price
    const { price: p, prevClose: pc, currency } = normalisePence(price, prevClose, meta.currency ?? 'USD')
    return { ticker, price: p, prevClose: pc, currency }
  }

  // getFxRate('GBP','USD') → ~1.34 (USD per GBP).
  // Caller computes fxToBase = 1/rate so that price_USD × fxToBase = price_GBP.
  async getFxRate(from: string, to: string): Promise<number> {
    if (from.toUpperCase() === to.toUpperCase()) return 1
    const pair = `${from.toUpperCase()}${to.toUpperCase()}=X`
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(pair)}?interval=1d&range=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`[market-data] Yahoo Finance FX HTTP ${res.status} for ${pair}`)
    const json = await res.json() as { chart?: { result?: { meta: YFMeta }[] } }
    const meta = json.chart?.result?.[0]?.meta
    if (!meta?.regularMarketPrice) {
      throw new Error(`[market-data] Yahoo Finance: no FX rate for ${pair}`)
    }
    return meta.regularMarketPrice
  }
}

// ─── Twelve Data provider ─────────────────────────────────────────────────────
// TWELVE_DATA_API_KEY must be set. Free tier covers US equities; LSE ETFs require a paid plan.
// Kept here for reference — not in the active provider chain (Yahoo Finance covers all tickers).
// Use this if Yahoo Finance becomes unavailable on your deployment environment.

interface TDRow {
  close?: string      // current / last price (NOT "price" — that field doesn't exist)
  previous_close?: string
  currency?: string
  status?: string
  message?: string
}

class TwelveDataProvider {
  private readonly apiKey: string
  private readonly base = 'https://api.twelvedata.com'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async batchQuote(symbols: string[]): Promise<Record<string, TDRow>> {
    const url = `${this.base}/quote?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${this.apiKey}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`[market-data] Twelve Data HTTP ${res.status}`)
    const json = await res.json() as Record<string, TDRow> | TDRow
    if (symbols.length === 1) return { [symbols[0]!]: json as TDRow }
    return json as Record<string, TDRow>
  }

  private rowToQuote(ticker: string, row: TDRow): Quote | null {
    if (row.status === 'error' || !row.close) return null
    const price = parseFloat(row.close)
    const prevClose = row.previous_close ? parseFloat(row.previous_close) : price
    const { price: p, prevClose: pc, currency } = normalisePence(price, prevClose, row.currency ?? 'USD')
    return { ticker, price: p, prevClose: pc, currency }
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const batch = await this.batchQuote(tickers)
    const results: Quote[] = []

    for (const ticker of tickers) {
      const q = this.rowToQuote(ticker, batch[ticker] ?? {})
      if (q) {
        results.push(q)
      } else {
        const row = batch[ticker]
        throw new Error(
          `[market-data] ${ticker}: Twelve Data returned no price — ` +
          `status=${row?.status ?? 'missing'}, message=${row?.message ?? 'none'}. ` +
          `LSE ETFs (VWRP, VDPG) require a paid Twelve Data plan.`,
        )
      }
    }
    return results
  }

  // getFxRate('GBP','USD') → ~1.34 (USD per GBP).
  async getFxRate(from: string, to: string): Promise<number> {
    if (from.toUpperCase() === to.toUpperCase()) return 1
    const symbol = `${from.toUpperCase()}/${to.toUpperCase()}`
    const url = `${this.base}/price?symbol=${encodeURIComponent(symbol)}&apikey=${this.apiKey}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`[market-data] Twelve Data FX HTTP ${res.status} for ${symbol}`)
    const json = await res.json() as { price?: string; status?: string; message?: string }
    if (json.status === 'error' || !json.price) {
      throw new Error(`[market-data] Twelve Data FX unavailable for ${symbol}: ${json.message ?? 'no price'}`)
    }
    return parseFloat(json.price)
  }
}

// ─── OpenBB provider ─────────────────────────────────────────────────────────
// Future: used by the Research Terminal once OpenBB Platform is deployed.

class OpenBBProvider {
  private readonly baseUrl: string
  private readonly token: string

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.token = token
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const symbols = tickers.map(t => providerSymbol(t)).join(',')
    const url = `${this.baseUrl}/api/v1/equity/price/quote?symbol=${encodeURIComponent(symbols)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } })
    if (!res.ok) throw new Error(`OpenBB price fetch failed: ${res.status}`)
    const json = await res.json() as { results?: unknown[] }

    return (json.results ?? []).map((r: unknown) => {
      const row = r as Record<string, unknown>
      const provSym = String(row.symbol ?? '')
      const ticker = Object.entries(TICKER_TO_PROVIDER_SYMBOL).find(
        ([, v]) => v === provSym,
      )?.[0] ?? provSym.replace(/\.L$/, '')

      const price = Number(row.last_price ?? row.price ?? 0)
      const prevClose = Number(row.prev_close ?? row.previous_close ?? price)
      const { price: p, prevClose: pc, currency } = normalisePence(price, prevClose, String(row.currency ?? 'USD'))
      return { ticker, price: p, prevClose: pc, currency }
    })
  }

  async getFxRate(from: string, to: string): Promise<number> {
    if (from.toUpperCase() === to.toUpperCase()) return 1
    const pair = `${from.toUpperCase()}${to.toUpperCase()}`
    const url = `${this.baseUrl}/api/v1/currency/price/historical?symbol=${pair}&interval=1d&start_date=${todayStr()}&end_date=${todayStr()}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } })
    if (!res.ok) {
      console.warn(`[market-data] OpenBB FX ${pair} unavailable (${res.status}), using 1.0`)
      return 1
    }
    const json = await res.json() as { results?: { close?: number }[] }
    return json.results?.[0]?.close ?? 1
  }
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!
}

// ─── Active provider ─────────────────────────────────────────────────────────
// Priority: OpenBB (if OPENBB_URL + OPENBB_TOKEN) → Yahoo Finance → Stub (USE_STUB_PRICES=true)

function getProvider(): StubProvider | YahooFinanceProvider | OpenBBProvider {
  const openbbUrl = process.env.OPENBB_URL
  const openbbToken = process.env.OPENBB_TOKEN
  if (openbbUrl && openbbToken) return new OpenBBProvider(openbbUrl, openbbToken)

  if (process.env.USE_STUB_PRICES === 'true') {
    console.warn('[market-data] USE_STUB_PRICES=true — using stub prices.')
    return new StubProvider()
  }

  // Yahoo Finance: no API key needed, covers US equities and LSE ETFs
  return new YahooFinanceProvider()
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface PricedHoldingResult {
  priced: PricedHolding[]
  unavailable: string[]
}

export async function getPricedHoldings(
  holdings: Holding[],
  baseCurrency: string,
): Promise<PricedHoldingResult> {
  if (holdings.length === 0) return { priced: [], unavailable: [] }

  const provider = getProvider()
  const tickers = holdings.map(h => h.ticker)

  let quotes: Quote[]
  try {
    quotes = await provider.getQuotes(tickers)
  } catch (err) {
    console.error('[market-data] getQuotes failed:', err)
    return { priced: [], unavailable: tickers }
  }

  const quoteMap = new Map(quotes.map(q => [q.ticker, q]))

  // Collect unique foreign currencies needing FX conversion
  const foreignCurrencies = new Set<string>()
  for (const q of quotes) {
    if (q.currency.toUpperCase() !== baseCurrency.toUpperCase()) {
      foreignCurrencies.add(q.currency.toUpperCase())
    }
  }

  // getFxRate('GBP','USD') → ~1.34 (USD per GBP)
  // fxToBase = 1/1.34 ≈ 0.746  →  price_USD × 0.746 = price_GBP  ✓
  const fxRates = new Map<string, number>([[baseCurrency.toUpperCase(), 1]])
  for (const foreign of foreignCurrencies) {
    try {
      const rate = await provider.getFxRate(baseCurrency, foreign)
      fxRates.set(foreign, 1 / rate)
    } catch {
      console.warn(`[market-data] FX ${baseCurrency}/${foreign} unavailable, using 1.0`)
      fxRates.set(foreign, 1)
    }
  }

  const priced: PricedHolding[] = []
  const unavailable: string[] = []
  for (const holding of holdings) {
    const q = quoteMap.get(holding.ticker)
    if (!q) { unavailable.push(holding.ticker); continue }
    priced.push({
      ...holding,
      price: q.price,
      prevClose: q.prevClose,
      fxToBase: fxRates.get(q.currency.toUpperCase()) ?? 1,
    })
  }

  return { priced, unavailable }
}
