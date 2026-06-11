// Pure portfolio computation — no I/O, no model calls.
// All numbers come from the caller (holdings + prices from market-data.ts).
// The model never computes numbers; only this tool does.

export interface Holding {
  ticker: string
  name?: string
  quantity: number
  avgCost: number   // per-unit cost in BASE CURRENCY (e.g. GBP); 0 = not yet set
  currency: string  // native price currency (USD, GBP, etc.) — not the cost currency
}

export interface PricedHolding extends Holding {
  price: number     // current price in native currency
  prevClose: number // previous close in native currency
  fxToBase: number  // multiply price by this to convert to baseCurrency (1.0 if already base)
}

export interface PortfolioConfig {
  baseCurrency: string
  concentrationThreshold: number // % above which to flag (e.g. 25)
  dayMoveThreshold: number        // % above which to flag day move (e.g. 5)
}

export interface HoldingResult {
  ticker: string
  name?: string
  quantity: number
  price: number        // native currency
  priceBase: number    // base currency
  value: number        // base currency (quantity * priceBase)
  dayChange: number    // base currency day P&L
  dayChangePct: number // % day change for this holding
  allocation: number   // % of total portfolio value
  pnl: number | null   // total P&L in base currency; null if avgCost === 0
  avgCost: number
  currency: string
}

export interface RiskFlag {
  ticker: string
  message: string
}

export interface PortfolioResult {
  totalValue: number
  totalCost: number       // 0 if no cost basis set
  totalPnl: number | null // null if any holding has avgCost === 0
  dayChange: number       // total day P&L in base currency
  dayChangePct: number    // % day change on total
  holdings: HoldingResult[]
  flags: RiskFlag[]
  baseCurrency: string
  timestamp: number       // unix seconds
  pricesUnavailable: string[]
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Advice-word patterns for DEMETER's own composed prose.
// Whole-word matching: \bhold\b matches "hold" but not "holdings" or "holding".
// Applied only to DEMETER's own output — NOT to attributed third-party news.
export const ADVICE_PATTERNS = [
  /\bbuy\b/i,
  /\bsell\b/i,
  /\bhold\b/i,
  /\bconsider\b/i,
  /\brecommend\b/i,
  /\bshould\b/i,
  /\btrim\b/i,
  /\bprice target\b/i,
  /\brating\b/i,
]

export function findAdviceWords(text: string): string[] {
  return ADVICE_PATTERNS.filter(p => p.test(text)).map(p => p.source)
}

export function computePortfolio(
  holdings: PricedHolding[],
  config: PortfolioConfig,
  pricesUnavailable: string[] = [],
): PortfolioResult {
  const { baseCurrency, concentrationThreshold, dayMoveThreshold } = config

  const computed: HoldingResult[] = holdings.map(h => {
    const priceBase = round2(h.price * h.fxToBase)
    const prevCloseBase = round2(h.prevClose * h.fxToBase)
    const value = round2(h.quantity * priceBase)
    const dayChange = round2(h.quantity * (priceBase - prevCloseBase))
    const dayChangePct =
      prevCloseBase > 0 ? round2(((priceBase - prevCloseBase) / prevCloseBase) * 100) : 0
    // avgCost is stored in base currency (GBP) — do NOT multiply by fxToBase
    const pnl = h.avgCost > 0 ? round2(value - round2(h.quantity * h.avgCost)) : null

    return {
      ticker: h.ticker,
      name: h.name,
      quantity: h.quantity,
      price: h.price,
      priceBase,
      value,
      dayChange,
      dayChangePct,
      allocation: 0, // filled in below after total is known
      pnl,
      avgCost: h.avgCost,
      currency: h.currency,
    }
  })

  const totalValue = round2(computed.reduce((s, h) => s + h.value, 0))
  const prevTotal = round2(
    holdings.reduce((s, h) => s + round2(h.quantity * round2(h.prevClose * h.fxToBase)), 0),
  )
  const dayChange = round2(computed.reduce((s, h) => s + h.dayChange, 0))
  const dayChangePct = prevTotal > 0 ? round2((dayChange / prevTotal) * 100) : 0

  for (const h of computed) {
    h.allocation = totalValue > 0 ? round2((h.value / totalValue) * 100) : 0
  }

  const allHaveCost = computed.length > 0 && computed.every(h => h.pnl !== null)
  // avgCost is in base currency — sum directly without FX conversion
  const totalCost = allHaveCost
    ? round2(holdings.reduce((s, h) => s + round2(h.quantity * h.avgCost), 0))
    : 0
  const totalPnl = allHaveCost ? round2(totalValue - totalCost) : null

  const flags: RiskFlag[] = []
  for (const h of computed) {
    if (h.allocation > concentrationThreshold) {
      flags.push({
        ticker: h.ticker,
        message: `${h.ticker} is ${h.allocation}% of the book.`,
      })
    }
    if (Math.abs(h.dayChangePct) >= dayMoveThreshold) {
      const sign = h.dayChangePct >= 0 ? '+' : ''
      flags.push({
        ticker: h.ticker,
        message: `${h.ticker} ${sign}${h.dayChangePct}% today.`,
      })
    }
  }

  return {
    totalValue,
    totalCost,
    totalPnl,
    dayChange,
    dayChangePct,
    holdings: computed,
    flags,
    baseCurrency,
    timestamp: Math.floor(Date.now() / 1000),
    pricesUnavailable,
  }
}
