import { describe, it, expect } from 'vitest'
import {
  computePortfolio,
  round2,
  findAdviceWords,
  ADVICE_PATTERNS,
  type PricedHolding,
  type PortfolioConfig,
} from './portfolio'

const defaultConfig: PortfolioConfig = {
  baseCurrency: 'GBP',
  concentrationThreshold: 25,
  dayMoveThreshold: 5,
}

function h(
  ticker: string,
  quantity: number,
  price: number,
  prevClose: number,
  avgCost = 0,
  fxToBase = 1,
  currency = 'GBP',
): PricedHolding {
  return { ticker, name: ticker, quantity, price, prevClose, avgCost, fxToBase, currency }
}

// ─── Basic portfolio calculations ──────────────────────────────────────────────

describe('computePortfolio — basic', () => {
  it('computes total value for two same-currency holdings', () => {
    const result = computePortfolio(
      [h('AAPL', 10, 150, 148), h('MSFT', 5, 200, 195)],
      defaultConfig,
    )
    expect(result.totalValue).toBe(2500) // 1500 + 1000
  })

  it('computes 50/50 allocation correctly', () => {
    const result = computePortfolio(
      [h('AAPL', 10, 100, 100), h('MSFT', 10, 100, 100)],
      defaultConfig,
    )
    expect(result.holdings[0].allocation).toBe(50)
    expect(result.holdings[1].allocation).toBe(50)
  })

  it('computes day P&L correctly', () => {
    const result = computePortfolio([h('AAPL', 10, 110, 100)], defaultConfig)
    expect(result.dayChange).toBe(100) // 10 * (110 - 100)
    expect(result.dayChangePct).toBe(10) // 100 / 1000 * 100
  })

  it('dayChangePct is 0 when prevTotal is 0', () => {
    const result = computePortfolio([h('AAPL', 0, 100, 0)], defaultConfig)
    expect(result.dayChangePct).toBe(0)
  })

  it('handles empty holdings without crashing', () => {
    const result = computePortfolio([], defaultConfig)
    expect(result.totalValue).toBe(0)
    expect(result.totalPnl).toBeNull()
    expect(result.flags).toHaveLength(0)
  })

  it('passes through pricesUnavailable list', () => {
    const result = computePortfolio([], defaultConfig, ['MU', 'IONQ'])
    expect(result.pricesUnavailable).toEqual(['MU', 'IONQ'])
  })
})

// ─── Multi-currency with FX conversion ────────────────────────────────────────

describe('computePortfolio — multi-currency', () => {
  const GBPUSD = 1.27 // stub rate
  const fxUSD = round2(1 / GBPUSD) // 0.7874

  it('converts USD holding to GBP via fxToBase', () => {
    // 1 share at $200, GBPUSD = 1.27 → £157.48
    const result = computePortfolio([h('AAPL', 1, 200, 200, 0, fxUSD, 'USD')], defaultConfig)
    expect(result.holdings[0].priceBase).toBe(round2(200 * fxUSD))
    expect(result.totalValue).toBe(round2(200 * fxUSD))
  })

  it('sums GBP and USD holdings into a single GBP total', () => {
    const vwrp = h('VWRP', 10, 130, 129, 0, fxUSD, 'USD') // 10 * 130 * 0.7874 = £1023.62
    const vdpg = h('VDPG', 8, 29.5, 29.2, 0, 1, 'GBP')    // 8 * 29.5 = £236
    const result = computePortfolio([vwrp, vdpg], defaultConfig)
    const expectedVwrp = round2(10 * round2(130 * fxUSD))
    const expectedVdpg = round2(8 * 29.5)
    expect(result.holdings[0].value).toBe(expectedVwrp)
    expect(result.holdings[1].value).toBe(expectedVdpg)
    expect(result.totalValue).toBe(round2(expectedVwrp + expectedVdpg))
  })

  it('fxToBase = 1 for same-currency holding leaves price unchanged', () => {
    const result = computePortfolio([h('VDPG', 5, 29, 28, 0, 1, 'GBP')], defaultConfig)
    expect(result.holdings[0].priceBase).toBe(29)
  })
})

// ─── P&L with and without cost basis ──────────────────────────────────────────

