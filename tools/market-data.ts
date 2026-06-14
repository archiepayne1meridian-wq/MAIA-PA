// Market data layer — fetches current prices and FX rates.
//
// Provider priority:
//   OpenBB (OPENBB_URL + OPENBB_TOKEN)
//   → HybridProvider (TWELVE_DATA_API_KEY set):
//       US tickers → Twelve Data (free tier covers NASDAQ/NYSE)
//       LSE tickers (VWRP, VDPG) → Yahoo Finance .L suffix
//       FX rate → Twelve Data
//   → StubProvider (no key or USE_STUB_PRICES=true)
//
// Pence handling: per-symbol from the raw currency field in each provider's response.
// Never hardcode which tickers are pence — read the field, call normalisePence.

import type { Holding, PricedHolding } from './portfolio'

export interface Quote {
  ticker: string    // canonical ticker (e.g. VWRP, not VWRP.L)
  price: number     // current price, pence already normalised to GBP
  prevClose: number
  currency: string  // normalised: USD or GBP (never GBp/GBX after this point)
}

// Tickers that live on the London Stock Exchange — routed to Yahoo Finance (.L suffix).
const LSE_TICKERS = new Set(['VWRP', 'VDPG'])

// Yahoo Finance symbol mapping for LSE-listed tickers.
const YF_SYMBOL: Record<string, string> = {
  VWRP: 'VWRP.L',
  VDPG: 'VDPG.L',
}

// OpenBB uses the same .L suffix convention.
export const TICKER_TO_PROVIDER_SYMBOL: Record<string, string> = {
  VWRP: 'VWRP.L',
  VDPG: 'VDPG.L',
}

export function providerSymbol(ticker: string): string {
  return TICKER_TO_PROVIDER_SYMBOL[ticker] ?? ticker
}

// Per-symbol pence normalisation. Called with the raw currency string from each
// provider's response. Divides by 100 only when the field says GBp or GBX.
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
    const rev  = `${to.toUpperCase()}${from.toUpperCase()}`
    if (STUB_FX[key]) return STUB_FX[key]
    if (STUB_FX[rev]) return 1 / STUB_FX[rev]
    return 1
  }
}

// ─── Twelve Data provider (US tickers + FX) ───────────────────────────────────
// Free plan covers NASDAQ/NYSE. LSE ETFs require a paid plan — route those to Yahoo.
// Loud per-symbol error logging: logs the raw Twelve Data error shape before throwing.

interface TDRow {
  close?: string         // current/last price (NOT "price" — that field doesn't exist)
  previous_close?: string
  currency?: string
  status?: string
  code?: number
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

    let rows: Record<string, TDRow>
    if (symbols.length === 1) {
      rows = { [symbols[0]!]: json as TDRow }
    } else {
      rows = json as Record<string, TDRow>
    }

    // Loud per-symbol failure logging — surface Twelve Data error messages immediately.
    for (const [sym, row] of Object.entries(rows)) {
      if (row.status === 'error') {
        console.error(
          `[market-data] Twelve Data error for "${sym}": ` +
          `code=${row.code}, message="${row.message}"`,
        )
      }
    }

    return rows
  }

  private rowToQuote(ticker: string, sym: string, row: TDRow): Quote | null {
    if (row.status === 'error') {
      // Already logged in batchQuote; return null so caller can decide to throw.
      console.error(`[market-data] Twelve Data — raw row for ${sym}: ${JSON.stringify(row)}`)
      return null
    }
    if (!row.close) {
      console.error(`[market-data] Twelve Data — no "close" field for ${sym}. Raw row: ${JSON.stringify(row)}`)
      return null
    }
    const price    = parseFloat(row.close)
    const prevClose = row.previous_close ? parseFloat(row.previous_close) : price
    const { price: p, prevClose: pc, currency } = normalisePence(price, prevClose, row.currency ?? 'USD')
    return { ticker, price: p, prevClose: pc, currency }
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const batch = await this.batchQuote(tickers)
    const results: Quote[] = []

    for (const ticker of tickers) {
      const row = batch[ticker] ?? {}
      const q = this.rowToQuote(ticker, ticker, row)
      if (!q) {
        throw new Error(
          `[market-data] ${ticker}: Twelve Data returned no usable price ` +
          `(status=${row.status ?? 'missing'}, code=${row.code ?? '?'}, ` +
          `message="${row.message ?? 'none'}"). ` +
          `If this is an LSE ticker, it should route to Yahoo — check LSE_TICKERS set.`,
        )
      }
      results.push(q)
    }

    return results
  }

  // getFxRate('GBP','USD') → ~1.34 (USD per GBP).
  // Caller: fxToBase = 1/rate  →  price_USD × fxToBase = price_GBP  ✓
  async getFxRate(from: string, to: string): Promise<number> {
    if (from.toUpperCase() === to.toUpperCase()) return 1
    const symbol = `${from.toUpperCase()}/${to.toUpperCase()}`
    const url = `${this.base}/price?symbol=${encodeURIComponent(symbol)}&apikey=${this.apiKey}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`[market-data] Twelve Data FX HTTP ${res.status} for ${symbol}`)
    const json = await res.json() as { price?: string; status?: string; code?: number; message?: string }
    if (json.status === 'error' || !json.price) {
      throw new Error(
        `[market-data] Twelve Data FX unavailable for ${symbol}: ` +
        `code=${json.code}, message="${json.message ?? 'no price'}"`,
      )
    }
    return parseFloat(json.price)
  }
}

// ─── Yahoo Finance provider (LSE tickers only) ────────────────────────────────
// Used exclusively for VWRP.L and VDPG.L.
// Direct fetch to the public chart/v8 endpoint — no npm package, no API key.
// Currency is read from meta.currency per symbol; normalisePence handles GBp/GBX.

interface YFMeta {
  regularMarketPrice?: number
  chartPreviousClose?: number
  currency?: string
}

class YahooFinanceProvider {
  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const settled = await Promise.allSettled(tickers.map(t => this.fetchOne(t)))

    const results: Quote[] = []
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i]!
      if (r.status === 'fulfilled') {
        results.push(r.value)
      } else {
        const ticker = tickers[i]!
        const sym = YF_SYMBOL[ticker] ?? `${ticker}.L`
        throw new Error(
          `[market-data] ${ticker} (${sym}): Yahoo Finance failed — ` +
          `${(r.reason as Error)?.message ?? r.reason}`,
        )
      }
    }
    return results
  }

  private async fetchOne(ticker: string): Promise<Quote> {
    const sym = YF_SYMBOL[ticker] ?? `${ticker}.L`
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      cache: 'no-store',
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} for ${sym} — body: ${body.slice(0, 200)}`)
    }
    const json = await res.json() as { chart?: { result?: { meta: YFMeta }[]; error?: unknown } }
    const meta = json.chart?.result?.[0]?.meta

    if (!meta?.regularMarketPrice) {
      throw new Error(
        `no price in Yahoo Finance response for ${sym}. ` +
        `raw chart.error=${JSON.stringify(json.chart?.error)}, ` +
        `result=${JSON.stringify(json.chart?.result?.slice(0, 1))}`,
      )
    }

    const price    = meta.regularMarketPrice
    const prevClose = meta.chartPreviousClose ?? price
    const rawCurrency = meta.currency ?? 'GBP'   // LSE default; normalisePence handles GBp

    console.log(`[market-data] Yahoo Finance ${sym}: price=${price} prev=${prevClose} currency=${rawCurrency}`)

    const { price: p, prevClose: pc, currency } = normalisePence(price, prevClose, rawCurrency)
    return { ticker, price: p, prevClose: pc, currency }
  }
}

