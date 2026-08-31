// Pure client/server-safe calculation logic for the Ardan Platform visualizer.
// No I/O, no Claude, no DB — deterministic maths only, illustrative not actuarial.
// Story: same gross growth rate, but Ardan's unbundled fees (platform + adviser
// + fund) are lower than a bundled/legacy alternative's single all-in fee —
// that fee-drag difference compounds into a materially different end value.

export interface ArdanParams {
  startingAmount: number       // £/$, e.g. 100000
  monthlyContribution: number  // regular savings, 0 if disabled
  annualGrowthRate: number     // % gross, before fees, e.g. 6
  timeHorizonYears: number     // e.g. 15
  ardanPlatformFee: number     // % p.a.
  ardanAdviserFee: number      // % p.a.
  ardanFundFee: number         // % p.a.
  bundledTotalFee: number      // % p.a. — legacy/bundled alternative's single all-in fee
}

export interface ArdanYearlySnapshot {
  year: number
  ardanValue: number
  bundledValue: number
  ardanFeesPaidCumulative: number
  bundledFeesPaidCumulative: number
  contributionsCumulative: number
}

export interface ArdanResult {
  yearlySnapshots: ArdanYearlySnapshot[]
  finalArdanValue: number
  finalBundledValue: number
  ardanTotalFeeRate: number         // sum of the 3 Ardan fee components, % p.a.
  totalFeesSavedVsBundled: number   // £ cumulative fees avoided
  costAdvantageAmount: number       // finalArdanValue - finalBundledValue
  costAdvantagePct: number
  effectiveAnnualFeeSaving: number  // bundledTotalFee - ardanTotalFeeRate, pp
}

export function calculateArdan(params: ArdanParams): ArdanResult {
  const ardanTotalFeeRate = params.ardanPlatformFee + params.ardanAdviserFee + params.ardanFundFee
  const ardanNetGrowth = (params.annualGrowthRate - ardanTotalFeeRate) / 100
  const bundledNetGrowth = (params.annualGrowthRate - params.bundledTotalFee) / 100
  const annualContribution = params.monthlyContribution * 12

  let ardanValue = params.startingAmount
  let bundledValue = params.startingAmount
  let ardanFeesPaid = 0
  let bundledFeesPaid = 0
  let contributions = 0

  const snapshots: ArdanYearlySnapshot[] = []

  for (let year = 1; year <= params.timeHorizonYears; year++) {
    // Fee charged on the balance at the start of the year, before that
    // year's growth and contribution are applied.
    ardanFeesPaid += ardanValue * (ardanTotalFeeRate / 100)
    bundledFeesPaid += bundledValue * (params.bundledTotalFee / 100)

    ardanValue = ardanValue * (1 + ardanNetGrowth) + annualContribution
    bundledValue = bundledValue * (1 + bundledNetGrowth) + annualContribution
    contributions += annualContribution

    snapshots.push({
      year,
      ardanValue: Math.round(ardanValue),
      bundledValue: Math.round(bundledValue),
      ardanFeesPaidCumulative: Math.round(ardanFeesPaid),
      bundledFeesPaidCumulative: Math.round(bundledFeesPaid),
      contributionsCumulative: Math.round(contributions),
    })
  }

  const costAdvantageAmount = ardanValue - bundledValue
  const costAdvantagePct = bundledValue > 0 ? (costAdvantageAmount / bundledValue) * 100 : 0

  return {
    yearlySnapshots: snapshots,
    finalArdanValue: Math.round(ardanValue),
    finalBundledValue: Math.round(bundledValue),
    ardanTotalFeeRate: Math.round(ardanTotalFeeRate * 100) / 100,
    totalFeesSavedVsBundled: Math.round(bundledFeesPaid - ardanFeesPaid),
    costAdvantageAmount: Math.round(costAdvantageAmount),
    costAdvantagePct: Math.round(costAdvantagePct * 10) / 10,
    effectiveAnnualFeeSaving: Math.round((params.bundledTotalFee - ardanTotalFeeRate) * 100) / 100,
  }
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(amount)
}
