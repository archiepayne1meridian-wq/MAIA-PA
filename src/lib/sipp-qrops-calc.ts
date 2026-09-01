// Pure client/server-safe calculation logic for the SIPP vs QROPS visualizer.
// No I/O, no Claude, no DB — deterministic maths only, illustrative not actuarial.
// Story: since October 2024, a 25% Overseas Transfer Charge (OTC) applies to most
// QROPS transfers unless the client lives in the same country as the QROPS scheme —
// this shows the real cost of that charge and where each structure is appropriate.

export interface SIPPQROPSParams {
  pensionValue: number            // £, current transfer value
  clientAge: number               // e.g. 45
  retirementAge: number           // e.g. 65
  annualGrowthRate: number        // % p.a. e.g. 6
  clientCountry: string           // where client lives e.g. "Switzerland"
  qropsCountry: string            // where QROPS scheme is based e.g. "Malta"
  sameCountry: boolean            // client country === QROPS country (OTC exempt)
  drawdownRate: number            // % per year in retirement e.g. 4
  ihtInScope: boolean             // is client in UK IHT net (10 of 20 years rule)
}

export interface YearlyComparison {
  year: number
  age: number
  sippValue: number
  qropsValueWithCharge: number    // after 25% OTC deducted at outset
  qropsValueNoCharge: number      // if OTC exempt (same country)
  sippDrawdown: number            // annual income if in drawdown
  qropsDrawdownWithCharge: number
  qropsDrawdownNoCharge: number
}

export interface SIPPQROPSResult {
  // Transfer values
  originalPensionValue: number
  otcCharge: number               // 25% of transfer value (if applicable)
  qropsStartingValue: number      // after OTC deducted
  sippStartingValue: number       // full value (no transfer charge)

  // At retirement
  sippValueAtRetirement: number
  qropsValueAtRetirementWithCharge: number
  qropsValueAtRetirementNoCharge: number

  // The OTC cost compounded
  otcCostAtRetirement: number     // what the 25% charge costs after growth

  // Break-even
  yearsToBreakEven: number | null // years for QROPS (with charge) to catch up to SIPP

  // IHT (post April 2027 — both affected)
  ihtOnSIPP: number               // 40% on value above nil-rate band (simplified)
  ihtOnQROPS: number              // same rule post April 2027

  // Annual drawdown comparison
  sippAnnualIncome: number
  qropsAnnualIncomeWithCharge: number
  qropsAnnualIncomeNoCharge: number

  yearlyComparisons: YearlyComparison[]
  yearsToRetirement: number
}

export function calculateSIPPvsQROPS(params: SIPPQROPSParams): SIPPQROPSResult {
  const otcCharge = params.sameCountry ? 0 : params.pensionValue * 0.25
  const qropsStart = params.pensionValue - otcCharge
  const sippStart = params.pensionValue
  const years = params.retirementAge - params.clientAge
  const growthRate = params.annualGrowthRate / 100

  // Grow both to retirement
  const sippAtRetirement = sippStart * Math.pow(1 + growthRate, years)
  const qropsWithChargeAtRetirement = qropsStart * Math.pow(1 + growthRate, years)
  const qropsNoChargeAtRetirement = params.pensionValue * Math.pow(1 + growthRate, years)

  // What the OTC charge costs after growth (compounded opportunity cost)
  const otcCostCompounded = otcCharge * Math.pow(1 + growthRate, years)

  // Break-even analysis (would only apply if QROPS has higher growth — usually same)
  // In this model both grow at same rate so QROPS with charge never catches up
  // unless QROPS has additional benefits — show this clearly
  const yearsToBreakEven = params.sameCountry ? 0 : null

  // Annual drawdown
  const drawdownRate = params.drawdownRate / 100
  const sippIncome = sippAtRetirement * drawdownRate
  const qropsIncomeWithCharge = qropsWithChargeAtRetirement * drawdownRate
  const qropsIncomeNoCharge = qropsNoChargeAtRetirement * drawdownRate

  // IHT (simplified — both in scope post April 2027)
  const nilRateBand = 325000
  const ihtOnSIPP = params.ihtInScope
    ? Math.max(0, (sippAtRetirement - nilRateBand) * 0.4)
    : 0
  const ihtOnQROPS = params.ihtInScope
    ? Math.max(0, (qropsWithChargeAtRetirement - nilRateBand) * 0.4)
    : 0

  // Yearly comparisons
  const comparisons: YearlyComparison[] = []
  let sippVal = sippStart
  let qropsWithVal = qropsStart
  let qropsNoVal = params.pensionValue

  for (let year = 1; year <= years; year++) {
    sippVal = sippVal * (1 + growthRate)
    qropsWithVal = qropsWithVal * (1 + growthRate)
    qropsNoVal = qropsNoVal * (1 + growthRate)

    comparisons.push({
      year,
      age: params.clientAge + year,
      sippValue: Math.round(sippVal),
      qropsValueWithCharge: Math.round(qropsWithVal),
      qropsValueNoCharge: Math.round(qropsNoVal),
      sippDrawdown: Math.round(sippVal * drawdownRate),
      qropsDrawdownWithCharge: Math.round(qropsWithVal * drawdownRate),
      qropsDrawdownNoCharge: Math.round(qropsNoVal * drawdownRate),
    })
  }

  return {
    originalPensionValue: params.pensionValue,
    otcCharge: Math.round(otcCharge),
    qropsStartingValue: Math.round(qropsStart),
    sippStartingValue: Math.round(sippStart),
    sippValueAtRetirement: Math.round(sippAtRetirement),
    qropsValueAtRetirementWithCharge: Math.round(qropsWithChargeAtRetirement),
    qropsValueAtRetirementNoCharge: Math.round(qropsNoChargeAtRetirement),
    otcCostAtRetirement: Math.round(otcCostCompounded),
    yearsToBreakEven,
    ihtOnSIPP: Math.round(ihtOnSIPP),
    ihtOnQROPS: Math.round(ihtOnQROPS),
    sippAnnualIncome: Math.round(sippIncome),
    qropsAnnualIncomeWithCharge: Math.round(qropsIncomeWithCharge),
    qropsAnnualIncomeNoCharge: Math.round(qropsIncomeNoCharge),
    yearlyComparisons: comparisons,
    yearsToRetirement: years,
  }
}

export function formatGBP(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
  }).format(amount)
}
