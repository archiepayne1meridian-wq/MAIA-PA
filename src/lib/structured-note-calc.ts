// Pure client/server-safe calculation logic for the Structured Note visualizer.
// No I/O, no Claude, no DB — deterministic maths only. Single source of truth
// for both graphs and the returns summary in StructuredNoteVisualizer.tsx.

export interface NoteParams {
  autocallBarrier: number      // e.g. 100 (%)
  couponBarrier: number        // e.g. 70 (%)
  capitalProtection: number    // e.g. 60 (%)
  couponRate: number           // annual %, e.g. 10
  termYears: number            // e.g. 6
  observationFrequency: 'quarterly' | 'semi-annual' | 'annual'
  investmentAmount: number     // e.g. 100000
  indexPath: number[]          // index level (% of strike) at each observation, one entry per period — user-editable via drag
  worstOf?: boolean            // basket note where the least-performing underlying determines the outcome — display only, not used in the maths here
}

export interface ObservationResult {
  period: string               // e.g. "Q1Y1"
  year: number
  quarter: number              // 1-4 (or 1-2 for semi-annual, 1 for annual)
  indexLevel: number           // % of starting level
  autocalled: boolean
  couponPaid: boolean
  couponMissed: boolean
  memoryAccumulating: boolean
  memoryPaid: boolean
  memoryAmount: number         // accumulated % owed
  couponAmount: number         // £ paid this period
  afterAutocall: boolean
}

export interface NoteResult {
  observations: ObservationResult[]
  autocalled: boolean
  autocallPeriod: string | null
  totalCouponsPaid: number     // £
  totalMemoryPaid: number      // £
  capitalReturned: number      // £
  capitalLost: number          // £
  totalReturned: number        // £
  totalReturnPct: number       // %
  annualisedReturnPct: number  // %
  monthsInNote: number
}

export function periodsPerYearFor(freq: NoteParams['observationFrequency']): number {
  return freq === 'quarterly' ? 4 : freq === 'semi-annual' ? 2 : 1
}

export function calculateNote(params: NoteParams): NoteResult {
  const periodsPerYear = periodsPerYearFor(params.observationFrequency)

  const totalPeriods = params.termYears * periodsPerYear
  const couponPerPeriod = params.couponRate / periodsPerYear / 100

  // Index level is whatever the user set for that observation (via drag or a
  // preset) — no interpolation. Missing entries (path shorter than the term)
  // default to 100.
  function indexAtPeriod(p: number): number {
    return params.indexPath[p - 1] ?? 100
  }

  const observations: ObservationResult[] = []
  let autocalled = false
  let autocallPeriod: string | null = null
  let memoryAccumulated = 0  // number of missed periods
  let totalCouponsPaid = 0
  let totalMemoryPaid = 0

  for (let p = 1; p <= totalPeriods; p++) {
    const year = Math.ceil(p / periodsPerYear)
    const quarter = ((p - 1) % periodsPerYear) + 1
    const period = params.observationFrequency === 'annual'
      ? `Y${year}`
      : params.observationFrequency === 'semi-annual'
      ? `H${quarter}Y${year}`
      : `Q${quarter}Y${year}`

    const indexLevel = indexAtPeriod(p)

    if (autocalled) {
      observations.push({
        period, year, quarter, indexLevel,
        autocalled: false, couponPaid: false, couponMissed: false,
        memoryAccumulating: false, memoryPaid: false,
        memoryAmount: 0, couponAmount: 0, afterAutocall: true,
      })
      continue
    }

    // Check autocall
    if (indexLevel >= params.autocallBarrier) {
      autocalled = true
      autocallPeriod = period
      // Pay any accumulated memory + this period's coupon
      const memoryCoupon = memoryAccumulated * couponPerPeriod * params.investmentAmount
      const thisCoupon = couponPerPeriod * params.investmentAmount
      totalMemoryPaid += memoryCoupon
      totalCouponsPaid += thisCoupon
      observations.push({
        period, year, quarter, indexLevel,
        autocalled: true, couponPaid: true, couponMissed: false,
        memoryAccumulating: false, memoryPaid: memoryAccumulated > 0,
        memoryAmount: memoryAccumulated * couponPerPeriod * 100,
        couponAmount: memoryCoupon + thisCoupon, afterAutocall: false,
      })
      continue
    }

    // Check coupon barrier
    if (indexLevel >= params.couponBarrier) {
      // Coupon paid — also pay any memory
      const memoryCoupon = memoryAccumulated * couponPerPeriod * params.investmentAmount
      const thisCoupon = couponPerPeriod * params.investmentAmount
      totalMemoryPaid += memoryCoupon
      totalCouponsPaid += thisCoupon
      const wasMemoryPaid = memoryAccumulated > 0
      const memoryAmt = memoryAccumulated * couponPerPeriod * 100
      memoryAccumulated = 0
      observations.push({
        period, year, quarter, indexLevel,
        autocalled: false, couponPaid: true, couponMissed: false,
        memoryAccumulating: false, memoryPaid: wasMemoryPaid,
        memoryAmount: memoryAmt, couponAmount: memoryCoupon + thisCoupon,
        afterAutocall: false,
      })
    } else {
      // Coupon missed — memory accumulates
      memoryAccumulated++
      observations.push({
        period, year, quarter, indexLevel,
        autocalled: false, couponPaid: false, couponMissed: true,
        memoryAccumulating: true, memoryPaid: false,
        memoryAmount: memoryAccumulated * couponPerPeriod * 100,
        couponAmount: 0, afterAutocall: false,
      })
    }
  }

  // Capital calculation at maturity
  const finalIndexLevel = indexAtPeriod(totalPeriods)
  let capitalReturned = params.investmentAmount
  let capitalLost = 0

  if (!autocalled) {
    if (finalIndexLevel < params.capitalProtection) {
      // Capital at risk — receive proportional to index fall
      capitalReturned = params.investmentAmount * (finalIndexLevel / 100)
      capitalLost = params.investmentAmount - capitalReturned
    }
    // If above protection but below autocall — capital returned in full
  }

  const totalReturned = capitalReturned + totalCouponsPaid + totalMemoryPaid
  const totalReturnPct = ((totalReturned - params.investmentAmount) / params.investmentAmount) * 100
  const monthsInNote = autocalled
    ? observations.filter(o => !o.afterAutocall).length * (12 / periodsPerYear)
    : params.termYears * 12
  const yearsInNote = monthsInNote / 12
  const annualisedReturnPct = yearsInNote > 0
    ? (Math.pow(totalReturned / params.investmentAmount, 1 / yearsInNote) - 1) * 100
    : 0

  return {
    observations, autocalled, autocallPeriod,
    totalCouponsPaid, totalMemoryPaid, capitalReturned, capitalLost,
    totalReturned, totalReturnPct, annualisedReturnPct, monthsInNote,
  }
}

