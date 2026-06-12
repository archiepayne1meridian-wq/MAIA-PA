// Market data layer — fetches current prices and FX rates.
// Stub provider is used by default when OPENBB_URL is not set (steps 1–4 of the build).
// Swap to OpenBBProvider in Step 5 by setting OPENBB_URL and OPENBB_TOKEN in .env.
//
// LSE note: VWRP and VDPG are London-listed and need the .L suffix for the live provider.
// VDPG.L (GBP-hedged) may quote in pence (GBX) on some platforms — the OpenBBProvider
// divides by 100 if the returned currency is GBX.

import type { Holding, PricedHolding } from './portfolio'

export interface Quote {
  ticker: string        // canonical ticker (e.g. VWRP, not VWRP.L)
  price: number         // current price in native currency
  prevClose: number     // previous close in native currency
  currency: string      // native currency (USD, GBP, GBX)
}

// Map canonical tickers → provider symbols (e.g. VWRP → VWRP.L)
export const TICKER_TO_PROVIDER_SYMBOL: Record<string, string> = {
  VWRP: 'VWRP.L',
  VDPG: 'VDPG.L',
}

// LSE tickers that may quote in pence (GBX); divide by 100 to convert to GBP
export const PENCE_TICKERS: Set<string> = new Set(['VDPG'])

export function providerSymbol(ticker: string): string {
  return TICKER_TO_PROVIDER_SYMBOL[ticker] ?? ticker
}

// ─── Stub provider ────────────────────────────────────────────────────────────
// Prices are approximate as of mid-2026; update or replace with a real provider.
// FX: GBPUSD = 1.27 (stub)

const STUB_FX: Record<string, number> = {
  GBPUSD: 1.27,
}

const STUB_QUOTES: Record<string, Quote> = {
  MU:   { ticker: 'MU',   price: 121.5,  prevClose: 120.0,  currency: 'USD' },
  VWRP: { ticker: 'VWRP', price: 132.0,  prevClose: 131.5,  currency: 'USD' },
  VDPG: { ticker: 'VDPG', price: 29.5,   prevClose: 29.2,   currency: 'GBP' },
  AMAT: { ticker: 'AMAT', price: 178.0,  prevClose: 176.5,  currency: 'USD' },
  IONQ: { ticker: 'IONQ', price: 24.5,   prevClose: 23.8,   currency: 'USD' },
  MSTR: { ticker: 'MSTR', price: 395.0,  prevClose: 390.0,  currency: 'USD' },
}

class StubProvider {
  async getQuotes(tickers: string[]): Promise<Quote[]> {
    return tickers.map(t => STUB_QUOTES[t] ?? { ticker: t, price: 1, prevClose: 1, currency: 'USD' })
  }

  async getFxRate(from: string, to: string): Promise<number> {
    const key = `${from.toUpperCase()}${to.toUpperCase()}`
    const reverseKey = `${to.toUpperCase()}${from.toUpperCase()}`
    if (STUB_FX[key]) return STUB_FX[key]
    if (STUB_FX[reverseKey]) return 1 / STUB_FX[reverseKey]
    if (from === to) return 1
    return 1 // fallback
  }
}

// ─── Yahoo Finance provider ──────────────────────────────────────────────────
// Uses yahoo-finance2 which handles Yahoo's crumb/cookie auth automatically.
// Yahoo returns "GBp" (pence) for LSE tickers — normalised to GBP.

import yahooFinance from 'yahoo-finance2'

class YahooFinanceProvider {
  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const results = await Promise.all(tickers.map(async (ticker): Promise<Quote | null> => {
      const symbol = providerSymbol(ticker)
      try {
        type YQ = { regularMarketPrice?: number; regularMarketPreviousClose?: number; currency?: string }
        const q = (await yahooFinance.quote(symbol)) as YQ
        if (!q.regularMarketPrice) return null

        let price = q.regularMarketPrice
        let prevClose = q.regularMarketPreviousClose ?? price
        const rawCurrency = q.currency ?? 'USD'
        let currency = rawCurrency.toUpperCase()

        // Yahoo uses "GBp" (pence) for many LSE securities
        const isPence = rawCurrency === 'GBp' || currency === 'GBX'
        if (isPence) {
          price /= 100
          prevClose /= 100
          currency = 'GBP'
        }

        return { ticker, price, prevClose, currency }
      } catch (err) {
        console.warn(`[market-data] Yahoo Finance failed for ${ticker}:`, err)
        return null
      }
    }))
    return results.filter((q): q is Quote => q !== null)
  }

  async getFxRate(from: string, to: string): Promise<number> {
    if (from.toUpperCase() === to.toUpperCase()) return 1
    const pair = `${from.toUpperCase()}${to.toUpperCase()}=X`
    try {
      type YQ = { regularMarketPrice?: number }
      const q = (await yahooFinance.quote(pair)) as YQ
      return q.regularMarketPrice ?? 1
    } catch {
      return 1
    }
  }
}