describe('computePortfolio — P&L', () => {
  it('pnl is null when avgCost is 0', () => {
    const result = computePortfolio([h('AAPL', 10, 150, 148, 0)], defaultConfig)
    expect(result.holdings[0].pnl).toBeNull()
    expect(result.totalPnl).toBeNull()
  })

  it('computes per-holding and total P&L when all costs are set', () => {
    const result = computePortfolio(
      [h('AAPL', 10, 150, 148, 100), h('MSFT', 5, 200, 195, 180)],
      defaultConfig,
    )
    expect(result.holdings[0].pnl).toBe(500)  // 1500 - 1000
    expect(result.holdings[1].pnl).toBe(100)  // 1000 - 900
    expect(result.totalPnl).toBe(600)
    expect(result.totalCost).toBe(1900)        // 1000 + 900
  })

  it('totalPnl is null if any holding has avgCost = 0', () => {
    const result = computePortfolio(
      [h('AAPL', 10, 150, 148, 100), h('MSFT', 5, 200, 195, 0)],
      defaultConfig,
    )
    expect(result.totalPnl).toBeNull()
    expect(result.holdings[0].pnl).toBe(500)
    expect(result.holdings[1].pnl).toBeNull()
  })

  it('P&L is negative when price is below cost', () => {
    const result = computePortfolio([h('IONQ', 5, 20, 22, 30)], defaultConfig)
    expect(result.holdings[0].pnl).toBe(round2(5 * 20 - 5 * 30)) // 100 - 150 = -50
  })

  it('avgCost is in base currency — NOT multiplied by fxToBase', () => {
    // 1 USD holding: price $200, GBPUSD 1.27 (fxToBase = 1/1.27 ≈ 0.7874)
    // value = $200 * 0.7874 = £157.48
    // avgCost = £140 (already in GBP — the investor paid £140)
    // pnl = £157.48 - £140 = £17.48
    const fxUSD = round2(1 / 1.27) // 0.79
    const result = computePortfolio([h('AAPL', 1, 200, 200, 140, fxUSD, 'USD')], defaultConfig)
    const expectedValue = round2(200 * fxUSD)
    const expectedPnl = round2(expectedValue - 140)
    expect(result.holdings[0].pnl).toBe(expectedPnl)
    expect(result.totalPnl).toBe(expectedPnl)
  })
})

// ─── Risk flags ───────────────────────────────────────────────────────────────

describe('computePortfolio — risk flags', () => {
  it('fires concentration flag when holding > threshold', () => {
    // MSTR: 100 * 100 = 10000, AAPL: 10 * 100 = 1000, total = 11000
    // MSTR allocation = 90.91% > 25% → flag; AAPL = 9.09% → no flag
    const result = computePortfolio(
      [h('MSTR', 100, 100, 100), h('AAPL', 10, 100, 100)],
      defaultConfig,
    )
    const mstrFlag = result.flags.find(f => f.ticker === 'MSTR')
    expect(mstrFlag).toBeTruthy()
    expect(mstrFlag?.message).toMatch(/MSTR.*% of the book/)
    const aaplFlag = result.flags.find(f => f.ticker === 'AAPL')
    expect(aaplFlag).toBeUndefined()
  })

  it('does not fire concentration flag when holding is at or under threshold', () => {
    // AAPL: 10 * 100 = 1000, MSFT: 10 * 100 = 1000, GOOG: 30 * 100 = 3000 → total 5000
    // AAPL = 20%, MSFT = 20%, GOOG = 60% → only GOOG flagged
    const result = computePortfolio(
      [h('AAPL', 10, 100, 100), h('MSFT', 10, 100, 100), h('GOOG', 30, 100, 100)],
      defaultConfig,
    )
    expect(result.flags.find(f => f.ticker === 'AAPL')).toBeUndefined()
    expect(result.flags.find(f => f.ticker === 'MSFT')).toBeUndefined()
    expect(result.flags.find(f => f.ticker === 'GOOG')).toBeTruthy()
  })

  it('fires day-move flag on exactly ±5% move', () => {
    // Two holdings so IONQ (1%) doesn't trigger concentration
    const up = computePortfolio(
      [h('IONQ', 1, 105, 100), h('AAPL', 100, 100, 100)],
      defaultConfig,
    )
    const ionqDayFlag = up.flags.find(f => f.ticker === 'IONQ' && f.message.includes('today'))
    expect(ionqDayFlag).toBeTruthy()
    expect(ionqDayFlag?.message).toContain('+5%')

    const down = computePortfolio(
      [h('IONQ', 1, 95, 100), h('AAPL', 100, 100, 100)],
      defaultConfig,
    )
    const ionqDownFlag = down.flags.find(f => f.ticker === 'IONQ' && f.message.includes('today'))
    expect(ionqDownFlag).toBeTruthy()
    expect(ionqDownFlag?.message).toContain('-5%')
  })

  it('does not fire day-move flag on <5% move', () => {
    // Two holdings; check specifically that no day-move flag fires (message won't contain "today")
    const result = computePortfolio(
      [h('AAPL', 1, 104.9, 100), h('MSFT', 100, 100, 100)],
      defaultConfig,
    )
    const aaplDayFlag = result.flags.find(f => f.ticker === 'AAPL' && f.message.includes('today'))
    expect(aaplDayFlag).toBeUndefined()
  })

  it('flag messages are neutral facts — no advice words', () => {
    const result = computePortfolio(
      [h('MSTR', 100, 100, 100), h('IONQ', 10, 115, 100)],
      defaultConfig,
    )
    for (const flag of result.flags) {
      expect(findAdviceWords(flag.message)).toHaveLength(0)
    }
  })
})

