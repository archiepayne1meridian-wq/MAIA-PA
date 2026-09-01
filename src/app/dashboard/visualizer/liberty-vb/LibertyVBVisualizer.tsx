'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import s from '../../dashboard.module.css'
import { calculateLiberty, formatCHF, type LibertyParams, type YearlySnapshot } from '@/lib/liberty-vb-calc'
import ProductProfile from '@/components/atlas/ProductProfile'

// ── Types & defaults ─────────────────────────────────────────────────────────

interface LibertyFormState {
  startingAmount: number
  cashInterestRate: number
  investedGrowthRate: number
  inflationRate: number
  timeHorizonYears: number
}

const DEFAULT_LIBERTY_FORM: LibertyFormState = {
  startingAmount: 85000,
  cashInterestRate: 0.02,
  investedGrowthRate: 5,
  inflationRate: 1.5,
  timeHorizonYears: 10,
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function fmtPct(n: number, dp = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%`
}
function formatAxisCHF(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `CHF ${(v / 1_000_000).toFixed(1)}m`
  if (Math.abs(v) >= 1000) return `CHF ${Math.round(v / 1000)}k`
  return `CHF ${v}`
}
function fmtCHF(n: number): string {
  return formatCHF(n)
}

type ChartRow = YearlySnapshot & { gap: number }

// ── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipPayloadItem { dataKey?: string; value?: number; payload?: ChartRow }

function LibertyTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: number }) {
  if (!active || !payload || payload.length === 0) return null
  const invested = payload.find(p => p.dataKey === 'investedValue')?.value ?? 0
  const cashNominal = payload.find(p => p.dataKey === 'cashNominal')?.value ?? 0
  const cashReal = payload.find(p => p.dataKey === 'cashReal')?.value ?? 0
  const erosion = payload[0]?.payload?.inflationErosion ?? 0
  return (
    <div style={{
      background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '9px 13px', fontSize: 11, fontFamily: 'var(--mono)',
    }}>
      <div style={{ color: 'var(--text-dim)', marginBottom: 5 }}>Year {label}</div>
      <div style={{ color: 'var(--accent)' }}>Liberty Invest: {fmtCHF(invested)}</div>
      <div style={{ color: 'var(--idle)' }}>Cash (nominal): {fmtCHF(cashNominal)}</div>
      <div style={{ color: 'var(--alert)' }}>Cash (real): {fmtCHF(cashReal)}</div>
      <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>Inflation erosion: {fmtCHF(erosion)}</div>
    </div>
  )
}

// ── Product profile data ─────────────────────────────────────────────────────

const PROFILE_DATA = {
  productName: 'Liberty Vested Benefits',
  whatItIs: 'Liberty Vested Benefits (Liberty Freizügigkeit) is a Swiss vested benefits foundation that allows former employees to invest their Pillar 2 funds rather than leaving them in a default cash account. When an employee leaves a Swiss employer, Pillar 2 contributions must transfer to a vested benefits account — Liberty offers both a cash option (0.02% p.a.) and an investment option (Liberty Invest) with access to diversified funds. The account is held until the client starts a new Swiss job, leaves Switzerland, retires, or buys Swiss property.',
  whatItHolds: [
    'Cash (default — ~0.02% p.a.)',
    'Liberty Invest funds (diversified fund portfolios)',
    'Choice of risk profiles (conservative to growth)',
    'Can be split across two foundations to reduce tax on payout',
  ],
  whoItsFor: [
    'Any expat who has left a Swiss employer and has vested benefits sitting in cash',
    'Client between jobs in Switzerland who wants their Pillar 2 working harder',
    'Client planning to stay in Switzerland long-term who won’t need the funds soon',
    'Client leaving Switzerland permanently — funds can be withdrawn on departure',
    'NOT suitable for clients who need the funds within 1-2 years (short-term volatility risk)',
  ],
  keyBenefits: [
    'Turns idle cash into a working investment — real returns vs near-zero interest',
    'Protects purchasing power against Swiss inflation',
    'Can be split across two foundations — reduces tax liability on eventual payout',
    'Full transparency on fund choice and charges',
    'Funds remain accessible — not locked in beyond standard VB rules',
  ],
  gaps: [
    'Client who left a Swiss employer and doesn’t know where their Pillar 2 went',
    'Client with CHF 50,000-200,000 sitting in a VB account earning 0.02% — the most common situation',
    'Client who thinks their Pillar 2 is ‘safe’ in cash but losing to inflation every year',
    'Client who has been in Switzerland for years and has multiple VB accounts from different employers',
    'Client approaching Swiss exit who hasn’t optimised their VB structure before withdrawal',
  ],
  comparisons: [
    { product: 'Default cash VB account', difference: 'Cash earns ~0.02% p.a. — Liberty Invest targets meaningful real returns through fund investment.', useWhen: 'Use Liberty Invest when client has a horizon of 2+ years and can tolerate some investment risk' },
    { product: 'Pillar 3a (AXA SmartFlex)', difference: 'VB is money from a previous employer — Pillar 3a is voluntary private contributions. Different pots, both worth optimising.', useWhen: 'Optimise both separately — VB via Liberty, future contributions via Pillar 3a' },
    { product: 'Portfolio bond (RL360)', difference: 'VB funds have restrictions on when they can be withdrawn (regulated by Swiss law). A portfolio bond is for unrestricted lump sums.', useWhen: 'Use Liberty VB for restricted Pillar 2 funds. Use portfolio bond for other lump sums.' },
    { product: 'Ardan Platform', difference: 'Ardan holds unrestricted investments. Liberty VB holds regulated Pillar 2 funds — different legal structure and withdrawal rules.', useWhen: 'Liberty VB for Pillar 2 funds specifically. Ardan for other investments.' },
  ],
  whenToUseVs: [
    { useThis: 'Client has Pillar 2 funds in a VB account earning nothing — invest them via Liberty Invest', useAlternative: 'Client needs access to VB funds within 1-2 years — short horizon makes investment risk inappropriate', alternative: 'Leave in cash VB account' },
    { useThis: 'Client has multiple old VB accounts from different Swiss employers — consolidate and invest', useAlternative: 'Client is about to start a new Swiss job — funds will transfer to new employer scheme automatically', alternative: 'Wait for transfer to new employer scheme' },
  ],
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LibertyVBVisualizer() {
  const router = useRouter()
  const [form, setForm] = useState<LibertyFormState>(DEFAULT_LIBERTY_FORM)

  function updateField<K extends keyof LibertyFormState>(key: K, value: LibertyFormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const libertyParams: LibertyParams = {
    startingAmount: form.startingAmount,
    cashInterestRate: form.cashInterestRate,
    investedGrowthRate: form.investedGrowthRate,
    inflationRate: form.inflationRate,
    timeHorizonYears: form.timeHorizonYears,
    annualContribution: 0,
  }

  const result = useMemo(() => calculateLiberty(libertyParams), [
    form.startingAmount, form.cashInterestRate, form.investedGrowthRate,
    form.inflationRate, form.timeHorizonYears,
  ])

  const chartData: ChartRow[] = result.yearlySnapshots.map(snap => ({
    ...snap,
    gap: Math.max(0, snap.investedValue - snap.cashReal),
  }))

  const gapAtMaturity = Math.max(0, result.finalInvestedValue - result.finalCashReal)
  const investedBarPct = result.finalInvestedValue + result.finalCashNominal > 0
    ? (result.finalInvestedValue / (result.finalInvestedValue + result.finalCashNominal)) * 100 : 50
  const realCashReturn = form.cashInterestRate - form.inflationRate
  const nominalAdvantagePct = result.finalCashNominal > 0
    ? (result.totalInvestedAdvantage / result.finalCashNominal) * 100 : 0
  const realValueAdvantage = result.finalInvestedReal - result.finalCashReal
  const realValueAdvantagePct = result.finalCashReal > 0
    ? (realValueAdvantage / result.finalCashReal) * 100 : 0

  return (
    <div className={s.vizPage}>
      <button className={s.agentPageBack} onClick={() => router.push('/dashboard/visualizer')}>← ATLAS</button>

      <div className={s.vizPageHead}>
        <div className={s.drawerBadge}>LB</div>
        <div>
          <div className={s.drawerName}>ATLAS — Liberty Vested Benefits</div>
          <div className={s.drawerRole}>Cash erosion vs invested real returns on Swiss Pillar 2 vested benefits</div>
        </div>
      </div>

      {/* Section 1 — Product Summary */}
      <div className={s.vizIntroCard}>
        <div className={s.vizIntroTitle}>Liberty Vested Benefits</div>
        <div className={s.bondPillsRow}>
          <span className={[s.bondPill, s.bondPillAccent].join(' ')}>Invested Returns</span>
          <span className={[s.bondPill, s.bondPillGreen].join(' ')}>Inflation Protection</span>
          <span className={[s.bondPill, s.bondPillAmber].join(' ')}>Swiss Pillar 2</span>
        </div>
        <p className={s.vizIntroText}>
          When you leave a Swiss employer, your Pillar 2 pension contributions transfer to a Vested
          Benefits (Freizügigkeit) account. By default, this money sits in cash earning approximately
          0.02% interest — while Swiss inflation quietly erodes its real purchasing power. Liberty
          Invest allows you to invest vested benefits in funds, protecting and growing the real value
          of the money until it is needed. The cost of doing nothing is invisible until someone shows
          you the numbers.
        </p>
      </div>

      {/* Section 2 — Controls */}
      <div className={s.libertyControls}>
        <div className={s.bondControlsCol}>
          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Vested Benefits Balance</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{fmtCHF(form.startingAmount)}</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={10000} max={500000} step={5000}
              value={form.startingAmount} onChange={e => updateField('startingAmount', Number(e.target.value))} />
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Liberty Invest Target Return</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.investedGrowthRate}% p.a.</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={1} max={12} step={0.5}
              value={form.investedGrowthRate} onChange={e => updateField('investedGrowthRate', Number(e.target.value))} />
            <span className={s.bondSliderHint}>Illustration only — not guaranteed</span>
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Cash Interest Rate (default 0.02%)</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.cashInterestRate.toFixed(2)}% p.a.</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={0} max={1} step={0.01}
              value={form.cashInterestRate} onChange={e => updateField('cashInterestRate', Number(e.target.value))} />
            <span className={s.bondSliderHint}>Liberty cash accounts currently pay ~0.02% p.a.</span>
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Swiss Inflation Rate</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.inflationRate.toFixed(1)}% p.a.</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={0} max={4} step={0.1}
              value={form.inflationRate} onChange={e => updateField('inflationRate', Number(e.target.value))} />
            <span className={s.bondSliderHint}>Swiss CPI averaged ~1.5% p.a. historically</span>
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Time Until Funds Needed</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.timeHorizonYears} years</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={1} max={20} step={1}
              value={form.timeHorizonYears} onChange={e => updateField('timeHorizonYears', Number(e.target.value))} />
          </div>
        </div>

        <div className={s.libertyContextPanel}>
          <span className={s.eyebrow}>What Are Vested Benefits?</span>
          <p className={s.profileText}>
            In Switzerland, every employee contributes to Pillar 2 (BVG/LPP) — the occupational
            pension. When you leave an employer, these funds don&apos;t stay with the old pension
            fund. They transfer to a Vested Benefits account (Freizügigkeitskonto) until you:
          </p>
          <div className={s.profileBulletList}>
            <div className={s.profileBullet}><span className={s.profileDotAccent} /><span>Start a new job in Switzerland (funds transfer to new employer&apos;s scheme)</span></div>
            <div className={s.profileBullet}><span className={s.profileDotAccent} /><span>Withdraw on leaving Switzerland permanently</span></div>
            <div className={s.profileBullet}><span className={s.profileDotAccent} /><span>Reach retirement age</span></div>
            <div className={s.profileBullet}><span className={s.profileDotAccent} /><span>Buy property in Switzerland</span></div>
          </div>
          <p className={s.profileText}>
            Most people leave this money in the default cash option without realising it&apos;s
            earning almost nothing.
          </p>
          <div className={s.profileChips}>
            <span className={s.libertyFactChip}>~0.02% cash interest</span>
            <span className={s.libertyFactChip}>No employer contributions while in VB</span>
            <span className={s.libertyFactChip}>Can be split across 2 foundations</span>
            <span className={s.libertyFactChip}>Taxed on withdrawal</span>
          </div>
        </div>
      </div>

      {/* Section 3 — Main comparison chart */}
      <div className={s.bondChartArea}>
        <div className={s.bondChartTitle}>Liberty Invest vs Cash — Nominal &amp; Real Value</div>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--hairline)" strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} tickFormatter={v => `Y${v}`} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} tickFormatter={formatAxisCHF} width={60} />
            <Tooltip content={<LibertyTooltip />} />
            <Area type="monotone" dataKey="cashReal" stackId="gap" stroke="none" fill="transparent" isAnimationActive={false} />
            <Area type="monotone" dataKey="gap" stackId="gap" stroke="none" fill="var(--accent)" fillOpacity={0.1} isAnimationActive={false} />
            <Line type="monotone" dataKey="investedValue" stroke="var(--accent)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="cashNominal" stroke="var(--idle)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="cashReal" stroke="var(--alert)" strokeWidth={1.5} strokeDasharray="1 3" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className={s.bondChartCaption}>
          Real value gap: {fmtCHF(gapAtMaturity)} after {form.timeHorizonYears} years
        </div>
        <div className={s.bondLegendRow}>
          <div className={s.bondLegendItem}>
            <span className={s.bondLegendLine} style={{ background: 'var(--accent)' }} />
            Liberty Invest (nominal)
          </div>
          <div className={s.bondLegendItem}>
            <span className={s.bondLegendLine} style={{ borderTop: '2px dashed var(--idle)' }} />
            Cash (nominal)
          </div>
          <div className={s.bondLegendItem}>
            <span className={s.bondLegendLine} style={{ borderTop: '1.5px dotted var(--alert)' }} />
            Cash (real — inflation adjusted)
          </div>
        </div>
      </div>

      {/* Section 4 — Info panels */}
      <div className={s.bondInfoPanels}>
        <div className={s.libertyInfoPanel}>
          <div className={s.bondInfoPanelHead}>
            <span className={s.bondInfoPanelIcon}>📉</span>
            <span className={s.bondInfoPanelTitle}>Cost of Doing Nothing</span>
          </div>
          <div className={s.bondInfoBigFigure} style={{ color: 'var(--alert)', fontSize: 28 }}>
            {fmtCHF(result.totalInflationErosion)}
          </div>
          <div className={s.bondInfoLine}>in purchasing power lost to inflation over {form.timeHorizonYears} years</div>
          <div className={s.bondInfoLine}>
            Your {fmtCHF(form.startingAmount)} today will buy {fmtCHF(result.finalCashReal)} worth of
            goods in {form.timeHorizonYears} years — even with the interest earned.
          </div>
          <div className={s.libertyRealBar}>
            {result.yearlySnapshots.map(snap => (
              <div key={snap.year} className={s.libertyRealBarSeg}
                style={{ height: `${Math.min(100, Math.max(4, (snap.cashReal / form.startingAmount) * 100))}%` }} />
            ))}
          </div>
        </div>

        <div className={s.libertyInfoPanel}>
          <div className={s.bondInfoPanelHead}>
            <span className={s.bondInfoPanelIcon}>📈</span>
            <span className={s.bondInfoPanelTitle}>With Liberty Invest</span>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
            Invested: {fmtCHF(result.finalInvestedValue)}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: 'var(--idle)' }}>
            Cash: {fmtCHF(result.finalCashNominal)}
          </div>
          <div className={s.bondInfoBigFigure}>{fmtCHF(result.totalInvestedAdvantage)}</div>
          <div className={s.bondInfoLine}>Advantage over leaving funds in cash</div>
          <div className={s.bondInfoLine}>Real return advantage: {fmtPct(result.realReturnAdvantage, 2)} p.a. above cash</div>
          <div className={s.bondCompareBar}>
            <div className={s.bondCompareBarBond} style={{ width: `${investedBarPct}%` }} />
            <div className={s.bondCompareBarGia} style={{ width: `${100 - investedBarPct}%` }} />
          </div>
        </div>

        <div className={s.libertyInfoPanel}>
          <div className={s.bondInfoPanelHead}>
            <span className={s.bondInfoPanelIcon}>🇨🇭</span>
            <span className={s.bondInfoPanelTitle}>Inflation in Real Terms</span>
          </div>
          <div className={s.bondInfoLine}>
            At {form.inflationRate.toFixed(1)}% inflation, {fmtCHF(form.startingAmount)} today has the
            purchasing power of {fmtCHF(result.finalCashReal)} in {form.timeHorizonYears} years. The
            cash account earns {form.cashInterestRate.toFixed(2)}%, but inflation runs at{' '}
            {form.inflationRate.toFixed(1)}% — meaning money in cash is going backwards in real terms
            every single year. This is the conversation most clients have never had.
          </div>
          <div className={s.libertyCallout}>
            Cash rate: {form.cashInterestRate.toFixed(2)}% · Inflation: {form.inflationRate.toFixed(1)}%
            {' '}· Real return: {fmtPct(realCashReturn, 2)}
          </div>
        </div>
      </div>

      {/* Section 5 — Returns Summary */}
      <div className={s.libertySummaryCard}>
        <div className={s.bondSummaryHead}>Liberty VB — Cash vs Invested — {form.timeHorizonYears} Year Comparison</div>
        <div className={s.bondSummaryRow}><span>Starting balance</span><span>{fmtCHF(form.startingAmount)}</span></div>
        <div className={s.bondSummaryRow}><span>Cash interest rate</span><span>{form.cashInterestRate.toFixed(2)}% p.a.</span></div>
        <div className={s.bondSummaryRow}><span>Target growth rate</span><span>{form.investedGrowthRate}% p.a.</span></div>
        <div className={s.bondSummaryRow}><span>Swiss inflation</span><span>{form.inflationRate.toFixed(1)}% p.a.</span></div>
        <hr className={s.bondSummaryDivider} />
        <div className={s.bondSummaryColHead}><span /><span>Liberty Invest</span><span>Cash</span></div>
        <div className={s.bondSummaryColRow}>
          <span>Final nominal value</span><span>{fmtCHF(result.finalInvestedValue)}</span><span>{fmtCHF(result.finalCashNominal)}</span>
        </div>
        <div className={s.bondSummaryColRow}>
          <span>Final real value</span><span>{fmtCHF(result.finalInvestedReal)}</span><span>{fmtCHF(result.finalCashReal)}</span>
        </div>
        <hr className={s.bondSummaryDivider} />
        <div className={s.bondSummaryTotal}>
          <span>Nominal advantage</span>
          <span>{fmtCHF(result.totalInvestedAdvantage)} ({fmtPct(nominalAdvantagePct)})</span>
        </div>
        <div className={s.bondSummaryRow}>
          <span>Real value advantage</span>
          <span>{fmtCHF(realValueAdvantage)} ({fmtPct(realValueAdvantagePct)})</span>
        </div>
        <div className={s.bondSummaryRow}>
          <span>Purchasing power lost (cash, inflation)</span><span>{fmtCHF(result.totalInflationErosion)}</span>
        </div>

        <div className={s.bondDisclaimer}>
          ⚠ Illustrations only. Investment returns not guaranteed. Liberty Invest returns depend on
          fund selection and market performance. Vested benefits tax treatment depends on individual
          circumstances.
        </div>
      </div>

      {/* Section 6 — Product Profile */}
      <ProductProfile {...PROFILE_DATA} />
    </div>
  )
}
