'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import s from '../../dashboard.module.css'
import { calculateBond, formatGBP, type BondParams, type YearlySnapshot } from '@/lib/portfolio-bond-calc'
import ProductProfile from '@/components/atlas/ProductProfile'

// ── Types & defaults ─────────────────────────────────────────────────────────

interface BondFormState {
  startingAmount: number
  annualGrowthRate: number
  taxRate: number
  timeHorizonYears: number
  withdrawalEnabled: boolean
  annualWithdrawal: number
  tarEnabled: boolean
  nonUkResidentYears: number
}

const DEFAULT_BOND_FORM: BondFormState = {
  startingAmount: 100000,
  annualGrowthRate: 6,
  taxRate: 40,
  timeHorizonYears: 20,
  withdrawalEnabled: false,
  annualWithdrawal: 0,
  tarEnabled: false,
  nonUkResidentYears: 0,
}

const TAX_RATE_OPTIONS = [
  { value: 20, label: '20% Basic Rate' },
  { value: 40, label: '40% Higher Rate' },
  { value: 45, label: '45% Additional Rate' },
]

const PROFILE_DATA = {
  productName: 'Portfolio Bond',
  whatItIs: 'A portfolio bond is an offshore life-insurance wrapper that holds investments inside a tax-efficient structure. The client owns a contract (not the underlying assets directly), which is what creates the tax deferral. It is designed for internationally mobile clients who move between tax jurisdictions — the wrapper travels with them and tax treatment adjusts accordingly.',
  whatItHolds: [
    'Unit trusts and OEICs',
    'ETFs and index funds',
    'Structured notes',
    'Cash (multi-currency)',
    'Model portfolios (discretionary managed)',
    'Alternative investments (subject to provider rules)',
  ],
  whoItsFor: [
    'UK expat planning to return to the UK at some point (time-apportionment relief reduces the tax bill)',
    'Client with a large lump sum who wants to defer tax while invested',
    'Client who rebalances frequently (no CGT on switching inside the bond)',
    'Client who wants to draw income via the 5% annual allowance with no immediate tax',
    'NOT suitable for UK residents holding a Personal Portfolio Bond (PPB rules — punitive taxation)',
  ],
  keyBenefits: [
    'Gross roll-up — no annual income or capital gains tax while inside the bond',
    '5% annual withdrawal allowance — draw up to 5% per year for 20 years, no immediate UK tax',
    'Time-apportionment relief — years spent non-UK resident reduce the eventual taxable gain',
    'Top-slicing relief — softens a one-off gain by spreading it over the bond’s life',
    'Multi-currency — can hold and switch between currencies without FX tax events',
    'Portability — designed to follow the client across jurisdictions',
  ],
  gaps: [
    'Client investing in a GIA and paying CGT every time they rebalance — bond removes this drag',
    'Client with a maturing pension or large lump sum who has no tax-efficient wrapper for it',
    'Client who left the UK and has ISA frozen — bond is the offshore equivalent',
    'Client rebalancing frequently in a taxable account — every switch inside a bond is tax-free',
    'Client planning to return to the UK — bond held abroad reduces their eventual UK tax bill via TAR',
  ],
  comparisons: [
    { product: 'GIA (trading account)', difference: 'GIA is fully taxable on gains and income each year. Bond defers all tax until encashment.', useWhen: 'Use bond when client has a long horizon and wants to defer tax — GIA when no tax reason exists' },
    { product: 'ISA', difference: 'ISA is completely tax-free but unavailable to non-UK residents. Bond is available globally and defers (not removes) tax.', useWhen: 'Use ISA if client is UK resident. Use bond if client lives abroad.' },
    { product: 'Ardan Platform', difference: 'Ardan is a platform (the shelf). Portfolio bond is the wrapper. Ardan often sits inside a bond.', useWhen: 'Use bond wrapper around Ardan for tax deferral — Ardan alone gives no tax benefit' },
    { product: 'Structured note', difference: 'Note is an investment that can sit inside the bond. Bond provides the wrapper, note provides the return structure.', useWhen: 'Combine — note inside bond gives defined income with tax deferral' },
  ],
  whenToUseVs: [
    { useThis: 'Client is non-UK resident with a lump sum to invest long-term', useAlternative: 'Client is UK resident — PPB rules make bond punitive', alternative: 'ISA or pension' },
    { useThis: 'Client plans to return to the UK — TAR will reduce their tax bill', useAlternative: 'Client has no intention of returning to UK ever — less benefit from TAR', alternative: 'Direct investment platform' },
  ],
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

type ChartRow = YearlySnapshot & { gap: number }

// ── Chart dot: plain circle, or a downward triangle on a withdrawal year ────

interface DotRenderProps {
  cx?: number
  cy?: number
  index?: number
}

function renderBondDot(props: DotRenderProps, data: ChartRow[]) {
  const { cx, cy, index } = props
  // Recharts can briefly call the dot renderer with an index from the
  // previous render's (longer) data array right as the time horizon shrinks
  // — guard against that rather than trust the index is always in bounds.
  if (cx == null || cy == null || index == null || !data[index]) return <g key={`bd-${index}`} />
  const snap = data[index]
  const prevWithdrawals = index === 0 ? 0 : (data[index - 1]?.bondWithdrawals ?? 0)
  const withdrew = snap.bondWithdrawals > prevWithdrawals
  if (withdrew) {
    return (
      <polygon key={`bd-${index}`} points={`${cx - 5},${cy - 5} ${cx + 5},${cy - 5} ${cx},${cy + 5}`}
        fill="var(--idle)" stroke="#0D1014" strokeWidth={1} />
    )
  }
  return <circle key={`bd-${index}`} cx={cx} cy={cy} r={2.5} fill="var(--accent)" />
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipPayloadItem { dataKey?: string; value?: number }

function BondTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: number }) {
  if (!active || !payload || payload.length === 0) return null
  const bond = payload.find(p => p.dataKey === 'bondValue')?.value ?? 0
  const gia = payload.find(p => p.dataKey === 'giaValue')?.value ?? 0
  return (
    <div style={{
      background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '9px 13px', fontSize: 11, fontFamily: 'var(--mono)',
    }}>
      <div style={{ color: 'var(--text-dim)', marginBottom: 5 }}>Year {label}</div>
      <div style={{ color: 'var(--accent)' }}>Bond: {formatGBP(bond)}</div>
      <div style={{ color: 'var(--alert)' }}>GIA: {formatGBP(gia)}</div>
      <div style={{ color: 'var(--online)', marginTop: 4 }}>Difference: {formatGBP(bond - gia)}</div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PortfolioBondVisualizer() {
  const router = useRouter()
  const [form, setForm] = useState<BondFormState>(DEFAULT_BOND_FORM)

  function updateField<K extends keyof BondFormState>(key: K, value: BondFormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const maxWithdrawal = form.startingAmount * 0.05

  // Keep the dependent sliders in range when their bounds move.
  useEffect(() => {
    setForm(f => (f.annualWithdrawal > f.startingAmount * 0.05
      ? { ...f, annualWithdrawal: Math.round(f.startingAmount * 0.05) }
      : f))
  }, [form.startingAmount])

  useEffect(() => {
    setForm(f => (f.nonUkResidentYears > f.timeHorizonYears
      ? { ...f, nonUkResidentYears: f.timeHorizonYears }
      : f))
  }, [form.timeHorizonYears])

  const bondParams: BondParams = {
    startingAmount: form.startingAmount,
    annualGrowthRate: form.annualGrowthRate,
    taxRate: form.taxRate,
    timeHorizonYears: form.timeHorizonYears,
    annualWithdrawal: form.withdrawalEnabled ? form.annualWithdrawal : 0,
    nonUkResidentYears: form.tarEnabled ? form.nonUkResidentYears : 0,
  }

  const result = useMemo(() => calculateBond(bondParams), [
    form.startingAmount, form.annualGrowthRate, form.taxRate, form.timeHorizonYears,
    form.withdrawalEnabled, form.annualWithdrawal, form.tarEnabled, form.nonUkResidentYears,
  ])

  const chartData: ChartRow[] = result.yearlySnapshots.map(snap => ({
    ...snap,
    gap: Math.max(0, snap.bondValue - snap.giaValue),
  }))

  const bondEffectiveTotal = result.finalBondValue + result.totalWithdrawalsTaken
  const bondFinalPct = result.finalGiaValue > 0
    ? ((result.finalBondValue - result.finalGiaValue) / result.finalGiaValue) * 100 : 0
  const bondBarPct = result.finalBondValue + result.finalGiaValue > 0
    ? (result.finalBondValue / (result.finalBondValue + result.finalGiaValue)) * 100 : 50
  const keepPct = bondEffectiveTotal + result.totalTaxDeferred > 0
    ? (bondEffectiveTotal / (bondEffectiveTotal + result.totalTaxDeferred)) * 100 : 50
  const advantagePct = result.finalGiaValue > 0
    ? ((bondEffectiveTotal - result.finalGiaValue) / result.finalGiaValue) * 100 : 0
  const gainBeforeTAR = Math.max(0, result.finalBondValue - form.startingAmount)
  const taxSavingFromTAR = Math.round((gainBeforeTAR - result.taxableGainAtMaturity) * (form.taxRate / 100))
  const lastSnapshot = result.yearlySnapshots[result.yearlySnapshots.length - 1]
  const allowanceUsedPct = lastSnapshot?.fivePercentAllowanceUsed ?? 0
  const taxDragAtMaturity = Math.max(0, result.finalBondValue - result.finalGiaValue)

  return (
    <div className={s.vizPage}>
      <button className={s.agentPageBack} onClick={() => router.push('/dashboard/visualizer')}>← ATLAS</button>

      <div className={s.vizPageHead}>
        <div className={s.drawerBadge}>PB</div>
        <div>
          <div className={s.drawerName}>ATLAS — Portfolio Bond</div>
          <div className={s.drawerRole}>Tax deferral, 5% withdrawal allowance, time-apportionment relief</div>
        </div>
      </div>

      {/* Section 1 — Product Summary */}
      <div className={s.vizIntroCard}>
        <div className={s.vizIntroTitle}>Portfolio Bond</div>
        <div className={s.bondPillsRow}>
          <span className={[s.bondPill, s.bondPillAccent].join(' ')}>Gross Roll-Up</span>
          <span className={[s.bondPill, s.bondPillGreen].join(' ')}>Tax Deferral</span>
          <span className={[s.bondPill, s.bondPillAmber].join(' ')}>5% Annual Withdrawal</span>
        </div>
        <p className={s.vizIntroText}>
          A portfolio bond is an offshore life-insurance wrapper that lets investments grow without
          annual income or capital gains tax. Tax is deferred until a chargeable event — giving the
          full return the chance to compound uninterrupted. Up to 5% of the original premium can be
          withdrawn each year for 20 years with no immediate UK tax charge. For clients who spend
          time living abroad, time-apportionment relief can significantly reduce the eventual tax
          bill on return to the UK.
        </p>
      </div>

      {/* Section 2 — Controls */}
      <div className={s.bondControls}>
        <div className={s.bondControlsCol}>
          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Starting Investment</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{formatGBP(form.startingAmount)}</span>
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
            <span className={s.bondSliderLabel}>UK Income Tax Rate</span>
            <div className={s.bondPillToggle}>
              {TAX_RATE_OPTIONS.map(opt => (
                <button key={opt.value}
                  className={[s.bondPillToggleBtn, form.taxRate === opt.value ? s.bondPillToggleBtnActive : ''].join(' ')}
                  onClick={() => updateField('taxRate', opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Investment Horizon</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.timeHorizonYears} years</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={5} max={30} step={1}
              value={form.timeHorizonYears} onChange={e => updateField('timeHorizonYears', Number(e.target.value))} />
          </div>
        </div>

        <div className={s.bondControlsCol}>
          <div className={s.bondFeatureBlock}>
            <div className={s.bondFeatureHead}>
              <span className={s.bondFeatureLabel}>5% Annual Withdrawal</span>
              <button
                className={[s.bondToggle, form.withdrawalEnabled ? s.bondToggleOn : ''].join(' ')}
                onClick={() => updateField('withdrawalEnabled', !form.withdrawalEnabled)}
                aria-label="Toggle 5% annual withdrawal"
              >
                <span className={s.bondToggleKnob} />
              </button>
            </div>
            {form.withdrawalEnabled && (
              <div className={s.bondFeatureBody}>
                <span className={s.bondSliderLabel}>Annual Tax-Deferred Withdrawal</span>
                <div className={s.bondSliderValueRow}>
                  <span className={s.bondSliderValue}>{formatGBP(form.annualWithdrawal)} per year</span>
                </div>
                <input className={s.bondSliderInput} type="range" min={0} max={maxWithdrawal} step={1000}
                  value={form.annualWithdrawal} onChange={e => updateField('annualWithdrawal', Number(e.target.value))} />
                <span className={s.bondSliderHint}>
                  Maximum {formatGBP(maxWithdrawal)} per year · Allowance resets after 20 years
                </span>
                <span className={s.bondRunningTotal}>Cumulative withdrawals: {formatGBP(result.totalWithdrawalsTaken)}</span>
              </div>
            )}
          </div>

          <div className={s.bondFeatureBlock}>
            <div className={s.bondFeatureHead}>
              <span className={s.bondFeatureLabel}>Time-Apportionment Relief</span>
              <button
                className={[s.bondToggle, form.tarEnabled ? s.bondToggleOn : ''].join(' ')}
                onClick={() => updateField('tarEnabled', !form.tarEnabled)}
                aria-label="Toggle time-apportionment relief"
              >
                <span className={s.bondToggleKnob} />
              </button>
            </div>
            {form.tarEnabled && (
              <div className={s.bondFeatureBody}>
                <span className={s.bondSliderLabel}>Years Held While Non-UK Resident</span>
                <div className={s.bondSliderValueRow}>
                  <span className={s.bondSliderValue}>{form.nonUkResidentYears} of {form.timeHorizonYears} years</span>
                </div>
                <input className={s.bondSliderInput} type="range" min={0} max={form.timeHorizonYears} step={1}
                  value={form.nonUkResidentYears} onChange={e => updateField('nonUkResidentYears', Number(e.target.value))} />
                <span className={s.bondRunningTotal}>{result.timeApportionmentRelief}% of gain exempt from UK tax</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 3 — Main comparison chart */}
      <div className={s.bondChartArea}>
        <div className={s.bondChartTitle}>Portfolio Bond vs GIA</div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--hairline)" strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} tickFormatter={v => `Y${v}`} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} tickFormatter={formatAxisGBP} width={50} />
            <Tooltip content={<BondTooltip />} />
            <Area type="monotone" dataKey="giaValue" stackId="gap" stroke="none" fill="transparent" isAnimationActive={false} />
            <Area type="monotone" dataKey="gap" stackId="gap" stroke="none" fill="var(--accent)" fillOpacity={0.1} isAnimationActive={false} />
            <Line type="monotone" dataKey="bondValue" stroke="var(--accent)" strokeWidth={2.5}
              dot={(p: DotRenderProps) => renderBondDot(p, chartData)} isAnimationActive={false} />
            <Line type="monotone" dataKey="giaValue" stroke="var(--alert)" strokeWidth={2} strokeDasharray="5 4"
              dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className={s.bondChartCaption}>
          Tax drag costs {formatGBP(taxDragAtMaturity)} over {form.timeHorizonYears} years
        </div>
        <div className={s.bondLegendRow}>
          <div className={s.bondLegendItem}>
            <span className={s.bondLegendLine} style={{ background: 'var(--accent)' }} />
            Portfolio Bond (gross roll-up)
          </div>
          <div className={s.bondLegendItem}>
            <span className={s.bondLegendLine} style={{ borderTop: '2px dashed var(--alert)' }} />
            GIA (taxed annually)
          </div>
        </div>
      </div>

      {/* Section 4 — Info panels */}
      <div className={s.bondInfoPanels}>
        <div className={s.bondInfoPanel}>
          <div className={s.bondInfoPanelHead}>
            <span className={s.bondInfoPanelIcon}>📈</span>
            <span className={s.bondInfoPanelTitle}>Gross Roll-Up</span>
          </div>
          <div className={s.bondInfoCompareRow}>
            <span style={{ color: 'var(--accent)' }}>Bond {formatGBP(result.finalBondValue)}</span>
            <span style={{ color: 'var(--alert)' }}>GIA {formatGBP(result.finalGiaValue)}</span>
          </div>
          <div className={s.bondCompareBar}>
            <div className={s.bondCompareBarBond} style={{ width: `${bondBarPct}%` }} />
            <div className={s.bondCompareBarGia} style={{ width: `${100 - bondBarPct}%` }} />
          </div>
          <div className={s.bondInfoLine}>The bond grows {fmtPct(bondFinalPct)} more over {form.timeHorizonYears} years</div>
        </div>

        <div className={s.bondInfoPanel}>
          <div className={s.bondInfoPanelHead}>
            <span className={s.bondInfoPanelIcon}>🛡</span>
            <span className={s.bondInfoPanelTitle}>Tax Deferred</span>
          </div>
          <div className={s.bondInfoBigFigure}>{formatGBP(result.totalTaxDeferred)}</div>
          <div className={s.bondInfoLine}>vs paying tax annually in a GIA</div>
          <div className={s.bondCompareBar}>
            <div className={s.bondCompareBarBond} style={{ width: `${keepPct}%` }} />
            <div className={s.bondCompareBarGia} style={{ width: `${100 - keepPct}%` }} />
          </div>
          <div className={s.bondInfoLine}>Effective annual advantage: {fmtPct(result.effectiveAnnualAdvantage)} p.a.</div>
        </div>

        <div className={s.bondInfoPanel}>
          <div className={s.bondInfoPanelHead}>
            <span className={s.bondInfoPanelIcon}>{form.tarEnabled ? '⏳' : '💰'}</span>
            <span className={s.bondInfoPanelTitle}>
              {form.tarEnabled ? 'Time-Apportionment Relief' : '5% Withdrawal Allowance'}
            </span>
          </div>
          {form.tarEnabled ? (
            <>
              <div className={s.bondInfoLine}>
                {result.timeApportionmentRelief}% of gain exempt — {form.nonUkResidentYears} years non-UK resident
              </div>
              <div className={s.bondInfoLine}>
                Taxable gain reduced from {formatGBP(gainBeforeTAR)} to {formatGBP(result.taxableGainAtMaturity)}
              </div>
              <div className={s.bondInfoBigFigure}>{formatGBP(taxSavingFromTAR)}</div>
              <div className={s.bondInfoLine}>Potential tax saving at maturity</div>
            </>
          ) : form.withdrawalEnabled ? (
            <>
              <div className={s.bondInfoLine}>
                Draw {formatGBP(form.annualWithdrawal)}/year for {form.timeHorizonYears} years — no immediate UK tax
              </div>
              <div className={s.bondInfoBigFigure}>{formatGBP(result.totalWithdrawalsTaken)}</div>
              <div className={s.bondInfoLine}>Total tax-deferred withdrawals</div>
              <div className={s.bondProgressBar}>
                <div className={s.bondProgressFill} style={{ width: `${allowanceUsedPct}%` }} />
              </div>
              <div className={s.bondInfoLine}>Allowance resets after 20 years</div>
            </>
          ) : (
            <div className={s.bondInfoLine}>
              Up to 5% of the original premium can be withdrawn each year, tax-deferred, for up to 20
              years. Toggle &quot;5% Annual Withdrawal&quot; to model it, or &quot;Time-Apportionment
              Relief&quot; to see the effect of non-UK residency on the eventual tax bill.
            </div>
          )}
        </div>
      </div>

      {/* Section 5 — Returns Summary */}
      <div className={s.bondSummaryCard}>
        <div className={s.bondSummaryHead}>Portfolio Bond vs GIA — {form.timeHorizonYears} Year Comparison</div>
        <div className={s.bondSummaryRow}><span>Starting amount</span><span>{formatGBP(form.startingAmount)}</span></div>
        <div className={s.bondSummaryRow}><span>Assumed growth</span><span>{form.annualGrowthRate}% p.a.</span></div>
        <div className={s.bondSummaryRow}><span>Tax rate</span><span>{form.taxRate}%</span></div>
        <hr className={s.bondSummaryDivider} />
        <div className={s.bondSummaryColHead}><span /><span>Bond</span><span>GIA</span></div>
        <div className={s.bondSummaryColRow}>
          <span>Final value</span><span>{formatGBP(result.finalBondValue)}</span><span>{formatGBP(result.finalGiaValue)}</span>
        </div>
        <div className={s.bondSummaryColRow}>
          <span>Total withdrawals</span><span>{formatGBP(result.totalWithdrawalsTaken)}</span><span>—</span>
        </div>
        <div className={s.bondSummaryColRow}>
          <span>Effective total</span><span>{formatGBP(bondEffectiveTotal)}</span><span>{formatGBP(result.finalGiaValue)}</span>
        </div>
        <hr className={s.bondSummaryDivider} />
        <div className={s.bondSummaryTotal}>
          <span>Advantage of bond</span>
          <span>+{formatGBP(bondEffectiveTotal - result.finalGiaValue)} ({fmtPct(advantagePct)})</span>
        </div>
        <div className={s.bondSummaryRow}><span>Effective annual edge</span><span>{fmtPct(result.effectiveAnnualAdvantage)} p.a.</span></div>

        {form.tarEnabled && (
          <>
            <hr className={s.bondSummaryDivider} />
            <div className={s.bondSummaryRow}><span>Time-apportionment relief</span><span>{result.timeApportionmentRelief}% of gain exempt</span></div>
            <div className={s.bondSummaryRow}>
              <span>Taxable gain at maturity</span>
              <span>{formatGBP(result.taxableGainAtMaturity)} (reduced from {formatGBP(gainBeforeTAR)})</span>
            </div>
            <div className={s.bondSummaryRow}><span>Estimated tax saving</span><span>{formatGBP(taxSavingFromTAR)}</span></div>
          </>
        )}

        <div className={s.bondDisclaimer}>
          ⚠ All figures are illustrations only. Returns not guaranteed. Tax treatment depends on individual circumstances.
        </div>
      </div>

      <ProductProfile {...PROFILE_DATA} />
    </div>
  )
}