// ─── round2 ───────────────────────────────────────────────────────────────────

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1.123)).toBe(1.12)
    expect(round2(1.125)).toBe(1.13)
    expect(round2(100)).toBe(100)
    expect(round2(0)).toBe(0)
    expect(round2(-1.567)).toBe(-1.57)
  })
})

// ─── Advice-word guard regression ─────────────────────────────────────────────

describe('findAdviceWords — whole-word matching', () => {
  it('"holdings" does not trigger \\bhold\\b', () => {
    expect(findAdviceWords('holdings')).toHaveLength(0)
    expect(findAdviceWords('list holdings')).toHaveLength(0)
    expect(findAdviceWords('6 holdings tracked')).toHaveLength(0)
    expect(findAdviceWords('Holdings table')).toHaveLength(0)
  })

  it('"holding" does not trigger \\bhold\\b', () => {
    expect(findAdviceWords('holding period')).toHaveLength(0)
    expect(findAdviceWords('3 holding')).toHaveLength(0)
  })

  it('"hold" as a standalone word triggers the hold pattern', () => {
    expect(findAdviceWords('hold this position')).not.toHaveLength(0)
    expect(findAdviceWords('you should hold')).not.toHaveLength(0)
  })

  it('"buyback" does not trigger \\bbuy\\b', () => {
    expect(findAdviceWords('buyback announcement')).toHaveLength(0)
    expect(findAdviceWords('share buyback')).toHaveLength(0)
  })

  it('"buy" standalone triggers the buy pattern', () => {
    expect(findAdviceWords('buy the dip')).not.toHaveLength(0)
  })

  it('"operating" does not trigger any pattern', () => {
    expect(findAdviceWords('operating results')).toHaveLength(0)
  })

  it('"derating" does not trigger \\brating\\b', () => {
    expect(findAdviceWords('derating risk')).toHaveLength(0)
  })

  it('"rating" standalone triggers the rating pattern', () => {
    expect(findAdviceWords('analyst rating')).not.toHaveLength(0)
  })

  it('"consideration" does not trigger \\bconsider\\b', () => {
    expect(findAdviceWords('tax consideration')).toHaveLength(0)
  })

  it('a normal brief with "holdings" passes the guard', () => {
    const normalBrief = [
      '*DEMETER — Portfolio Brief*',
      'Total value: £12,345.67',
      'Day P&L: +£123.45 (+1.01%)',
      '6 holdings tracked.',
      'No risk flags.',
    ].join('\n')
    expect(findAdviceWords(normalBrief)).toHaveLength(0)
  })

  it('a brief with allocation info passes the guard', () => {
    const brief = [
      '*My Book*',
      'MSTR is 45% of the book.',
      'VWRP is 38% of the book.',
      'Total holdings: 6',
    ].join('\n')
    expect(findAdviceWords(brief)).toHaveLength(0)
  })

  it('all ADVICE_PATTERNS are case-insensitive and start with a word boundary', () => {
    for (const p of ADVICE_PATTERNS) {
      expect(p.flags).toContain('i')
      // p.source for /\bword\b/i is the string \bword\b (literal backslash+b)
      expect(p.source.startsWith('\\b')).toBe(true)
    }
  })
})
