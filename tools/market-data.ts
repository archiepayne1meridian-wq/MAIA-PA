// Market data layer — fetches current prices and FX rates.
//
// Provider priority:
//   OpenBB (OPENBB_URL + OPENBB_TOKEN)
//   → HybridProvider (TWELVE_DATA_API_KEY set):
//       US tickers (MU, AMAT, IONQ, MSTR) → Twelve Data (confirmed Railway-safe, free tier)
//       LSE tickers (VWRP, VDPG) → Alpha Vantage (API-key auth, Railway-safe, covers LSE)
//       FX rate (GBP/USD) → Twelve Data
//   → StubProvider (no key or USE_STUB_PRICES=true)
//
// Why not Yahoo Finance: Railway's network firewalls outbound fetches to Yahoo (fetch failed,
// TCP-level block, not HTTP 4xx). Alpha Vantage uses API-key auth so IP doesn't matter.
//
// Pence handling: Alpha Vantage GLOBAL_QUOTE doesn't return a currency field — currency is
// inferred from the symbol suffix (.LON → GBP, else USD). normalisePence is still called
// so GBp/GBX division happens automatically if the inferred currency is wrong.

import type { Holding, PricedHolding } from './portfolio'

export interface Quote {
  ticker: string    // canonical ticker (e.g. VWRP, not VWRP.L)
  price: number     // current price, pence already normalised to GBP
  prevClose: number
  currency: string  // normalised: USD or GBP (never GBp/GBX after this point)
}

// Tickers that live on the London Stock Exchange — routed to Alpha Vantage (.LON suffix).
const LSE_TICKERS = new Set(['VWRP', 'VDPG'])

