'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import s from '../../dashboard.module.css'
import { calculatePillar3, formatCHF, type Pillar3Params, type YearlySnapshot } from '@/lib/axa-pillar3-calc'
import ProductProfile from '@/components/atlas/ProductProfile'

// ── Types & defaults ─────────────────────────────────────────────────────────

interface Pillar3FormState {
  annualContribution: number
  currentAge: number
  marginalTaxRate: number
  guaranteedRate: number
  marketLinkedRate: number
  guaranteedSplit: number
  withdrawalTaxRate: number
}

const RETIREMENT_AGE = 65
const MAX_CONTRIBUTION_2026 = 7258

const DEFAULT_PILLAR3_FORM: Pillar3FormState = {
  annualContribution: MAX_CONTRIBUTION_2026,
  currentAge: 35,
  marginalTaxRate: 35,
  guaranteedRate: 1.5,
  marketLinkedRate: 5,
  guaranteedSplit: 40,
  withdrawalTaxRate: 8,
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

function Pillar3Tooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: number }) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload
  if (!row) return null
  return (
    <div style={{
      background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '9px 13px', fontSize: 11, fontFamily: 'var(--mono)',
    }}>
      <div style={{ color: 'var(--text-dim)', marginBottom: 5 }}>Age {label}</div>
      <div style={{ color: 'var(--accent)' }}>Total value: {fmtCHF(row.totalValue)}</div>
      <div style={{ color: 'var(--online)' }}>Guaranteed: {fmtCHF(row.guaranteedValue)}</div>
      <div style={{ color: 'var(--text-mid)' }}>Market-linked: {fmtCHF(row.marketValue)}</div>
      <div style={{ color: 'var(--alert)' }}>No contribution: {fmtCHF(row.noContributionAlternative)}</div>
      <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>Cumulative tax saved: {fmtCHF(row.cumulativeTaxSaved)}</div>
    </div>
  )
}

// ── Product profile data ─────────────────────────────────────────────────────

