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
  indexPerformance: number     // slider value, e.g. -20 (%)
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
  const startingLevel = 100
  const endLevel = 100 + params.indexPerformance

  // Linear interpolation of index level over time
  function indexAtPeriod(p: number): number {
    return startingLevel + (endLevel - startingLevel) * (p / totalPeriods)
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
