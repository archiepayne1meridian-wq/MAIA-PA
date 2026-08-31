'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import s from '../../dashboard.module.css'
import { calculateArdan, formatMoney, type ArdanParams, type ArdanYearlySnapshot } from '@/lib/ardan-calc'
import ProductProfile from '@/components/atlas/ProductProfile'

// ── Types & defaults ─────────────────────────────────────────────────────────

type Currency = 'GBP' | 'USD' | 'EUR' | 'CHF'
const CURRENCIES: Currency[] = ['GBP', 'USD', 'EUR', 'CHF']
const CURRENCY_CLASS: Record<Currency, string> = {
  GBP: s.ardanChipGBP, USD: s.ardanChipUSD, EUR: s.ardanChipEUR, CHF: s.ardanChipCHF,
}

interface ArdanFormState {
  startingAmount: number
  annualGrowthRate: number
  timeHorizonYears: number
  ardanPlatformFee: number
  ardanAdviserFee: number
  ardanFundFee: number
  bundledTotalFee: number
  savingsEnabled: boolean
  monthlyContribution: number
  currency: Currency
}

const DEFAULT_ARDAN_FORM: ArdanFormState = {
  startingAmount: 100000,
  annualGrowthRate: 6,
  timeHorizonYears: 15,
  ardanPlatformFee: 0.35,
  ardanAdviserFee: 1.0,
  ardanFundFee: 0.75,
  bundledTotalFee: 2.75,
  savingsEnabled: false,
  monthlyContribution: 500,
  currency: 'GBP',
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function fmtPct(n: number, dp = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%`
}
function formatAxisGBP(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}m`
  if (Math.abs(v) >= 1000) return `£${Math.round(v / 1000)}k`
  return `£${v}`
}
function fmtGBP(n: number): string {
  return formatMoney(n, 'GBP')
}

type ChartRow = ArdanYearlySnapshot & { gap: number }

// ── Chart dot: plain circle, or an upward marker on a contribution year ─────

interface DotRenderProps {
  cx?: number
  cy?: number
  index?: number
}

function renderArdanDot(props: DotRenderProps, data: ChartRow[], savingsEnabled: boolean) {
  const { cx, cy, index } = props
  if (cx == null || cy == null || index == null || !data[index]) return <g key={`ad-${index}`} />
  if (savingsEnabled) {
    return (
      <polygon key={`ad-${index}`} points={`${cx - 4},${cy + 5} ${cx + 4},${cy + 5} ${cx},${cy - 4}`}
        fill="var(--online)" stroke="#0D1014" strokeWidth={1} />
    )
  }
  return <circle key={`ad-${index}`} cx={cx} cy={cy} r={2.5} fill="var(--accent)" />
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipPayloadItem { dataKey?: string; value?: number }

function ArdanTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: number }) {
  if (!active || !payload || payload.length === 0) return null
  const ardan = payload.find(p => p.dataKey === 'ardanValue')?.value ?? 0
  const bundled = payload.find(p => p.dataKey === 'bundledValue')?.value ?? 0
  return (
    <div style={{
      background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '9px 13px', fontSize: 11, fontFamily: 'var(--mono)',
    }}>
      <div style={{ color: 'var(--text-dim)', marginBottom: 5 }}>Year {label}</div>
      <div style={{ color: 'var(--accent)' }}>Ardan: {fmtGBP(ardan)}</div>
      <div style={{ color: 'var(--alert)' }}>Bundled: {fmtGBP(bundled)}</div>
      <div style={{ color: 'var(--online)', marginTop: 4 }}>Difference: {fmtGBP(ardan - bundled)}</div>
    </div>
  )
}

// ── Product profile data ─────────────────────────────────────────────────────

