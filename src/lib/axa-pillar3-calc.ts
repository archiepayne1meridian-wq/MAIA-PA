// Pure client/server-safe calculation logic for the AXA SmartFlex Pillar 3a visualizer.
// No I/O, no Claude, no DB — deterministic maths only, illustrative not actuarial.
// Story: Pillar 3a contributions are fully tax-deductible from Swiss taxable income —
// the true cost of a contribution is lower than it appears once the tax saving lands,
// and the guaranteed + market-linked split grows tax-free until a reduced-rate withdrawal.

export interface Pillar3Params {
  annualContribution: number      // CHF, max 7258 for 2026 (employed)
  currentAge: number              // e.g. 35
  retirementAge: number           // e.g. 65 (Swiss standard)
  marginalTaxRate: number         // %, e.g. 35 (Swiss cantonal + federal combined)
  guaranteedRate: number          // % p.a. on guaranteed portion, e.g. 1.5
  marketLinkedRate: number        // % p.a. on market portion, e.g. 5
  guaranteedSplit: number         // % in guaranteed portion, e.g. 40 (rest in market)
  withdrawalTaxRate: number       // % tax on lump sum withdrawal, e.g. 8 (reduced rate)
}

export interface YearlySnapshot {
  year: number
  age: number
  guaranteedValue: number
  marketValue: number
  totalValue: number
  cumulativeContributions: number
  cumulativeTaxSaved: number
  noContributionAlternative: number // if same money went into cash savings instead
}

export interface Pillar3Result {
  yearlySnapshots: YearlySnapshot[]
  yearsToRetirement: number
  totalContributions: number
  totalTaxSavedOnContributions: number  // annual tax saving × years
  finalGuaranteedValue: number
  finalMarketValue: number
  finalTotalValue: number
  taxOnWithdrawal: number               // withdrawal tax at reduced rate
  netValueAfterWithdrawalTax: number
  netCostOfContributions: number        // total contributions - tax saved on contributions
  effectiveReturn: number               // % p.a. on net cost
  vsNoContribution: number              // extra wealth vs not contributing
  annualTaxSaving: number               // tax saved per year
  trueAnnualCost: number                // contribution - annual tax saving
}

export function calculatePillar3(params: Pillar3Params): Pillar3Result {
  const years = params.retirementAge - params.currentAge
  const guaranteedFraction = params.guaranteedSplit / 100
  const marketFraction = 1 - guaranteedFraction
  const annualTaxSaving = params.annualContribution * (params.marginalTaxRate / 100)
  const trueAnnualCost = params.annualContribution - annualTaxSaving

  let guaranteedValue = 0
  let marketValue = 0
  let cumulativeContributions = 0
  let cumulativeTaxSaved = 0
  let noContribAlternative = 0 // same net cost invested in cash at 0.5%

  const snapshots: YearlySnapshot[] = []

  for (let year = 1; year <= years; year++) {
    // Grow existing values
    guaranteedValue = guaranteedValue * (1 + params.guaranteedRate / 100)
    marketValue = marketValue * (1 + params.marketLinkedRate / 100)
    noContribAlternative = noContribAlternative * (1 + 0.005) // 0.5% cash

    // Add this year's contribution split between guaranteed and market
    guaranteedValue += params.annualContribution * guaranteedFraction
    marketValue += params.annualContribution * marketFraction
    noContribAlternative += trueAnnualCost // what they'd save without Pillar 3

    cumulativeContributions += params.annualContribution
    cumulativeTaxSaved += annualTaxSaving

    snapshots.push({
      year,
      age: params.currentAge + year,
      guaranteedValue: Math.round(guaranteedValue),
      marketValue: Math.round(marketValue),
      totalValue: Math.round(guaranteedValue + marketValue),
      cumulativeContributions: Math.round(cumulativeContributions),
      cumulativeTaxSaved: Math.round(cumulativeTaxSaved),
      noContributionAlternative: Math.round(noContribAlternative),
    })
  }

  const finalTotal = guaranteedValue + marketValue
  const withdrawalTax = finalTotal * (params.withdrawalTaxRate / 100)
  const netValue = finalTotal - withdrawalTax
  const netCost = cumulativeContributions - cumulativeTaxSaved
  const effectiveReturn = netCost > 0
    ? (Math.pow(netValue / netCost, 1 / years) - 1) * 100
    : 0

  return {
    yearlySnapshots: snapshots,
    yearsToRetirement: years,
    totalContributions: Math.round(cumulativeContributions),
    totalTaxSavedOnContributions: Math.round(cumulativeTaxSaved),
    finalGuaranteedValue: Math.round(guaranteedValue),
    finalMarketValue: Math.round(marketValue),
    finalTotalValue: Math.round(finalTotal),
    taxOnWithdrawal: Math.round(withdrawalTax),
    netValueAfterWithdrawalTax: Math.round(netValue),
    netCostOfContributions: Math.round(netCost),
    effectiveReturn: Math.round(effectiveReturn * 100) / 100,
    vsNoContribution: Math.round(netValue - noContribAlternative),
    annualTaxSaving: Math.round(annualTaxSaving),
    trueAnnualCost: Math.round(trueAnnualCost),
  }
}

export function formatCHF(amount: number): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency', currency: 'CHF', maximumFractionDigits: 0,
  }).format(amount)
}