// ─── Hybrid provider ──────────────────────────────────────────────────────────
// Routes by exchange: LSE_TICKERS → Yahoo Finance (.L suffix); all others → Twelve Data.
// GBP/USD FX always comes from Twelve Data.

class HybridProvider {
  private td: TwelveDataProvider
  private yf: YahooFinanceProvider

  constructor(tdKey: string) {
    this.td = new TwelveDataProvider(tdKey)
    this.yf = new YahooFinanceProvider()
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const lse = tickers.filter(t => LSE_TICKERS.has(t))
    const us  = tickers.filter(t => !LSE_TICKERS.has(t))

    const [lseQuotes, usQuotes] = await Promise.all([
      lse.length > 0 ? this.yf.getQuotes(lse) : Promise.resolve([] as Quote[]),
      us.length  > 0 ? this.td.getQuotes(us)  : Promise.resolve([] as Quote[]),
    ])

    return [...usQuotes, ...lseQuotes]
  }

  // FX always from Twelve Data — confirmed working on free tier.
  async getFxRate(from: string, to: string): Promise<number> {
    return this.td.getFxRate(from, to)
  }
}

// ─── OpenBB provider ─────────────────────────────────────────────────────────
// Future: Research Terminal once OpenBB Platform is deployed on Railway.

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

      const price    = Number(row.last_price ?? row.price ?? 0)
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

function getProvider(): StubProvider | HybridProvider | OpenBBProvider {
  const openbbUrl   = process.env.OPENBB_URL
  const openbbToken = process.env.OPENBB_TOKEN
  if (openbbUrl && openbbToken) return new OpenBBProvider(openbbUrl, openbbToken)

  const tdKey = process.env.TWELVE_DATA_API_KEY
  if (tdKey) return new HybridProvider(tdKey)

  if (process.env.USE_STUB_PRICES !== 'true') {
    console.warn('[market-data] TWELVE_DATA_API_KEY not set — using stub prices.')
  }
  return new StubProvider()
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
  const tickers  = holdings.map(h => h.ticker)

  let quotes: Quote[]
  try {
    quotes = await provider.getQuotes(tickers)
  } catch (err) {
    console.error('[market-data] getQuotes failed:', err)
    return { priced: [], unavailable: tickers }
  }

  const quoteMap = new Map(quotes.map(q => [q.ticker, q]))

  // Collect unique foreign currencies needing FX conversion.
  const foreignCurrencies = new Set<string>()
  for (const q of quotes) {
    if (q.currency.toUpperCase() !== baseCurrency.toUpperCase()) {
      foreignCurrencies.add(q.currency.toUpperCase())
    }
  }

  // getFxRate('GBP','USD') → ~1.34 (USD per GBP)
  // fxToBase = 1/1.34 ≈ 0.746  →  price_USD × fxToBase = price_GBP  ✓
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

  const priced: PricedHolding[]  = []
  const unavailable: string[] = []

  for (const holding of holdings) {
    const q = quoteMap.get(holding.ticker)
    if (!q) { unavailable.push(holding.ticker); continue }
    priced.push({
      ...holding,
      price:    q.price,
      prevClose: q.prevClose,
      fxToBase:  fxRates.get(q.currency.toUpperCase()) ?? 1,
    })
  }

  return { priced, unavailable }
}