const PROFILE_DATA = {
  productName: 'Ardan Platform',
  whatItIs: 'Ardan is an open-architecture investment platform — the administrative system that holds and manages investments. It is not a tax wrapper itself (unlike a portfolio bond), but it provides full cost transparency, multi-currency capability, and access to institutional fund share classes. It is backed by RL360/IFGL Group and commonly used as the platform inside an offshore bond structure.',
  whatItHolds: [
    'Unit trusts and OEICs (thousands of funds)',
    'ETFs',
    'Model portfolios (discretionary managed)',
    'Cash in GBP, USD, EUR, CHF',
    'Individual equities (on certain account types)',
  ],
  whoItsFor: [
    'Client who wants full transparency on every charge they pay',
    'Client with investments in multiple currencies who wants one consolidated view',
    'Client setting up a regular savings plan in any major currency',
    'Client consolidating from multiple legacy products or old employer schemes',
    'Client inside a portfolio bond who needs an underlying platform',
    'NOT a tax wrapper — client still needs a bond or pension structure for tax efficiency',
  ],
  keyBenefits: [
    'Full cost transparency — adviser, platform, and fund fees disclosed line by line',
    'No exit penalties, no lock-in — full liquidity at any time',
    'Multi-currency — GBP, USD, EUR, CHF with no forced conversion',
    'Institutional fund share classes — typically 0.5-1.0% cheaper than retail equivalents',
    'Regular savings plan — monthly contributions from $200 in multiple currencies',
    'Open architecture — access to thousands of funds, not restricted to one provider',
  ],
  gaps: [
    'Client in old expat savings plan (Zurich Vista, Generali Vision) paying 2.5-3% p.a. total charges',
    'Client who has no idea what their existing arrangement costs — Ardan forces transparency',
    'Client with investments in multiple countries who has no consolidated view',
    'Client earning in CHF but wanting to invest in GBP — multi-currency solves the FX problem',
    'Client who has been told they cannot leave their existing product (surrender penalties) — worth quantifying the real cost',
  ],
  comparisons: [
    { product: 'Old expat savings plan (Zurich Vista etc.)', difference: 'Legacy plans have front-loaded charges, surrender penalties, and limited fund choice. Ardan has none of these.', useWhen: 'Use Ardan when client wants to escape legacy plan charges — first quantify the surrender penalty vs future savings' },
    { product: 'Portfolio bond', difference: 'Ardan is the platform, the bond is the wrapper. They are complementary not competing — Ardan often sits inside a bond.', useWhen: 'Use both together — bond for tax deferral, Ardan as the underlying transparent platform' },
    { product: 'Direct fund platform (Hargreaves Lansdown etc.)', difference: 'UK platforms are unavailable or restricted for non-residents. Ardan is designed for internationally mobile clients.', useWhen: 'Use Ardan for any non-UK resident client. Use UK platforms only for UK residents.' },
    { product: 'Swiss bank investment account', difference: 'Swiss bank accounts typically have higher charges and limited fund access. Ardan has lower charges and open architecture.', useWhen: 'Use Ardan when client wants lower costs and broader fund access than their Swiss bank offers' },
  ],
  whenToUseVs: [
    { useThis: 'Client wants transparent low-cost investment platform with no lock-in', useAlternative: 'Client needs tax deferral — Ardan alone provides no tax wrapper', alternative: 'Portfolio bond (with Ardan inside)' },
    { useThis: 'Client has old legacy plan with high charges — show the cost drag', useAlternative: 'Client has surrender penalties that outweigh the savings — run the numbers first', alternative: 'Stay in existing plan until penalty falls' },
  ],
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ArdanVisualizer() {
  const router = useRouter()
  const [form, setForm] = useState<ArdanFormState>(DEFAULT_ARDAN_FORM)

  function updateField<K extends keyof ArdanFormState>(key: K, value: ArdanFormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const ardanParams: ArdanParams = {
    startingAmount: form.startingAmount,
    monthlyContribution: form.savingsEnabled ? form.monthlyContribution : 0,
    annualGrowthRate: form.annualGrowthRate,
    timeHorizonYears: form.timeHorizonYears,
    ardanPlatformFee: form.ardanPlatformFee,
    ardanAdviserFee: form.ardanAdviserFee,
    ardanFundFee: form.ardanFundFee,
    bundledTotalFee: form.bundledTotalFee,
  }

  const result = useMemo(() => calculateArdan(ardanParams), [
    form.startingAmount, form.savingsEnabled, form.monthlyContribution, form.annualGrowthRate,
    form.timeHorizonYears, form.ardanPlatformFee, form.ardanAdviserFee, form.ardanFundFee, form.bundledTotalFee,
  ])

  const chartData: ChartRow[] = result.yearlySnapshots.map(snap => ({
    ...snap,
    gap: Math.max(0, snap.ardanValue - snap.bundledValue),
  }))

  const bundledBarPct = result.finalArdanValue + result.finalBundledValue > 0
    ? (result.finalArdanValue / (result.finalArdanValue + result.finalBundledValue)) * 100 : 50

  return (
    <div className={s.vizPage}>
      <button className={s.agentPageBack} onClick={() => router.push('/dashboard/visualizer')}>← ATLAS</button>

      <div className={s.vizPageHead}>
        <div className={s.drawerBadge}>AR</div>
        <div>
          <div className={s.drawerName}>ATLAS — Ardan Platform</div>
          <div className={s.drawerRole}>Cost transparency, multi-currency, regular savings</div>
        </div>
      </div>

      {/* Section 1 — Product Summary */}
      <div className={s.vizIntroCard}>
        <div className={s.vizIntroTitle}>Ardan Platform</div>
        <div className={s.bondPillsRow}>
          <span className={[s.bondPill, s.bondPillAccent].join(' ')}>Full Cost Transparency</span>
          <span className={[s.bondPill, s.bondPillGreen].join(' ')}>Open Architecture</span>
          <span className={[s.bondPill, s.bondPillAmber].join(' ')}>Multi-Currency</span>
        </div>
        <p className={s.vizIntroText}>
          Ardan is an open-architecture investment platform that holds and administers a client&apos;s
          investments with full cost transparency. Unlike a bundled legacy plan, every charge —
          platform, adviser, and fund — is disclosed separately, so nothing is hidden inside a single
          &quot;total expense&quot; number. Multi-currency accounts mean a client&apos;s money stays in
          the currency they choose, and a regular savings plan can be set up from as little as
          $200 a month.
        </p>
      </div>

      {/* Section 2 — Controls */}
      <div className={s.bondControls}>
        <div className={s.bondControlsCol}>
          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Starting Investment</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{fmtGBP(form.startingAmount)}</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={10000} max={500000} step={10000}
              value={form.startingAmount} onChange={e => updateField('startingAmount', Number(e.target.value))} />
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Assumed Annual Growth Rate</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.annualGrowthRate}% p.a.</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={1} max={15} step={0.5}
              value={form.annualGrowthRate} onChange={e => updateField('annualGrowthRate', Number(e.target.value))} />
            <span className={s.bondSliderHint}>Illustration only — not a projection of actual returns</span>
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Investment Horizon</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.timeHorizonYears} years</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={5} max={30} step={1}
              value={form.timeHorizonYears} onChange={e => updateField('timeHorizonYears', Number(e.target.value))} />
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Bundled Alternative — Total Fee (Zurich Vista-style)</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.bundledTotalFee}% p.a.</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={1} max={4} step={0.1}
              value={form.bundledTotalFee} onChange={e => updateField('bundledTotalFee', Number(e.target.value))} />
          </div>
        </div>

        <div className={s.bondControlsCol}>
          <div className={s.bondFeatureBlock}>
            <div className={s.bondFeatureLabel} style={{ marginBottom: 10 }}>Ardan Fee Breakdown</div>
            <div className={s.bondSliderGroup}>
              <span className={s.bondSliderLabel}>Platform Fee</span>
              <div className={s.bondSliderValueRow}><span className={s.bondSliderValue}>{form.ardanPlatformFee}%</span></div>
              <input className={s.bondSliderInput} type="range" min={0.1} max={1} step={0.05}
                value={form.ardanPlatformFee} onChange={e => updateField('ardanPlatformFee', Number(e.target.value))} />
            </div>
            <div className={s.bondSliderGroup} style={{ marginTop: 10 }}>
              <span className={s.bondSliderLabel}>Adviser Fee</span>
              <div className={s.bondSliderValueRow}><span className={s.bondSliderValue}>{form.ardanAdviserFee}%</span></div>
              <input className={s.bondSliderInput} type="range" min={0} max={2} step={0.1}
                value={form.ardanAdviserFee} onChange={e => updateField('ardanAdviserFee', Number(e.target.value))} />
            </div>
            <div className={s.bondSliderGroup} style={{ marginTop: 10 }}>
              <span className={s.bondSliderLabel}>Fund Fee</span>
              <div className={s.bondSliderValueRow}><span className={s.bondSliderValue}>{form.ardanFundFee}%</span></div>
              <input className={s.bondSliderInput} type="range" min={0.2} max={2} step={0.05}
                value={form.ardanFundFee} onChange={e => updateField('ardanFundFee', Number(e.target.value))} />
            </div>
            <div className={s.bondRunningTotal} style={{ marginTop: 10 }}>
              Ardan total: {result.ardanTotalFeeRate}% p.a. · Saving vs bundled: {fmtPct(result.effectiveAnnualFeeSaving, 2)} p.a.
            </div>
          </div>

          <div className={s.bondFeatureBlock}>
            <div className={s.bondFeatureHead}>
              <span className={s.bondFeatureLabel}>Regular Savings Plan</span>
              <button
                className={[s.bondToggle, form.savingsEnabled ? s.bondToggleOn : ''].join(' ')}
                onClick={() => updateField('savingsEnabled', !form.savingsEnabled)}
                aria-label="Toggle regular savings plan"
              >
                <span className={s.bondToggleKnob} />
              </button>
            </div>
            {form.savingsEnabled && (
              <div className={s.bondFeatureBody}>
                <span className={s.bondSliderLabel}>Monthly Contribution Via Direct Debit</span>
                <div className={s.bondSliderValueRow}>
                  <span className={s.bondSliderValue}>{formatMoney(form.monthlyContribution, form.currency)} / month</span>
                </div>
                <input className={s.bondSliderInput} type="range" min={200} max={5000} step={100}
                  value={form.monthlyContribution} onChange={e => updateField('monthlyContribution', Number(e.target.value))} />
                <div className={s.ardanCurrencyChips}>
                  {CURRENCIES.map(c => (
                    <button key={c}
                      className={[s.ardanCurrencyChip, CURRENCY_CLASS[c], form.currency === c ? s.ardanCurrencyChipActive : ''].join(' ')}
                      onClick={() => updateField('currency', c)}>
                      {c}
                    </button>
                  ))}
                </div>
                <span className={s.bondSliderHint}>Ardan accepts regular contributions from $200/month in multiple currencies</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 3 — Main comparison chart */}
      <div className={s.bondChartArea}>
        <div className={s.bondChartTitle}>Ardan vs Bundled Alternative</div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--hairline)" strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} tickFormatter={v => `Y${v}`} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} tickFormatter={formatAxisGBP} width={50} />
            <Tooltip content={<ArdanTooltip />} />
            <Area type="monotone" dataKey="bundledValue" stackId="gap" stroke="none" fill="transparent" isAnimationActive={false} />
            <Area type="monotone" dataKey="gap" stackId="gap" stroke="none" fill="var(--accent)" fillOpacity={0.1} isAnimationActive={false} />
            <Line type="monotone" dataKey="ardanValue" stroke="var(--accent)" strokeWidth={2.5}
              dot={(p: DotRenderProps) => renderArdanDot(p, chartData, form.savingsEnabled)} isAnimationActive={false} />
            <Line type="monotone" dataKey="bundledValue" stroke="var(--alert)" strokeWidth={2} strokeDasharray="5 4"
              dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className={s.bondChartCaption}>
          Cost drag on the bundled alternative costs {fmtGBP(Math.max(0, result.costAdvantageAmount))} over {form.timeHorizonYears} years
        </div>
        <div className={s.bondLegendRow}>
          <div className={s.bondLegendItem}>
            <span className={s.bondLegendLine} style={{ background: 'var(--accent)' }} />
            Ardan Platform
          </div>
          <div className={s.bondLegendItem}>
            <span className={s.bondLegendLine} style={{ borderTop: '2px dashed var(--alert)' }} />
            Bundled Alternative
          </div>
          {form.savingsEnabled && (
            <div className={s.bondLegendItem}>
              <span style={{ color: 'var(--online)' }}>▲</span> Monthly contribution
            </div>
          )}
        </div>
      </div>

      {/* Section 4 — Info panels */}
      <div className={s.bondInfoPanels}>
        <div className={s.bondInfoPanel}>
          <div className={s.bondInfoPanelHead}>
            <span className={s.bondInfoPanelIcon}>💷</span>
            <span className={s.bondInfoPanelTitle}>Cost Breakdown</span>
          </div>
          <div className={s.ardanFeeRow}><span>Platform fee</span><span>{form.ardanPlatformFee}%</span></div>
          <div className={s.ardanFeeRow}><span>Adviser fee</span><span>{form.ardanAdviserFee}%</span></div>
          <div className={s.ardanFeeRow}><span>Fund fee</span><span>{form.ardanFundFee}%</span></div>
          <div className={s.ardanFeeRow} style={{ borderTop: '1px solid var(--hairline)', paddingTop: 6, fontWeight: 600 }}>
            <span>Ardan total</span><span>{result.ardanTotalFeeRate}%</span>
          </div>
          <div className={s.ardanFeeRow}><span>Bundled total</span><span>{form.bundledTotalFee}%</span></div>
          <div className={s.bondCompareBar}>
            <div className={s.bondCompareBarBond} style={{ width: `${bundledBarPct}%` }} />
            <div className={s.bondCompareBarGia} style={{ width: `${100 - bundledBarPct}%` }} />
          </div>
        </div>

        <div className={s.bondInfoPanel}>
          <div className={s.bondInfoPanelHead}>
            <span className={s.bondInfoPanelIcon}>💰</span>
            <span className={s.bondInfoPanelTitle}>Fees Saved</span>
          </div>
          <div className={s.bondInfoBigFigure}>{fmtGBP(result.totalFeesSavedVsBundled)}</div>
          <div className={s.bondInfoLine}>vs the bundled alternative&apos;s charges</div>
          <div className={s.bondInfoLine}>Cost advantage at maturity: {fmtGBP(result.costAdvantageAmount)} ({fmtPct(result.costAdvantagePct)})</div>
        </div>

        <div className={s.bondInfoPanel}>
          <div className={s.bondInfoPanelHead}>
            <span className={s.bondInfoPanelIcon}>🌍</span>
            <span className={s.bondInfoPanelTitle}>Multi-Currency</span>
          </div>
          <div className={s.bondInfoLine}>
            Ardan holds and transacts in GBP, USD, EUR, and CHF. No forced currency conversion — your
            client&apos;s assets stay in their chosen currency. Ideal for clients earning in one currency,
            living in another, and planning to retire in a third.
          </div>
          <div className={s.ardanCurrencyChips}>
            {CURRENCIES.map(c => (
              <span key={c} className={[s.ardanCurrencyChip, CURRENCY_CLASS[c]].join(' ')} style={{ cursor: 'default' }}>{c}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Section 5 — Returns Summary */}
      <div className={s.bondSummaryCard}>
        <div className={s.bondSummaryHead}>Ardan vs Bundled Alternative — {form.timeHorizonYears} Year Comparison</div>
        <div className={s.bondSummaryRow}><span>Starting amount</span><span>{fmtGBP(form.startingAmount)}</span></div>
        <div className={s.bondSummaryRow}><span>Assumed growth</span><span>{form.annualGrowthRate}% p.a.</span></div>
        <div className={s.bondSummaryRow}><span>Ardan fees</span><span>{result.ardanTotalFeeRate}% p.a.</span></div>
        <div className={s.bondSummaryRow}><span>Bundled fees</span><span>{form.bundledTotalFee}% p.a.</span></div>
        {form.savingsEnabled && (
          <div className={s.bondSummaryRow}>
            <span>Regular savings</span>
            <span>{formatMoney(form.monthlyContribution, form.currency)}/month</span>
          </div>
        )}
        <hr className={s.bondSummaryDivider} />
        <div className={s.bondSummaryColHead}><span /><span>Ardan</span><span>Bundled</span></div>
        <div className={s.bondSummaryColRow}>
          <span>Final value</span><span>{fmtGBP(result.finalArdanValue)}</span><span>{fmtGBP(result.finalBundledValue)}</span>
        </div>
        <div className={s.bondSummaryColRow}>
          <span>Total fees paid</span>
          <span>{fmtGBP(result.yearlySnapshots[result.yearlySnapshots.length - 1]?.ardanFeesPaidCumulative ?? 0)}</span>
          <span>{fmtGBP(result.yearlySnapshots[result.yearlySnapshots.length - 1]?.bundledFeesPaidCumulative ?? 0)}</span>
        </div>
        <hr className={s.bondSummaryDivider} />
        <div className={s.bondSummaryTotal}>
          <span>Advantage of Ardan</span>
          <span>{result.costAdvantageAmount >= 0 ? '+' : ''}{fmtGBP(result.costAdvantageAmount)} ({fmtPct(result.costAdvantagePct)})</span>
        </div>
        <div className={s.bondSummaryRow}><span>Fees saved vs bundled</span><span>{fmtGBP(result.totalFeesSavedVsBundled)}</span></div>

        <div className={s.bondDisclaimer}>
          ⚠ All figures are illustrations only. Returns not guaranteed. Fee structures shown are indicative — check current terms.
        </div>
      </div>

      <ProductProfile {...PROFILE_DATA} />
    </div>
  )
}
