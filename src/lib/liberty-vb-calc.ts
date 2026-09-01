// Pure client/server-safe calculation logic for the Liberty Vested Benefits visualizer.
// No I/O, no Claude, no DB — deterministic maths only, illustrative not actuarial.
// Story: Swiss Pillar 2 vested benefits default to a near-zero cash account and
// quietly lose real purchasing power to inflation. Liberty Invest lets the same
// money target a real return instead — this shows the size of that gap.

export interface LibertyParams {
  startingAmount: number        // CHF, e.g. 85000
  cashInterestRate: number      // % p.a., default 0.02
  investedGrowthRate: number    // % p.a., e.g. 5
  inflationRate: number         // % p.a., e.g. 1.5
  timeHorizonYears: number      // e.g. 10
  annualContribution: number    // CHF per year additional, default 0
}

export interface YearlySnapshot {
  year: number
  cashNominal: number           // nominal value in cash
  cashReal: number              // real purchasing power (inflation adjusted)
  investedValue: number         // invested value
  investedReal: number          // invested real purchasing power
  inflationErosion: number      // cumulative purchasing power lost on cash
  investedAdvantage: number     // invested value minus cash nominal
}

export interface LibertyResult {
  yearlySnapshots: YearlySnapshot[]
  finalCashNominal: number
  finalCashReal: number
  finalInvestedValue: number
  finalInvestedReal: number
  totalInflationErosion: number  // CHF of purchasing power lost sitting in cash
  totalInvestedAdvantage: number // CHF extra vs cash
  realReturnAdvantage: number    // % p.a. real return advantage
  breakEvenYear: number | null   // year invested clearly pulls ahead
}

export function calculateLiberty(params: LibertyParams): LibertyResult {
  const cashRate = params.cashInterestRate / 100
  const investedRate = params.investedGrowthRate / 100
  const inflationRate = params.inflationRate / 100

  let cashNominal = params.startingAmount
  let cashReal = params.startingAmount
  let investedValue = params.startingAmount
  let investedReal = params.startingAmount
  let cumulativeErosion = 0
  let breakEvenYear: number | null = null

  const snapshots: YearlySnapshot[] = []

  for (let year = 1; year <= params.timeHorizonYears; year++) {
    // Add annual contribution
    cashNominal += params.annualContribution
    investedValue += params.annualContribution

    // Cash grows at near-zero rate
    cashNominal = cashNominal * (1 + cashRate)

    // Real value of cash erodes with inflation
    cashReal = cashNominal / Math.pow(1 + inflationRate, year)

    // Invested grows at target rate
    investedValue = investedValue * (1 + investedRate)

    // Real value of invested (inflation adjusted)
    investedReal = investedValue / Math.pow(1 + inflationRate, year)

    // Inflation erosion = what cash should be worth vs what it actually buys
    const expectedValue = params.startingAmount * Math.pow(1 + inflationRate, year)
    cumulativeErosion = expectedValue - cashNominal

    if (!breakEvenYear && investedValue > cashNominal * 1.05) {
      breakEvenYear = year
    }

    snapshots.push({
      year,
      cashNominal: Math.round(cashNominal),
      cashReal: Math.round(cashReal),
      investedValue: Math.round(investedValue),
      investedReal: Math.round(investedReal),
      inflationErosion: Math.round(cumulativeErosion),
      investedAdvantage: Math.round(investedValue - cashNominal),
    })
  }

  const lastSnapshot = snapshots[snapshots.length - 1]
  const realReturnAdv = ((lastSnapshot.investedReal / lastSnapshot.cashReal) - 1) * 100 /
    params.timeHorizonYears

  return {
    yearlySnapshots: snapshots,
    finalCashNominal: lastSnapshot.cashNominal,
    finalCashReal: lastSnapshot.cashReal,
    finalInvestedValue: lastSnapshot.investedValue,
    finalInvestedReal: lastSnapshot.investedReal,
    totalInflationErosion: lastSnapshot.inflationErosion,
    totalInvestedAdvantage: lastSnapshot.investedAdvantage,
    realReturnAdvantage: Math.round(realReturnAdv * 100) / 100,
    breakEvenYear,
  }
}

export function formatCHF(amount: number): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency', currency: 'CHF', maximumFractionDigits: 0,
  }).format(amount)
}