const PROFILE_DATA = {
  productName: 'AXA SmartFlex Pillar 3a',
  whatItIs: 'AXA SmartFlex is a Pillar 3a private pension product for Swiss residents. Pillar 3a is the voluntary third layer of Switzerland’s three-pillar pension system. Contributions are fully tax-deductible from Swiss cantonal and federal income tax, the money grows tax-free inside the wrapper, and is taxed at a significantly reduced rate on withdrawal. AXA SmartFlex combines a guaranteed portion (defined return, capital protection) with a market-linked portion (fund investment). The 2026 maximum contribution is CHF 7,258 for employed individuals.',
  whatItHolds: [
    'Guaranteed portion — defined interest rate, capital protected by AXA',
    'Market-linked portion — AXA investment themes (4 choices: defensive to growth)',
    'Split is adjustable — client chooses their guaranteed/market balance',
    'Long-term only — minimum 8+ year horizon recommended',
  ],
  whoItsFor: [
    'Swiss resident employee who is not yet contributing to Pillar 3a',
    'Client who wants to reduce their Swiss tax bill immediately',
    'Client with a long working horizon (ideally 10+ years to retirement)',
    'Client who wants guaranteed + market-linked combination — not pure risk',
    'NOT suitable for clients who may need the funds before age 60 (early withdrawal restricted)',
  ],
  keyBenefits: [
    'Immediate tax relief — every CHF 7,258 contributed saves meaningful tax at the margin',
    'Tax-free growth — no annual tax on interest or gains inside the wrapper',
    'Reduced withdrawal tax — typically 8-12% vs marginal income tax rate of 25-45%',
    'Guaranteed portion protects capital while market portion seeks growth',
    'Simple and accessible — set up once, contribute annually, review periodically',
  ],
  gaps: [
    'Swiss resident paying full income tax who has not set up a Pillar 3a — leaving tax savings on the table every year',
    'Client who thinks Swiss pensions are ‘handled by the employer’ — Pillar 3a is voluntary and most people never set it up',
    'Client in high-tax canton (Geneva, Vaud, Zurich) — the tax saving is most valuable where rates are highest',
    'Young professional newly arrived in Switzerland who has never been told about Pillar 3a',
    'Client with good income and no private pension savings beyond mandatory Pillar 2',
  ],
  comparisons: [
    { product: 'Liberty Vested Benefits', difference: 'VB holds money from a previous employer (restricted). Pillar 3a takes new voluntary contributions (ongoing). Different pots.', useWhen: 'Optimise both — VB via Liberty Invest, new contributions via AXA Pillar 3a' },
    { product: 'Portfolio bond (RL360)', difference: 'Portfolio bond is for larger lump sums, offshore, and non-Swiss residents. Pillar 3a is for Swiss residents making regular contributions with Swiss tax relief.', useWhen: 'Use Pillar 3a for Swiss tax-deductible contributions. Use portfolio bond for offshore lump sum investment.' },
    { product: 'Savings account', difference: 'Savings account offers no tax relief and taxable interest. Pillar 3a gives immediate tax deduction, tax-free growth, and lower exit tax.', useWhen: 'Use Pillar 3a for long-term retirement savings. Keep savings account for short-term accessible cash.' },
    { product: 'Pillar 2 (employer scheme)', difference: 'Pillar 2 is mandatory and employer-managed. Pillar 3a is voluntary, client-controlled, and fully portable.', useWhen: 'Pillar 2 is automatic. Pillar 3a is the additional layer the client actively chooses — the gap most people leave unfilled.' },
  ],
  whenToUseVs: [
    { useThis: 'Swiss resident employee who wants to reduce tax bill and build retirement savings simultaneously', useAlternative: 'Client is not Swiss tax resident — no Swiss tax relief available', alternative: 'Portfolio bond or offshore pension structure' },
    { useThis: 'Client has 10+ years to retirement and wants guaranteed + growth combination', useAlternative: 'Client needs funds within 5 years — early withdrawal restricted and penalised', alternative: 'Savings account or short-term investment' },
  ],
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AXAPillar3Visualizer() {
  const router = useRouter()
  const [form, setForm] = useState<Pillar3FormState>(DEFAULT_PILLAR3_FORM)

  function updateField<K extends keyof Pillar3FormState>(key: K, value: Pillar3FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const pillar3Params: Pillar3Params = {
    annualContribution: form.annualContribution,
    currentAge: form.currentAge,
    retirementAge: RETIREMENT_AGE,
    marginalTaxRate: form.marginalTaxRate,
    guaranteedRate: form.guaranteedRate,
    marketLinkedRate: form.marketLinkedRate,
    guaranteedSplit: form.guaranteedSplit,
    withdrawalTaxRate: form.withdrawalTaxRate,
  }

  const result = useMemo(() => calculatePillar3(pillar3Params), [
    form.annualContribution, form.currentAge, form.marginalTaxRate, form.guaranteedRate,
    form.marketLinkedRate, form.guaranteedSplit, form.withdrawalTaxRate,
  ])

  const chartData: ChartRow[] = result.yearlySnapshots.map(snap => ({
    ...snap,
    gap: Math.max(0, snap.totalValue - snap.noContributionAlternative),
  }))

  const marketSplit = 100 - form.guaranteedSplit
  const guaranteedAmount = form.annualContribution * (form.guaranteedSplit / 100)
  const marketAmount = form.annualContribution * (marketSplit / 100)
  const guaranteedBarPct = result.finalGuaranteedValue + result.finalMarketValue > 0
    ? (result.finalGuaranteedValue / (result.finalGuaranteedValue + result.finalMarketValue)) * 100 : 50
  const taxSavedPctOfTotal = result.totalContributions > 0
    ? (result.totalTaxSavedOnContributions / result.totalContributions) * 100 : 0
  // Illustrative estimate of tax-free growth benefit vs a taxable equivalent, at the marginal rate.
  const growthTaxSaved = Math.round((result.finalTotalValue - result.totalContributions) * (form.marginalTaxRate / 100))

  return (
    <div className={s.vizPage}>
      <button className={s.agentPageBack} onClick={() => router.push('/dashboard/visualizer')}>← ATLAS</button>

      <div className={s.vizPageHead}>
        <div className={s.drawerBadge}>P3</div>
        <div>
          <div className={s.drawerName}>ATLAS — AXA SmartFlex Pillar 3a</div>
          <div className={s.drawerRole}>Tax-deductible contributions, guaranteed + market-linked growth, Swiss retirement</div>
        </div>
      </div>

      {/* Section 1 — Product Summary */}
      <div className={s.vizIntroCard}>
        <div className={s.vizIntroTitle}>AXA SmartFlex — Pillar 3a</div>
        <div className={s.bondPillsRow}>
          <span className={[s.bondPill, s.bondPillAccent].join(' ')}>Tax Deductible</span>
          <span className={[s.bondPill, s.bondPillGreen].join(' ')}>Tax-Free Growth</span>
          <span className={[s.bondPill, s.bondPillAmber].join(' ')}>Reduced Withdrawal Tax</span>
        </div>
        <p className={s.vizIntroText}>
          Pillar 3a is Switzerland&apos;s voluntary private pension — contributions are fully
          tax-deductible from Swiss taxable income, reducing your tax bill immediately. The money
          grows tax-free inside the wrapper and is taxed at a significantly reduced rate on
          withdrawal. AXA SmartFlex combines a guaranteed portion (defined return, capital
          protection) with a market-linked portion (fund investment, higher potential). The maximum
          contribution for 2026 is CHF 7,258 for employed individuals. Every franc contributed costs
          less than it appears — once the tax saving is factored in, the true cost is{' '}
          {form.marginalTaxRate}% lower.
        </p>
      </div>

      {/* Section 2 — Controls */}
      <div className={s.pillar3Controls}>
        <div className={s.bondControlsCol}>
          <span className={s.eyebrow}>Personal Parameters</span>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Annual Pillar 3a Contribution</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{fmtCHF(form.annualContribution)} per year</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={1000} max={MAX_CONTRIBUTION_2026} step={100}
              value={form.annualContribution} onChange={e => updateField('annualContribution', Number(e.target.value))} />
            <span className={s.bondSliderHint}>Maximum CHF 7,258 for employed individuals (2026)</span>
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Current Age</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>Age {form.currentAge}</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={25} max={55} step={1}
              value={form.currentAge} onChange={e => updateField('currentAge', Number(e.target.value))} />
            <span className={s.bondSliderHint}>
              Retirement age 65 (Swiss standard) — {result.yearsToRetirement} years to retirement
            </span>
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Swiss Marginal Tax Rate (cantonal + federal)</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.marginalTaxRate}%</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={15} max={45} step={1}
              value={form.marginalTaxRate} onChange={e => updateField('marginalTaxRate', Number(e.target.value))} />
            <span className={s.bondSliderHint}>Varies by canton and income. Zurich ~35%, Geneva ~45%, Zug ~22%</span>
          </div>
        </div>

        <div className={s.bondControlsCol}>
          <span className={s.eyebrow}>AXA SmartFlex Parameters</span>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Guaranteed / Market Split</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.guaranteedSplit}% / {marketSplit}%</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={0} max={100} step={10}
              value={form.guaranteedSplit} onChange={e => updateField('guaranteedSplit', Number(e.target.value))} />
            <span className={s.bondSliderHint}>
              {fmtCHF(guaranteedAmount)} guaranteed | {fmtCHF(marketAmount)} market-linked
            </span>
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Guaranteed Portion Rate</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.guaranteedRate.toFixed(1)}% p.a.</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={0.5} max={3} step={0.1}
              value={form.guaranteedRate} onChange={e => updateField('guaranteedRate', Number(e.target.value))} />
            <span className={s.bondSliderHint}>AXA SmartFlex current guaranteed rate ~1.5% p.a.</span>
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Market Portion Assumed Return</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.marketLinkedRate.toFixed(1)}% p.a.</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={2} max={10} step={0.5}
              value={form.marketLinkedRate} onChange={e => updateField('marketLinkedRate', Number(e.target.value))} />
            <span className={s.bondSliderHint}>Illustration only — not a projection</span>
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Lump Sum Withdrawal Tax Rate</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.withdrawalTaxRate.toFixed(1)}%</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={5} max={15} step={0.5}
              value={form.withdrawalTaxRate} onChange={e => updateField('withdrawalTaxRate', Number(e.target.value))} />
            <span className={s.bondSliderHint}>Significantly lower than income tax rate — typically 8-12%</span>
          </div>
        </div>
      </div>

      {/* Section 3 — Tax Saving Highlight */}
      <div className={s.pillar3TaxHighlight}>
        <div className={s.bondChartTitle}>The True Cost of Contributing</div>
        <div className={s.pillar3TaxStats}>
          <div>
            <div className={s.bondSliderLabel}>Annual contribution</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>
              {fmtCHF(form.annualContribution)}
            </div>
          </div>
          <div>
            <div className={s.bondSliderLabel}>True annual cost</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, color: 'var(--accent)' }}>
              {fmtCHF(result.trueAnnualCost)}
            </div>
            <div className={s.bondSliderHint}>after tax relief</div>
          </div>
          <div>
            <div className={s.bondSliderLabel}>Annual tax saving</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, color: 'var(--online)' }}>
              {fmtCHF(result.annualTaxSaving)}
            </div>
            <div className={s.bondSliderHint}>saved immediately</div>
          </div>
        </div>
        <div className={s.bondInfoLine} style={{ marginTop: 12 }}>
          Over {result.yearsToRetirement} years, you save {fmtCHF(result.totalTaxSavedOnContributions)} in
          contributions tax alone — before any investment growth. The client thinks they&apos;re
          spending {fmtCHF(form.annualContribution)}. They&apos;re actually spending{' '}
          {fmtCHF(result.trueAnnualCost)} because the tax saving is immediate.
        </div>
      </div>

      {/* Section 4 — Growth Chart */}
      <div className={s.bondChartArea}>
        <div className={s.bondChartTitle}>Pillar 3a Growth — Total, Guaranteed &amp; No-Contribution Alternative</div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--hairline)" strokeDasharray="3 3" />
            <XAxis dataKey="age" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} tickFormatter={v => `${v}`} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} tickFormatter={formatAxisCHF} width={60} />
            <Tooltip content={<Pillar3Tooltip />} />
            <Area type="monotone" dataKey="noContributionAlternative" stackId="gap" stroke="none" fill="transparent" isAnimationActive={false} />
            <Area type="monotone" dataKey="gap" stackId="gap" stroke="none" fill="var(--accent)" fillOpacity={0.1} isAnimationActive={false} />
            <Line type="monotone" dataKey="totalValue" stroke="var(--accent)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="guaranteedValue" stroke="var(--online)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="noContributionAlternative" stroke="var(--alert)" strokeWidth={1.5} strokeDasharray="1 3" dot={false} isAnimationActive={false} />
            <ReferenceLine
              x={RETIREMENT_AGE}
              stroke="var(--border)"
              strokeDasharray="3 3"
              label={{ value: `Retirement — ${fmtCHF(result.finalTotalValue)}`, position: 'top', fill: 'var(--text-dim)', fontSize: 10 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div className={s.bondChartCaption}>
          Advantage over no contribution: {fmtCHF(result.vsNoContribution)} at retirement
        </div>
        <div className={s.bondLegendRow}>
          <div className={s.bondLegendItem}>
            <span className={s.bondLegendLine} style={{ background: 'var(--accent)' }} />
            Total Pillar 3 value
          </div>
          <div className={s.bondLegendItem}>
            <span className={s.bondLegendLine} style={{ borderTop: '2px dashed var(--online)' }} />
            Guaranteed portion only
          </div>
          <div className={s.bondLegendItem}>
            <span className={s.bondLegendLine} style={{ borderTop: '1.5px dotted var(--alert)' }} />
            No contribution alternative
          </div>
        </div>
      </div>

      {/* Section 5 — Info panels */}
      <div className={s.bondInfoPanels}>
        <div className={s.pillar3InfoPanel}>
          <div className={s.bondInfoPanelHead}>
            <span className={s.bondInfoPanelIcon}>💰</span>
            <span className={s.bondInfoPanelTitle}>Three Tax Advantages</span>
          </div>
          <div className={s.profileBulletList}>
            <div className={s.profileBullet}>
              <span className={s.profileDotOnline} />
              <span>Tax relief going IN — {fmtCHF(result.annualTaxSaving)} saved per year on contributions</span>
            </div>
            <div className={s.profileBullet}>
              <span className={s.profileDotAccent} />
              <span>Tax-free growth INSIDE — no annual tax on gains or interest</span>
            </div>
            <div className={s.profileBullet}>
              <span className={s.profileDotIdle} />
              <span>Reduced tax coming OUT — {form.withdrawalTaxRate}% vs {form.marginalTaxRate}% income tax</span>
            </div>
          </div>
          <div className={s.bondInfoLine} style={{ marginTop: 4 }}>
            Total tax advantage over {result.yearsToRetirement} years:{' '}
            {fmtCHF(result.totalTaxSavedOnContributions + growthTaxSaved)}
          </div>
        </div>

        <div className={s.pillar3InfoPanel}>
          <div className={s.bondInfoPanelHead}>
            <span className={s.bondInfoPanelIcon}>⚖️</span>
            <span className={s.bondInfoPanelTitle}>SmartFlex Split</span>
          </div>
          <div className={s.pillar3SplitBar}>
            <div style={{ width: `${guaranteedBarPct}%`, background: 'var(--online)' }} />
            <div style={{ width: `${100 - guaranteedBarPct}%`, background: 'var(--accent)' }} />
          </div>
          <div className={s.bondInfoLine} style={{ color: 'var(--online)' }}>
            {fmtCHF(result.finalGuaranteedValue)} — defined return, capital protected
          </div>
          <div className={s.bondInfoLine} style={{ color: 'var(--accent)' }}>
            {fmtCHF(result.finalMarketValue)} — fund-linked, higher potential
          </div>
          <div className={s.bondInfoLine} style={{ marginTop: 4 }}>
            AXA SmartFlex lets you adjust this split — more guaranteed for cautious clients, more
            market-linked for growth-oriented clients.
          </div>
        </div>

        <div className={s.pillar3InfoPanel}>
          <div className={s.bondInfoPanelHead}>
            <span className={s.bondInfoPanelIcon}>📊</span>
            <span className={s.bondInfoPanelTitle}>Advantage Over Doing Nothing</span>
          </div>
          <div className={s.bondInfoBigFigure} style={{ fontSize: 28 }}>
            {fmtCHF(result.vsNoContribution)}
          </div>
          <div className={s.bondInfoLine}>extra wealth at retirement vs saving the same net amount in cash</div>
          <div className={s.bondInfoLine}>Effective return on true net cost: {fmtPct(result.effectiveReturn, 2)} p.a.</div>
          <div className={s.bondInfoLine} style={{ marginTop: 4 }}>
            Even after withdrawal tax, Pillar 3a significantly outperforms leaving the same money in
            a savings account — because the tax saving on contributions gives you an immediate head
            start.
          </div>
        </div>
      </div>

      {/* Section 6 — Returns Summary */}
      <div className={s.pillar3SummaryCard}>
        <div className={s.bondSummaryHead}>AXA SmartFlex Pillar 3a — Retirement Projection</div>

        <span className={s.eyebrow}>Personal details</span>
        <div className={s.bondSummaryRow}><span>Current age</span><span>{form.currentAge}</span></div>
        <div className={s.bondSummaryRow}><span>Retirement age</span><span>{RETIREMENT_AGE}</span></div>
        <div className={s.bondSummaryRow}><span>Years contributing</span><span>{result.yearsToRetirement}</span></div>
        <div className={s.bondSummaryRow}><span>Annual contribution</span><span>{fmtCHF(form.annualContribution)}</span></div>
        <div className={s.bondSummaryRow}><span>Marginal tax rate</span><span>{form.marginalTaxRate}%</span></div>
        <hr className={s.bondSummaryDivider} />

        <span className={s.eyebrow}>Contributions &amp; tax</span>
        <div className={s.bondSummaryRow}><span>Total contributions</span><span>{fmtCHF(result.totalContributions)}</span></div>
        <div className={s.bondSummaryRow}>
          <span>Tax saved on contributions</span>
          <span>{fmtCHF(result.totalTaxSavedOnContributions)} ({fmtPct(taxSavedPctOfTotal)})</span>
        </div>
        <div className={s.bondSummaryRow}><span>True net cost</span><span>{fmtCHF(result.netCostOfContributions)}</span></div>
        <hr className={s.bondSummaryDivider} />

        <span className={s.eyebrow}>Growth</span>
        <div className={s.bondSummaryRow}>
          <span>Guaranteed portion</span><span>{fmtCHF(result.finalGuaranteedValue)} ({form.guaranteedRate.toFixed(1)}% p.a.)</span>
        </div>
        <div className={s.bondSummaryRow}>
          <span>Market-linked portion</span><span>{fmtCHF(result.finalMarketValue)} ({form.marketLinkedRate.toFixed(1)}% p.a. assumed)</span>
        </div>
        <div className={s.bondSummaryRow}><span>Total at retirement</span><span>{fmtCHF(result.finalTotalValue)}</span></div>
        <hr className={s.bondSummaryDivider} />

        <span className={s.eyebrow}>Withdrawal</span>
        <div className={s.bondSummaryRow}>
          <span>Tax on lump sum</span><span>{fmtCHF(result.taxOnWithdrawal)} ({form.withdrawalTaxRate.toFixed(1)}% reduced rate)</span>
        </div>
        <div className={s.bondSummaryRow}><span>Net value after tax</span><span>{fmtCHF(result.netValueAfterWithdrawalTax)}</span></div>
        <hr className={s.bondSummaryDivider} />

        <div className={s.bondSummaryTotal}>
          <span>Effective return on true cost</span>
          <span>{fmtPct(result.effectiveReturn, 2)} p.a.</span>
        </div>
        <div className={s.bondSummaryRow}>
          <span>Advantage vs cash savings</span><span>{fmtCHF(result.vsNoContribution)}</span>
        </div>

        <div className={s.bondDisclaimer}>
          ⚠ Illustrations only. Guaranteed rates subject to AXA terms. Market returns not
          guaranteed. Tax rates vary by canton. Maximum contribution CHF 7,258 for 2026 (employed
          individuals).
        </div>
      </div>

      {/* Section 7 — Product Profile */}
      <ProductProfile {...PROFILE_DATA} />
    </div>
  )
}
