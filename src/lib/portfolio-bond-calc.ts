// Pure client/server-safe calculation logic for the Portfolio Bond visualizer.
// No I/O, no Claude, no DB — deterministic maths only, illustrative not actuarial.

export interface BondParams {
  startingAmount: number        // £, e.g. 100000
  annualGrowthRate: number      // %, e.g. 6
  taxRate: number                // %, e.g. 40 (higher rate)
  timeHorizonYears: number      // e.g. 20
  annualWithdrawal: number      // £ per year via 5% allowance, e.g. 0
  nonUkResidentYears: number    // years held while non-UK resident (for TAR)
}

export interface YearlySnapshot {
  year: number
  bondValue: number             // gross roll-up, net of any withdrawals taken
  giaValue: number              // taxed annually on growth
  bondWithdrawals: number       // cumulative withdrawals taken
  taxSavedSoFar: number         // cumulative tax deferred vs GIA
  fivePercentAllowanceUsed: number  // cumulative % used (max 100% over up to 20 years at the full 5% rate)
}

export interface BondResult {
  yearlySnapshots: YearlySnapshot[]
  finalBondValue: number
  finalGiaValue: number
  totalTaxDeferred: number      // £ tax saved vs GIA route
  totalWithdrawalsTaken: number
  timeApportionmentRelief: number  // % reduction on taxable gain if non-UK resident
  taxableGainAtMaturity: number    // after TAR applied
  effectiveAnnualAdvantage: number // % p.a. advantage of bond over GIA (withdrawals counted back in)
}

export function calculateBond(params: BondParams): BondResult {
  const snapshots: YearlySnapshot[] = []

  // GIA: taxed annually on growth, so it compounds at a lower after-tax rate.
  const afterTaxGrowthRate = params.annualGrowthRate * (1 - params.taxRate / 100) / 100
  // Bond: gross roll-up — full growth rate, no annual tax drag.
  const bondGrowthRate = params.annualGrowthRate / 100

  // 5% withdrawal allowance: up to 5% of the original premium per year,
  // tax-deferred, until the cumulative allowance (100% of premium) is used up.
  const maxAnnualWithdrawal = params.startingAmount * 0.05
  const actualWithdrawal = Math.min(params.annualWithdrawal, maxAnnualWithdrawal)

  let bondValue = params.startingAmount
  let giaValue = params.startingAmount
  let cumulativeWithdrawals = 0
  let cumulativeTaxSaved = 0
  let fivePercentUsed = 0

  for (let year = 1; year <= params.timeHorizonYears; year++) {
    // Grow first, then withdraw — and capture the growth amount *before* the
    // withdrawal is subtracted, so the tax-saved figure reflects the real
    // growth for the year rather than being distorted by that year's draw.
    const bondValueBeforeGrowth = bondValue
    bondValue = bondValue * (1 + bondGrowthRate)
    const bondGrowthThisYear = bondValue - bondValueBeforeGrowth

    if (actualWithdrawal > 0 && fivePercentUsed < 100) {
      const withdrawalPct = (actualWithdrawal / params.startingAmount) * 100
      fivePercentUsed = Math.min(100, fivePercentUsed + withdrawalPct)
      bondValue = Math.max(0, bondValue - actualWithdrawal)
      cumulativeWithdrawals += actualWithdrawal
    }

    giaValue = giaValue * (1 + afterTaxGrowthRate)

    const taxThatWouldHaveBeenPaid = bondGrowthThisYear * (params.taxRate / 100)
    cumulativeTaxSaved += taxThatWouldHaveBeenPaid

    snapshots.push({
      year,
      bondValue: Math.round(bondValue),
      giaValue: Math.round(giaValue),
      bondWithdrawals: Math.round(cumulativeWithdrawals),
      taxSavedSoFar: Math.round(cumulativeTaxSaved),
      fivePercentAllowanceUsed: Math.round(fivePercentUsed),
    })
  }

  // Time-apportionment relief — reduces the taxable gain proportionally to
  // time spent non-UK resident.
  const totalYears = params.timeHorizonYears
  const tarFraction = totalYears > 0 ? params.nonUkResidentYears / totalYears : 0
  const totalGain = bondValue - params.startingAmount
  const taxableGainAfterTAR = totalGain * (1 - tarFraction)

  // Effective annual advantage — compares like-for-like by adding withdrawn
  // cash back to the bond's final value, since money already drawn out is
  // still part of the bond's real return, not a performance shortfall.
  const bondEffectiveTotal = bondValue + cumulativeWithdrawals
  const bondCAGR = totalYears > 0 ? Math.pow(bondEffectiveTotal / params.startingAmount, 1 / totalYears) - 1 : 0
  const giaCAGR = totalYears > 0 ? Math.pow(giaValue / params.startingAmount, 1 / totalYears) - 1 : 0
  const effectiveAdvantage = (bondCAGR - giaCAGR) * 100

  return {
    yearlySnapshots: snapshots,
    finalBondValue: Math.round(bondValue),
    finalGiaValue: Math.round(giaValue),
    totalTaxDeferred: Math.round(cumulativeTaxSaved),
    totalWithdrawalsTaken: Math.round(cumulativeWithdrawals),
    timeApportionmentRelief: Math.round(tarFraction * 100),
    taxableGainAtMaturity: Math.round(taxableGainAfterTAR),
    effectiveAnnualAdvantage: Math.round(effectiveAdvantage * 100) / 100,
  }
}

export function formatGBP(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
  }).format(amount)
}
