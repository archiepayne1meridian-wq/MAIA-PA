'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import s from '../../dashboard.module.css'
import { calculateSIPPvsQROPS, formatGBP, type SIPPQROPSParams, type YearlyComparison } from '@/lib/sipp-qrops-calc'
import ProductProfile from '@/components/atlas/ProductProfile'

// ── Types & defaults ─────────────────────────────────────────────────────────

interface SIPPQROPSFormState {
  pensionValue: number
  clientAge: number
  retirementAge: number
  annualGrowthRate: number
  drawdownRate: number
  sameCountry: boolean
  ihtInScope: boolean
}

const CLIENT_COUNTRY = 'Switzerland'
const QROPS_COUNTRY = 'Malta'

const DEFAULT_SIPP_QROPS_FORM: SIPPQROPSFormState = {
  pensionValue: 150000,
  clientAge: 45,
  retirementAge: 65,
  annualGrowthRate: 6,
  drawdownRate: 4,
  sameCountry: false,
  ihtInScope: false,
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function fmtGBP(n: number): string {
  return formatGBP(n)
}
function formatAxisGBP(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}m`
  if (Math.abs(v) >= 1000) return `£${Math.round(v / 1000)}k`
  return `£${v}`
}

type ChartRow = YearlyComparison & { gap: number }

// ── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipPayloadItem { dataKey?: string; value?: number; payload?: ChartRow }

function SIPPQROPSTooltip({ active, payload, label, sameCountry }: {
  active?: boolean; payload?: TooltipPayloadItem[]; label?: number; sameCountry: boolean
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload
  if (!row) return null
  return (
    <div style={{
      background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '9px 13px', fontSize: 11, fontFamily: 'var(--mono)',
    }}>
      <div style={{ color: 'var(--text-dim)', marginBottom: 5 }}>Age {label}</div>
      <div style={{ color: 'var(--accent)' }}>SIPP: {fmtGBP(row.sippValue)}</div>
      {!sameCountry && (
        <>
          <div style={{ color: 'var(--alert)' }}>QROPS (OTC): {fmtGBP(row.qropsValueWithCharge)}</div>
          <div style={{ color: 'var(--online)' }}>QROPS (exempt): {fmtGBP(row.qropsValueNoCharge)}</div>
          <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>
            Gap vs SIPP: {fmtGBP(row.gap)}
          </div>
        </>
      )}
      {sameCountry && (
        <div style={{ color: 'var(--online)' }}>QROPS (exempt): {fmtGBP(row.qropsValueNoCharge)}</div>
      )}
    </div>
  )
}

// ── Product profile data ─────────────────────────────────────────────────────

const PROFILE_DATA = {
  productName: 'SIPP vs QROPS',
  whatItIs: 'A SIPP (Self-Invested Personal Pension) is a UK pension wrapper that stays inside the UK regulatory system — FCA protected, no transfer charge, multi-currency drawdown available. A QROPS (Qualifying Recognised Overseas Pension Scheme) is an overseas pension scheme that meets HMRC criteria, allowing a UK pension to be transferred abroad. Since October 2024, a 25% Overseas Transfer Charge applies to QROPS transfers unless the client lives in the same country as the scheme. Both will fall inside the UK IHT net from April 2027 for clients with 10+ years of UK tax residency.',
  whatItHolds: [
    'SIPP: UK-regulated investments — funds, ETFs, structured notes, cash',
    'QROPS: investment options vary by scheme — typically funds and cash',
    'Both: multi-currency drawdown capability',
    'Both: can hold an RL360 or Ardan platform inside',
  ],
  whoItsFor: [
    'Any client with a UK pension who has moved abroad — the core deVere prospect',
    'SIPP: client in Switzerland (different country to Malta QROPS) — OTC applies to QROPS',
    'QROPS: client in Malta, Gibraltar, or Isle of Man — OTC exempt, QROPS may be appropriate',
    'Both: client who wants professional management of their UK pension rather than leaving it in a default fund',
    'NOT suitable: client who needs to access pension before age 57 (2028 rule change)',
  ],
  keyBenefits: [
    'SIPP: no transfer charge, FCA protection, available to all UK pension holders abroad',
    'SIPP: simpler repatriation if client returns to UK',
    'QROPS: exits UK pension system entirely (relevant for specific jurisdictions)',
    'QROPS: potential succession/estate planning advantages in specific cases',
    'Both: consolidation of old UK pensions into one managed structure',
    'Both: access to institutional fund share classes via platforms like Ardan/RL360',
  ],
  gaps: [
    'Client with UK pension in default fund, never reviewed, unaware of performance or charges',
    'Client who left the UK years ago and assumes their pension ‘is fine’ — it’s still invested for a UK life they no longer live',
    'Client who was advised QROPS pre-October 2024 and doesn’t know the rules changed',
    'Client paying high charges on an old workplace pension with no adviser oversight',
    'Client with multiple old UK pensions from different employers — consolidation opportunity',
  ],
  comparisons: [
    { product: 'Leaving pension in old workplace scheme', difference: 'Old workplace pensions are typically in default funds, never reviewed, often with high charges. SIPP/QROPS gives active management and appropriate international structure.', useWhen: 'Almost always worth consolidating into SIPP — the default workplace scheme was designed for UK residents' },
    { product: 'Portfolio bond (RL360)', difference: 'Portfolio bond is a tax wrapper that can sit around a SIPP/QROPS. They are complementary — the pension is the structure, the bond provides tax deferral on investments within it.', useWhen: 'Bond and pension serve different purposes — pension for retirement savings, bond for non-pension lump sums' },
    { product: 'Annuity', difference: 'Annuity converts pension to guaranteed income for life — no flexibility. SIPP/QROPS drawdown preserves the pot and passes to estate on death.', useWhen: 'Drawdown (SIPP/QROPS) is usually preferred for internationally mobile clients who need flexibility' },
  ],
  whenToUseVs: [
    { useThis: 'SIPP — client in Switzerland with Malta QROPS available — OTC makes QROPS costly', useAlternative: 'QROPS — client in Malta or Gibraltar where OTC is exempt', alternative: 'QROPS (same-country exemption)' },
    { useThis: 'SIPP — client may return to UK, wants FCA protection, pension under £200k', useAlternative: 'QROPS — client permanently leaving UK, in exempt jurisdiction, large pension with succession planning needs', alternative: 'QROPS with specialist advice' },
  ],
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SIPPQROPSVisualizer() {
  const router = useRouter()
  const [form, setForm] = useState<SIPPQROPSFormState>(DEFAULT_SIPP_QROPS_FORM)

  function updateField<K extends keyof SIPPQROPSFormState>(key: K, value: SIPPQROPSFormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const params: SIPPQROPSParams = {
    pensionValue: form.pensionValue,
    clientAge: form.clientAge,
    retirementAge: form.retirementAge,
    annualGrowthRate: form.annualGrowthRate,
    clientCountry: CLIENT_COUNTRY,
    qropsCountry: QROPS_COUNTRY,
    sameCountry: form.sameCountry,
    drawdownRate: form.drawdownRate,
    ihtInScope: form.ihtInScope,
  }

  const result = useMemo(() => calculateSIPPvsQROPS(params), [
    form.pensionValue, form.clientAge, form.retirementAge, form.annualGrowthRate,
    form.drawdownRate, form.sameCountry, form.ihtInScope,
  ])

  const chartData: ChartRow[] = result.yearlyComparisons.map(row => ({
    ...row,
    gap: Math.max(0, row.sippValue - row.qropsValueWithCharge),
  }))

  const annualIncomeGap = result.sippAnnualIncome - result.qropsAnnualIncomeWithCharge

  return (
    <div className={s.vizPage}>
      <button className={s.agentPageBack} onClick={() => router.push('/dashboard/visualizer')}>← ATLAS</button>

      <div className={s.vizPageHead}>
        <div className={s.drawerBadge}>SQ</div>
        <div>
          <div className={s.drawerName}>ATLAS — SIPP vs QROPS</div>
          <div className={s.drawerRole}>UK pension transfer mechanics — the 25% Overseas Transfer Charge, explained</div>
        </div>
      </div>

      {/* Section 1 — Product Summary */}
      <div className={s.vizIntroCard}>
        <div className={s.vizIntroTitle}>SIPP vs QROPS</div>
        <div className={s.libertyCallout} style={{ marginTop: 0, marginBottom: 14 }}>
          ⚠ Rule change: Since October 2024, a 25% Overseas Transfer Charge applies to most
          QROPS transfers. SIPP is now often the better default for UK pension transfers abroad.
        </div>
        <p className={s.vizIntroText}>
          A SIPP (Self-Invested Personal Pension) keeps the pension inside the UK regulatory
          system — no transfer charge, FCA protection, and multi-currency drawdown available. A
          QROPS (Qualifying Recognised Overseas Pension Scheme) moves the pension outside the UK
          system — but since October 2024, a 25% Overseas Transfer Charge applies unless the
          client lives in the same country as the QROPS scheme. This visualizer shows the real
          cost of the charge and helps identify when each structure is appropriate.
        </p>
      </div>

      {/* Section 2 — Decision Gate */}
      <div className={s.sippDecisionGate}>
        <div className={s.bondChartTitle} style={{ fontSize: 16, fontFamily: 'var(--display)', fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: 'var(--text)' }}>
          Does the OTC Apply?
        </div>
        <div className={s.pillar3TaxStats} style={{ marginTop: 14 }}>
          <button
            className={[s.sippDecisionBtn, form.sameCountry ? s.sippDecisionBtnOnline : ''].join(' ')}
            onClick={() => updateField('sameCountry', true)}
          >
            Client lives in the SAME country as the QROPS scheme
            <span className={s.bondSliderHint} style={{ display: 'block', marginTop: 6 }}>
              e.g. Client in Malta → Malta QROPS → OTC EXEMPT
            </span>
          </button>
          <button
            className={[s.sippDecisionBtn, !form.sameCountry ? s.sippDecisionBtnAlert : ''].join(' ')}
            onClick={() => updateField('sameCountry', false)}
          >
            Client lives in a DIFFERENT country to the QROPS scheme
            <span className={s.bondSliderHint} style={{ display: 'block', marginTop: 6 }}>
              e.g. Client in Switzerland → Malta QROPS → 25% OTC APPLIES
            </span>
          </button>
        </div>
        {form.sameCountry ? (
          <div className={s.libertyCallout} style={{ borderLeftColor: 'var(--online)', color: 'var(--online)', marginTop: 14 }}>
            OTC Exempt — no transfer charge applies
          </div>
        ) : (
          <div className={s.libertyCallout} style={{ marginTop: 14 }}>
            25% OTC Applies — see the cost below
          </div>
        )}
      </div>

      {/* Section 3 — Controls */}
      <div className={s.pillar3Controls}>
        <div className={s.bondControlsCol}>
          <span className={s.eyebrow}>Pension Details</span>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Current Pension Transfer Value</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{fmtGBP(form.pensionValue)}</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={10000} max={500000} step={5000}
              value={form.pensionValue} onChange={e => updateField('pensionValue', Number(e.target.value))} />
            {!form.sameCountry && (
              <span className={s.bondSliderHint} style={{ color: 'var(--alert)' }}>
                OTC charge: {fmtGBP(result.otcCharge)} (25%)
              </span>
            )}
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Client Age</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>Age {form.clientAge}</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={35} max={60} step={1}
              value={form.clientAge} onChange={e => updateField('clientAge', Number(e.target.value))} />
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Retirement Age</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>Age {form.retirementAge}</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={60} max={75} step={1}
              value={form.retirementAge} onChange={e => updateField('retirementAge', Number(e.target.value))} />
            <span className={s.bondSliderHint}>{result.yearsToRetirement} years to retirement</span>
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Annual Growth Rate</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.annualGrowthRate.toFixed(1)}% p.a.</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={2} max={10} step={0.5}
              value={form.annualGrowthRate} onChange={e => updateField('annualGrowthRate', Number(e.target.value))} />
            <span className={s.bondSliderHint}>Illustration only</span>
          </div>
        </div>

        <div className={s.bondControlsCol}>
          <span className={s.eyebrow}>Additional Options</span>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>Annual Income in Retirement (% of pot)</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue}>{form.drawdownRate.toFixed(1)}% per year</span>
            </div>
            <input className={s.bondSliderInput} type="range" min={2} max={6} step={0.5}
              value={form.drawdownRate} onChange={e => updateField('drawdownRate', Number(e.target.value))} />
            <span className={s.bondSliderHint}>4% is a commonly used sustainable drawdown rate</span>
          </div>

          <div className={s.bondFeatureBlock}>
            <div className={s.bondFeatureHead}>
              <span className={s.bondFeatureLabel}>Client in UK IHT net?</span>
              <button
                className={[s.bondToggle, form.ihtInScope ? s.bondToggleOn : ''].join(' ')}
                onClick={() => updateField('ihtInScope', !form.ihtInScope)}
              >
                <span className={s.bondToggleKnob} />
              </button>
            </div>
            <div className={s.bondFeatureBody}>
              <span className={s.bondSliderHint}>
                From April 2027, both SIPP and QROPS are in scope for UK IHT. Client is in scope
                if UK tax resident for 10 of the last 20 years.
              </span>
            </div>
          </div>

          <div className={s.bondSliderGroup}>
            <span className={s.bondSliderLabel}>QROPS Jurisdiction</span>
            <div className={s.bondSliderValueRow}>
              <span className={s.bondSliderValue} style={{ fontSize: 16 }}>{QROPS_COUNTRY} (most common)</span>
            </div>
            <span className={s.bondSliderHint}>
              Malta, Gibraltar, Isle of Man — same-country rule only applies if client lives in
              the scheme&apos;s jurisdiction
            </span>
          </div>
        </div>
      </div>

      {/* Section 4 — OTC Impact Card */}
      {!form.sameCountry && (
        <div className={s.sippOTCCard}>
          <div className={s.bondChartTitle}>The Cost of the 25% Overseas Transfer Charge</div>
          <div className={s.pillar3TaxStats}>
            <div>
              <div className={s.bondSliderLabel}>OTC charge (25%)</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, color: 'var(--alert)' }}>
                {fmtGBP(result.otcCharge)}
              </div>
              <div className={s.bondSliderHint}>deducted upfront</div>
            </div>
            <div>
              <div className={s.bondSliderLabel}>Starting QROPS value</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, color: 'var(--accent)' }}>
                {fmtGBP(result.qropsStartingValue)}
              </div>
              <div className={s.bondSliderHint}>vs {fmtGBP(result.sippStartingValue)} SIPP</div>
            </div>
            <div>
              <div className={s.bondSliderLabel}>Cost compounded to retirement</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, color: 'var(--alert)' }}>
                {fmtGBP(result.otcCostAtRetirement)}
              </div>
              <div className={s.bondSliderHint}>extra you&apos;d have had</div>
            </div>
          </div>
          <div className={s.bondInfoLine} style={{ marginTop: 12 }}>
            A 25% charge on {fmtGBP(result.originalPensionValue)} leaves only{' '}
            {fmtGBP(result.qropsStartingValue)} to invest in QROPS. At {form.annualGrowthRate}%
            growth over {result.yearsToRetirement} years, that charge has grown to cost you{' '}
            {fmtGBP(result.otcCostAtRetirement)} — the true opportunity cost of transferring when
            the OTC applies.
          </div>
        </div>
      )}

      {/* Section 5 — Growth Comparison Chart */}
      <div className={s.bondChartArea}>
        <div className={s.bondChartTitle}>SIPP vs QROPS — Value at Retirement</div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--hairline)" strokeDasharray="3 3" />
            <XAxis dataKey="age" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} tickFormatter={v => `${v}`} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} tickFormatter={formatAxisGBP} width={60} />
            <Tooltip content={<SIPPQROPSTooltip sameCountry={form.sameCountry} />} />
            {!form.sameCountry && (
              <>
                <Area type="monotone" dataKey="qropsValueWithCharge" stackId="gap" stroke="none" fill="transparent" isAnimationActive={false} />
                <Area type="monotone" dataKey="gap" stackId="gap" stroke="none" fill="var(--alert)" fillOpacity={0.1} isAnimationActive={false} />
              </>
            )}
            <Line type="monotone" dataKey="sippValue" stroke="var(--accent)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            {!form.sameCountry && (
              <Line type="monotone" dataKey="qropsValueWithCharge" stroke="var(--alert)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            )}
            <Line type="monotone" dataKey="qropsValueNoCharge" stroke="var(--online)" strokeWidth={1.5} strokeDasharray="1 3" dot={false} isAnimationActive={false} />
            <ReferenceLine
              x={form.retirementAge}
              stroke="var(--border)"
              strokeDasharray="3 3"
              label={{ value: 'Retirement', position: 'top', fill: 'var(--text-dim)', fontSize: 10 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div className={s.bondChartCaption}>
          {form.sameCountry
            ? 'OTC exempt — SIPP and QROPS follow the same trajectory'
            : `Permanent gap from the OTC charge: ${fmtGBP(result.otcCostAtRetirement)} at retirement`}
        </div>
        <div className={s.bondLegendRow}>
          <div className={s.bondLegendItem}>
            <span className={s.bondLegendLine} style={{ background: 'var(--accent)' }} />
            SIPP
          </div>
          {!form.sameCountry && (
            <div className={s.bondLegendItem}>
              <span className={s.bondLegendLine} style={{ borderTop: '2px dashed var(--alert)' }} />
              QROPS with OTC
            </div>
          )}
          <div className={s.bondLegendItem}>
            <span className={s.bondLegendLine} style={{ borderTop: '1.5px dotted var(--online)' }} />
            QROPS {form.sameCountry ? 'exempt' : 'if OTC exempt'}
          </div>
        </div>
      </div>

      {/* Section 6 — Side by Side Comparison Table */}
      <div className={s.sippComparisonTable}>
        <div className={s.bondChartTitle}>Side by Side Comparison</div>
        <div className={s.bondSummaryColHead} style={{ gridTemplateColumns: form.sameCountry ? '1fr 110px 110px 110px' : '1fr 110px 110px' }}>
          <span />
          <span>SIPP</span>
          <span>QROPS (OTC)</span>
          {form.sameCountry && <span>QROPS (Exempt)</span>}
        </div>
        <hr className={s.bondSummaryDivider} />

        {[
          {
            label: 'Transfer charge',
            sipp: 'None',
            qropsOtc: form.sameCountry ? 'None' : `25% = ${fmtGBP(result.otcCharge)}`,
            qropsExempt: 'None',
          },
          {
            label: 'Starting value',
            sipp: fmtGBP(result.sippStartingValue),
            qropsOtc: fmtGBP(result.qropsStartingValue),
            qropsExempt: fmtGBP(result.originalPensionValue),
          },
          {
            label: 'Value at retirement',
            sipp: fmtGBP(result.sippValueAtRetirement),
            qropsOtc: fmtGBP(result.qropsValueAtRetirementWithCharge),
            qropsExempt: fmtGBP(result.qropsValueAtRetirementNoCharge),
          },
          {
            label: 'Annual income (drawdown)',
            sipp: `${fmtGBP(result.sippAnnualIncome)}/yr`,
            qropsOtc: `${fmtGBP(result.qropsAnnualIncomeWithCharge)}/yr`,
            qropsExempt: `${fmtGBP(result.qropsAnnualIncomeNoCharge)}/yr`,
          },
          {
            label: 'UK regulatory protection',
            sipp: '✅ FCA',
            qropsOtc: '❌ HMRC only',
            qropsExempt: '❌ HMRC only',
          },
          {
            label: 'Multi-currency drawdown',
            sipp: '✅ Available',
            qropsOtc: '✅ Available',
            qropsExempt: '✅ Available',
          },
          {
            label: 'IHT exposure (post Apr 2027)',
            sipp: '✅ In scope',
            qropsOtc: '✅ In scope',
            qropsExempt: '✅ In scope',
          },
        ].map(row => (
          <div key={row.label} className={s.bondSummaryColRow} style={{ gridTemplateColumns: form.sameCountry ? '1fr 110px 110px 110px' : '1fr 110px 110px' }}>
            <span>{row.label}</span>
            <span>{row.sipp}</span>
            <span>{row.qropsOtc}</span>
            {form.sameCountry && <span>{row.qropsExempt}</span>}
          </div>
        ))}

        <hr className={s.bondSummaryDivider} />
        <div className={s.bondSummaryColRow} style={{ gridTemplateColumns: form.sameCountry ? '1fr 110px 110px 110px' : '1fr 110px 110px' }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>Advantage vs SIPP</span>
          <span>Baseline</span>
          <span style={{ color: 'var(--alert)' }}>
            {form.sameCountry ? 'Same trajectory' : `-${fmtGBP(annualIncomeGap)}/yr`}
          </span>
          {form.sameCountry && <span style={{ color: 'var(--online)' }}>Same trajectory</span>}
        </div>
      </div>

      {/* Section 7 — IHT Panel */}
      {form.ihtInScope && (
        <div className={s.sippIHTPanel}>
          <span className={s.eyebrow} style={{ color: 'var(--idle)' }}>IHT Position — Post April 2027</span>
          <p className={s.profileText} style={{ marginTop: 10 }}>
            From 6 April 2027, unused pension funds — including both SIPPs and QROPS — will fall
            inside the UK estate for inheritance tax purposes for clients in the UK IHT net (UK tax
            resident for 10 of the last 20 years). This removes a historic advantage of QROPS over
            SIPP for IHT planning. Both structures are now broadly equivalent for IHT purposes for
            UK-connected clients.
          </p>
          <div className={s.pillar3TaxStats} style={{ marginTop: 10 }}>
            <div>
              <div className={s.bondSliderLabel}>Estimated IHT on SIPP</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: 'var(--idle)' }}>
                {fmtGBP(result.ihtOnSIPP)}
              </div>
            </div>
            <div>
              <div className={s.bondSliderLabel}>Estimated IHT on QROPS</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: 'var(--idle)' }}>
                {fmtGBP(result.ihtOnQROPS)}
              </div>
            </div>
          </div>
          <div className={s.bondDisclaimer}>
            ⚠ IHT is complex and depends on many factors including domicile, residence, nil-rate
            band, and timing. These figures are simplified illustrations only. Always refer to a
            qualified adviser for estate planning.
          </div>
        </div>
      )}

      {/* Section 8 — Decision Guide */}
      <div className={s.profileSection}>
        <span className={s.eyebrow}>Decision Guide</span>
        <div className={s.bondChartTitle} style={{ fontSize: 16, fontFamily: 'var(--display)', fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: 'var(--text)', marginTop: 8 }}>
          When Is Each Right?
        </div>
        <div className={s.sippDecisionColumns}>
          <div className={s.profileCard} style={{ borderLeft: '3px solid var(--accent)' }}>
            <div className={s.profileCardTitle}>Use SIPP when:</div>
            <div className={s.profileBulletList}>
              <div className={s.profileBullet}><span className={s.profileDotAccent} /><span>Client is NOT living in the same country as any available QROPS scheme</span></div>
              <div className={s.profileBullet}><span className={s.profileDotAccent} /><span>Client wants FCA regulatory protection</span></div>
              <div className={s.profileBullet}><span className={s.profileDotAccent} /><span>Client wants to avoid the 25% OTC charge</span></div>
              <div className={s.profileBullet}><span className={s.profileDotAccent} /><span>Client&apos;s pension is under £100,000 (OTC charge is proportionally very costly)</span></div>
              <div className={s.profileBullet}><span className={s.profileDotAccent} /><span>Client may return to UK (SIPP makes repatriation simpler)</span></div>
              <div className={s.profileBullet}><span className={s.profileDotAccent} /><span>Default recommendation post-October 2024 for most Swiss-based clients</span></div>
            </div>
          </div>
          <div className={s.profileCard} style={{ borderLeft: '3px solid var(--online)' }}>
            <div className={s.profileCardTitle}>Use QROPS when:</div>
            <div className={s.profileBulletList}>
              <div className={s.profileBullet}><span className={s.profileDotOnline} /><span>Client lives in the SAME country as the QROPS scheme (OTC exempt)</span></div>
              <div className={s.profileBullet}><span className={s.profileDotOnline} /><span>Client is permanently leaving the UK with no intention to return</span></div>
              <div className={s.profileBullet}><span className={s.profileDotOnline} /><span>Client is in a jurisdiction with favorable QROPS treatment</span></div>
              <div className={s.profileBullet}><span className={s.profileDotOnline} /><span>Client has a very large pension and specific IHT/succession planning needs (get specialist advice)</span></div>
              <div className={s.profileBullet}><span className={s.profileDotOnline} /><span>Client is in Malta, Gibraltar, or Isle of Man (same-country exemption applies)</span></div>
            </div>
          </div>
          <div className={s.profileCard} style={{ borderLeft: '3px solid var(--alert)' }}>
            <div className={[s.profileCardTitle, s.profileCardTitleIdle].join(' ')} style={{ color: 'var(--alert)' }}>Never:</div>
            <div className={s.profileBulletList}>
              <div className={s.profileBullet}><span className={s.profileDotIdle} style={{ background: 'var(--alert)' }} /><span>Transfer to QROPS if OTC applies without fully showing the client the charge cost</span></div>
              <div className={s.profileBullet}><span className={s.profileDotIdle} style={{ background: 'var(--alert)' }} /><span>Assume QROPS is automatically better because it&apos;s &quot;offshore&quot;</span></div>
              <div className={s.profileBullet}><span className={s.profileDotIdle} style={{ background: 'var(--alert)' }} /><span>Recommend a transfer without a qualified adviser&apos;s involvement</span></div>
              <div className={s.profileBullet}><span className={s.profileDotIdle} style={{ background: 'var(--alert)' }} /><span>Quote specific tax outcomes without adviser sign-off</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 9 — Product Profile */}
      <ProductProfile {...PROFILE_DATA} />
    </div>
  )
}