// ── Draggable path helpers ───────────────────────────────────────────────────

export type PresetScenario = 'flat' | 'bull-run' | 'bear-dip' | 'crash' | 'volatile'

// Piecewise-linear interpolation between control points, each [fraction of
// term (0-1), index level]. Used to generate the smooth preset shapes.
function piecewiseInterp(n: number, points: Array<[number, number]>): number[] {
  if (n <= 0) return []
  return Array.from({ length: n }, (_, i) => {
    const frac = n === 1 ? 0 : i / (n - 1)
    for (let k = 0; k < points.length - 1; k++) {
      const [f0, v0] = points[k]
      const [f1, v1] = points[k + 1]
      if (frac >= f0 && frac <= f1) {
        const t = f1 === f0 ? 0 : (frac - f0) / (f1 - f0)
        return v0 + (v1 - v0) * t
      }
    }
    return points[points.length - 1][1]
  })
}

export function generatePresetPath(preset: PresetScenario, periods: number): number[] {
  switch (preset) {
    case 'flat':
      // Deliberately pinned at exactly 100 — with the default 100% autocall
      // barrier this autocalls on the first observation, same as a genuinely
      // flat index would in real life.
      return Array(periods).fill(100)
    case 'bull-run':
      // Starts a touch under 100 so the "gradual rise" is visible for a few
      // periods before crossing a barrier — starting at exactly 100 would
      // autocall instantly against the default 100% barrier and skip the story.
      return piecewiseInterp(periods, [[0, 90], [1, 130]])
    case 'bear-dip':
      // Trough sits below the default 70% coupon barrier (not just touching
      // it) so a real stretch of periods miss and accumulate memory before
      // the recovery leg pays it back.
      return piecewiseInterp(periods, [[0, 98], [0.4, 60], [1, 95]])
    case 'crash':
      return piecewiseInterp(periods, [[0, 98], [0.25, 45], [1, 45]])
    case 'volatile':
      // Down first, then up, so period 1 doesn't land on/above a 100% barrier.
      return Array.from({ length: periods }, (_, i) => 100 + (i % 2 === 0 ? -20 : 20))
    default:
      return Array(periods).fill(100)
  }
}

// Keeps an existing path aligned with the term/frequency after an edit —
// extends with the last value, or truncates — rather than resetting the
// user's edits every time an unrelated field changes.
export function resizeIndexPath(path: number[], newLength: number): number[] {
  if (path.length === newLength) return path
  if (path.length === 0) return Array(newLength).fill(100)
  if (newLength > path.length) {
    const last = path[path.length - 1]
    return [...path, ...Array(newLength - path.length).fill(last)]
  }
  return path.slice(0, newLength)
}