// ─── OpenBB provider ─────────────────────────────────────────────────────────

class OpenBBProvider {
  private baseUrl: string
  private token: string

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.token = token
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const symbols = tickers.map(t => providerSymbol(t)).join(',')
    const url = `${this.baseUrl}/api/v1/equity/price/quote?symbol=${encodeURIComponent(symbols)}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    })
    if (!res.ok) throw new Error(`OpenBB price fetch failed: ${res.status}`)
    const json = await res.json() as { results?: unknown[] }

    const results = json.results ?? []
    return (results as Record<string, unknown>[]).map(r => {
      const provSym = String(r.symbol ?? '')
      // Reverse-map provider symbol back to canonical ticker
      const ticker = Object.entries(TICKER_TO_PROVIDER_SYMBOL).find(
        ([, v]) => v === provSym,
      )?.[0] ?? provSym.replace(/\.L$/, '')

      let price = Number(r.last_price ?? r.price ?? 0)
      let prevClose = Number(r.prev_close ?? r.previous_close ?? price)
      let currency = String(r.currency ?? 'USD').toUpperCase()

      // Convert pence (GBX) to GBP
      if (currency === 'GBX' || PENCE_TICKERS.has(ticker)) {
        price = price / 100
        prevClose = prevClose / 100
        currency = 'GBP'
      }

      return { ticker, price, prevClose, currency }
    })
  }

  async getFxRate(from: string, to: string): Promise<number> {
    if (from.toUpperCase() === to.toUpperCase()) return 1
    const pair = `${from.toUpperCase()}${to.toUpperCase()}`
    const url = `${this.baseUrl}/api/v1/currency/price/historical?symbol=${pair}&interval=1d&start_date=${todayStr()}&end_date=${todayStr()}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    })
    if (!res.ok) {
      console.warn(`[market-data] FX rate ${pair} unavailable (${res.status}), using 1.0`)
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

function getProvider(): StubProvider | YahooFinanceProvider | OpenBBProvider {
  const url = process.env.OPENBB_URL
  const token = process.env.OPENBB_TOKEN
  if (url && token) return new OpenBBProvider(url, token)
  if (process.env.USE_STUB_PRICES === 'true') return new StubProvider()
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
  const unavailable: string[] = []
  try {
    quotes = await provider.getQuotes(tickers)
  } catch (err) {
    console.error('[market-data] getQuotes failed:', err)
    return { priced: [], unavailable: tickers }
  }

  const quoteMap = new Map(quotes.map(q => [q.ticker, q]))

  // Collect unique foreign currencies that need FX conversion
  const foreignCurrencies = new Set<string>()
  for (const q of quotes) {
    if (q.currency.toUpperCase() !== baseCurrency.toUpperCase()) {
      foreignCurrencies.add(q.currency.toUpperCase())
    }
  }

  // Fetch FX rates (baseCurrency per unit of foreign currency)
  const fxRates = new Map<string, number>([[baseCurrency.toUpperCase(), 1]])
  for (const foreign of foreignCurrencies) {
    try {
      // e.g. GBPUSD = 1.27 → fxToBase for USD = 1/1.27 = 0.787...
      const rate = await provider.getFxRate(baseCurrency, foreign) // base per 1 foreign
      fxRates.set(foreign, 1 / rate) // fxToBase = how many base per 1 unit of foreign
    } catch {
      console.warn(`[market-data] FX rate ${baseCurrency}/${foreign} unavailable, using 1.0`)
      fxRates.set(foreign, 1)
    }
  }

  const priced: PricedHolding[] = []
  for (const holding of holdings) {
    const q = quoteMap.get(holding.ticker)
    if (!q) {
      unavailable.push(holding.ticker)
      continue
    }
    const currency = q.currency.toUpperCase()
    const fxToBase = fxRates.get(currency) ?? 1

    priced.push({
      ...holding,
      price: q.price,
      prevClose: q.prevClose,
      fxToBase,
    })
  }

  return { priced, unavailable }
}