// Alpha Vantage symbol mapping for LSE-listed tickers.
const AV_LSE_SYMBOL: Record<string, string> = {
  VWRP: 'VWRP.LON',
  VDPG: 'VDPG.LON',
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

// ─── Alpha Vantage provider (LSE tickers only) ────────────────────────────────
// Used exclusively for VWRP.LON and VDPG.LON.
// API-key auth → Railway-safe (no IP blocking). Free tier: 25 req/day.
// GLOBAL_QUOTE doesn't return a currency field, so currency is inferred from the
// symbol suffix: .LON → GBP, else USD. normalisePence is still called in case AV
// returns pence values for a ticker.
// Free key: https://www.alphavantage.co/support/#api-key

interface AVGlobalQuote {
  '01. symbol'?: string
  '05. price'?: string
  '08. previous close'?: string
}

class AlphaVantageProvider {
  private readonly apiKey: string
  private readonly base = 'https://www.alphavantage.co/query'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    // Sequential with a gap to respect AV's free-tier 1-req/sec burst limit.
    const results: Quote[] = []
    for (let i = 0; i < tickers.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 1200))
      results.push(await this.fetchOne(tickers[i]!))
    }
    return results
  }

  private async fetchOne(ticker: string): Promise<Quote> {
    const sym = AV_LSE_SYMBOL[ticker] ?? `${ticker}.LON`
    const url = `${this.base}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(sym)}&apikey=${this.apiKey}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`[market-data] Alpha Vantage HTTP ${res.status} for ${sym}`)
    }

    const json = await res.json() as {
      'Global Quote'?: AVGlobalQuote
      'Information'?: string
      'Note'?: string
    }

    // AV returns Information/Note on rate-limit or auth errors — surface immediately.
    const apiMsg = json.Information ?? json.Note
    if (apiMsg) {
      throw new Error(`[market-data] Alpha Vantage API message for ${sym}: ${apiMsg}`)
    }

    const q = json['Global Quote']
    if (!q || !q['05. price']) {
      throw new Error(
        `[market-data] Alpha Vantage: no quote data for ${sym}. ` +
        `Raw response: ${JSON.stringify(json).slice(0, 300)}`,
      )
    }

    const price    = parseFloat(q['05. price'])
    const prevClose = q['08. previous close'] ? parseFloat(q['08. previous close']) : price

    // Infer currency from symbol suffix: .LON → GBP, else USD.
    // normalisePence divides by 100 if rawCurrency is GBp/GBX — handles AV returning pence.
    const rawCurrency = sym.endsWith('.LON') ? 'GBP' : 'USD'

    console.log(`[market-data] Alpha Vantage ${sym}: price=${price} prev=${prevClose} inferredCurrency=${rawCurrency}`)

    const { price: p, prevClose: pc, currency } = normalisePence(price, prevClose, rawCurrency)
    return { ticker, price: p, prevClose: pc, currency }
  }
}

// ─── Hybrid provider ──────────────────────────────────────────────────────────
// Routes by exchange:
//   LSE_TICKERS (VWRP, VDPG) → Alpha Vantage (.LON suffix) — Railway-safe, key auth
//   US tickers (MU, AMAT, IONQ, MSTR) → Twelve Data — Railway-safe, key auth
//   GBP/USD FX → Twelve Data

class HybridProvider {
  private td: TwelveDataProvider
  private av: AlphaVantageProvider

  constructor(tdKey: string, avKey: string) {
    this.td = new TwelveDataProvider(tdKey)
    this.av = new AlphaVantageProvider(avKey)
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const lse = tickers.filter(t => LSE_TICKERS.has(t))
    const us  = tickers.filter(t => !LSE_TICKERS.has(t))

    const [usQuotes, lseQuotes] = await Promise.all([
      us.length  > 0 ? this.td.getQuotes(us)  : Promise.resolve([] as Quote[]),
      lse.length > 0 ? this.av.getQuotes(lse) : Promise.resolve([] as Quote[]),
    ])

    return [...usQuotes, ...lseQuotes]
  }

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

// ─── Index + FX quote types (CASSANDRA) ──────────────────────────────────────
// These always use TwelveDataProvider directly (no portfolio routing needed).

// IndexSpec: symbol is the data-source ticker (e.g. "SPY", "ISF.L"); label is the
// display name shown in the brief (e.g. "S&P 500", "FTSE 100").
export interface IndexSpec {
  symbol: string
  label: string
}

export interface IndexQuote {
  symbol: string
  label: string    // display name — use this in the brief, not the ETF ticker
  level: number
  prevClose: number
  dayChangePct: number
}

export interface FxQuote {
  pair: string     // e.g. "GBP/USD"
  rate: number
  prevClose: number
  dayChangePct: number
}

// Stub data uses ETF proxies that match the free Twelve Data tier (NASDAQ/NYSE).
// ISF.L is the LSE-listed iShares FTSE 100 ETF — routed to Alpha Vantage.
const STUB_INDICES: IndexQuote[] = [
  { symbol: 'SPY',   label: 'S&P 500', level: 591.23, prevClose: 588.27, dayChangePct:  0.50 },
  { symbol: 'QQQ',   label: 'Nasdaq',  level: 511.40, prevClose: 508.77, dayChangePct:  0.52 },
  { symbol: 'ISF.L', label: 'FTSE 100', level: 19.08, prevClose: 18.97,  dayChangePct:  0.58 },
]

const STUB_FX_QUOTES: FxQuote[] = [
  { pair: 'GBP/USD', rate: 1.272, prevClose: 1.274, dayChangePct: -0.16 },
  { pair: 'EUR/USD', rate: 1.084, prevClose: 1.083, dayChangePct:  0.09 },
  { pair: 'EUR/GBP', rate: 0.852, prevClose: 0.850, dayChangePct:  0.24 },
]

function calcDayChangePct(level: number, prevClose: number): number {
  if (prevClose === 0) return 0
  return Math.round(((level - prevClose) / prevClose) * 10000) / 100
}

// getIndexQuotes: routes by exchange.
//   LSE symbols (ending .L) → Alpha Vantage (same path as VWRP/VDPG in DEMETER)
//   US symbols (SPY, QQQ)   → Twelve Data free tier (NASDAQ/NYSE covered)
// Falls back to stubs on missing keys or API errors; logs loudly on any failure.
export async function getIndexQuotes(specs: IndexSpec[]): Promise<IndexQuote[]> {
  if (specs.length === 0) return []

  if (process.env.USE_STUB_PRICES === 'true') {
    return STUB_INDICES.filter(q => specs.some(s => s.symbol === q.symbol))
  }

  const tdKey = process.env.TWELVE_DATA_API_KEY
  const avKey = process.env.ALPHA_VANTAGE_API_KEY

  const lseSpecs = specs.filter(s => s.symbol.endsWith('.L'))
  const usSpecs  = specs.filter(s => !s.symbol.endsWith('.L'))

  const results: IndexQuote[] = []

  // US tickers → Twelve Data
  if (usSpecs.length > 0) {
    if (!tdKey) {
      console.warn('[market-data] TWELVE_DATA_API_KEY not set — using stub index quotes for US.')
      results.push(...STUB_INDICES.filter(q => usSpecs.some(s => s.symbol === q.symbol)))
    } else {
      const td = new TwelveDataProvider(tdKey)
      const symbols = usSpecs.map(s => s.symbol)
      const rows = await td['batchQuote'](symbols)
      for (const spec of usSpecs) {
        const row = rows[spec.symbol] ?? {}
        if (row.status === 'error' || !row.close) {
          console.error(`[market-data] Index quote unavailable for "${spec.symbol}": ${JSON.stringify(row)}`)
          const stub = STUB_INDICES.find(q => q.symbol === spec.symbol)
          results.push(stub ?? { symbol: spec.symbol, label: spec.label, level: 0, prevClose: 0, dayChangePct: 0 })
        } else {
          const level = parseFloat(row.close)
          const prev  = row.previous_close ? parseFloat(row.previous_close) : level
          results.push({ symbol: spec.symbol, label: spec.label, level, prevClose: prev, dayChangePct: calcDayChangePct(level, prev) })
        }
      }
    }
  }

  // LSE tickers → Alpha Vantage (.L → .LON)
  if (lseSpecs.length > 0) {
    if (!avKey) {
      console.warn('[market-data] ALPHA_VANTAGE_API_KEY not set — using stub index quotes for LSE.')
      results.push(...STUB_INDICES.filter(q => lseSpecs.some(s => s.symbol === q.symbol)))
    } else {
      const av = new AlphaVantageProvider(avKey)
      // AlphaVantageProvider.getQuotes takes tickers without .L suffix; maps to .LON internally
      const avTickers = lseSpecs.map(s => s.symbol.replace(/\.L$/, ''))
      const avQuotes = await av.getQuotes(avTickers)
      for (const spec of lseSpecs) {
        const baseTicker = spec.symbol.replace(/\.L$/, '')
        const q = avQuotes.find(r => r.ticker === baseTicker)
        if (!q) {
          console.error(`[market-data] Alpha Vantage: no quote for ${spec.symbol}`)
          const stub = STUB_INDICES.find(s => s.symbol === spec.symbol)
          results.push(stub ?? { symbol: spec.symbol, label: spec.label, level: 0, prevClose: 0, dayChangePct: 0 })
        } else {
          results.push({
            symbol: spec.symbol,
            label: spec.label,
            level: q.price,
            prevClose: q.prevClose,
            dayChangePct: calcDayChangePct(q.price, q.prevClose),
          })
        }
      }
    }
  }

  return results
}

export async function getFxQuotes(pairs: string[]): Promise<FxQuote[]> {
  if (pairs.length === 0) return []

  const tdKey = process.env.TWELVE_DATA_API_KEY
  if (!tdKey) {
    console.warn('[market-data] TWELVE_DATA_API_KEY not set — using stub FX quotes.')
    return STUB_FX_QUOTES.filter(q => pairs.includes(q.pair))
  }

  if (process.env.USE_STUB_PRICES === 'true') {
    return STUB_FX_QUOTES.filter(q => pairs.includes(q.pair))
  }

  const td = new TwelveDataProvider(tdKey)
  const rows = await td['batchQuote'](pairs)

  return pairs.map(pair => {
    const row = rows[pair] ?? {}
    if (row.status === 'error' || !row.close) {
      console.error(`[market-data] FX quote unavailable for "${pair}": ${JSON.stringify(row)}`)
      const stub = STUB_FX_QUOTES.find(q => q.pair === pair)
      return stub ?? { pair, rate: 0, prevClose: 0, dayChangePct: 0 }
    }
    const rate = parseFloat(row.close)
    const prev = row.previous_close ? parseFloat(row.previous_close) : rate
    return { pair, rate, prevClose: prev, dayChangePct: calcDayChangePct(rate, prev) }
  })
}

// ─── Active provider ─────────────────────────────────────────────────────────

function getProvider(): StubProvider | HybridProvider | OpenBBProvider {
  const openbbUrl   = process.env.OPENBB_URL
  const openbbToken = process.env.OPENBB_TOKEN
  if (openbbUrl && openbbToken) return new OpenBBProvider(openbbUrl, openbbToken)

  const tdKey = process.env.TWELVE_DATA_API_KEY
  const avKey = process.env.ALPHA_VANTAGE_API_KEY

  if (tdKey && avKey) return new HybridProvider(tdKey, avKey)

  if (process.env.USE_STUB_PRICES !== 'true') {
    if (!tdKey) console.warn('[market-data] TWELVE_DATA_API_KEY not set — using stub prices.')
    if (!avKey) console.warn('[market-data] ALPHA_VANTAGE_API_KEY not set — using stub prices. Free key: https://www.alphavantage.co/support/#api-key')
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
