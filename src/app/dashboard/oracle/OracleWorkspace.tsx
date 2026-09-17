'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import s from '../dashboard.module.css'

// Local copies of the shapes returned by the API — deliberately not imported
// from src/lib/oracle.ts, which pulls in the Anthropic SDK and must never end
// up in a client bundle (same convention as HermesWorkspace / MuseWorkspace).

interface OracleWorkHistoryItem {
  employer: string
  role: string
  location: string
  country: string
  years: number
  date_from: string
  date_to: string
  pension_type: string
  salary_range_estimate: string
  pension_estimate: { currency: string; low: number; high: number; notes: string }
}

interface OracleAnalysis {
  prospect: {
    name: string | null
    current_role: string
    current_employer: string
    current_location: string
    nationality_estimate: string | null
    years_in_switzerland: number | null
  }
  work_history: OracleWorkHistoryItem[]
  pension_summary: {
    uk_pensions: {
      count: number
      total_low: number
      total_high: number
      currency: 'GBP'
      includes_db: boolean
      db_details: string | null
      state_pension_qualifying_years: number
      state_pension_status: string
      isa_likely: boolean
    }
    swiss_pensions: {
      pillar_2_employers: number
      vested_benefits_low: number
      vested_benefits_high: number
      currency: 'CHF'
      current_pillar_2_building: boolean
      pillar_3_possible: boolean
    }
    other_pensions: { country: string; type: string; estimated_value: string; currency: string; notes: string }[]
  }
  key_flags: { flag: string; severity: 'high' | 'medium' | 'low'; detail: string }[]
  conversation_angles: string[]
  hermes_scenario: string
  opening_line_suggestion: string
  fact_find_priorities: string[]
  disclaimer: string
}

interface AnalyseResponse {
  id: string
  museCaseId: string
  museDisplayName: string
  analysis: OracleAnalysis
}

interface RecentAnalysisRow {
  id: string
  prospect_name: string | null
  current_employer: string | null
  current_role: string | null
  current_location: string | null
  analysis_json: string
  muse_case_id: string | null
  created_at: number
}

const SEVERITY_CLASS: Record<string, string> = {
  high: 'oracleFlagHigh',
  medium: 'oracleFlagMedium',
  low: 'oracleFlagLow',
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-GB')
}

function topFlag(flags: OracleAnalysis['key_flags']): OracleAnalysis['key_flags'][number] | null {
  const rank: Record<string, number> = { high: 2, medium: 1, low: 0 }
  return [...flags].sort((a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0))[0] ?? null
}

export default function OracleWorkspace() {
  const router = useRouter()

  const [linkedinText, setLinkedinText] = useState('')
  const [analysing, setAnalysing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyseResponse | null>(null)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [openerCopied, setOpenerCopied] = useState(false)
  const [recent, setRecent] = useState<RecentAnalysisRow[]>([])

  function loadRecent() {
    void fetch('/api/dashboard/oracle/analyses')
      .then(r => r.json())
      .then((d: { analyses: RecentAnalysisRow[] }) => setRecent(d.analyses ?? []))
      .catch(() => setRecent([]))
  }

  useEffect(() => { loadRecent() }, [])

  async function analyse() {
    if (!linkedinText.trim() || analysing) return
    setAnalysing(true)
    setError(null)
    try {
      const data = await fetch('/api/dashboard/oracle/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedinText: linkedinText.trim() }),
      }).then(r => r.json()) as AnalyseResponse & { error?: string }
      if (data.error) {
        setError(data.error)
      } else {
        setResult(data)
        setExpandedRow(null)
        loadRecent()
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setAnalysing(false)
    }
  }

  async function loadAnalysis(id: string) {
    setError(null)
    try {
      const data = await fetch(`/api/dashboard/oracle/analyses/${id}`).then(r => r.json()) as {
        analysis?: OracleAnalysis
        muse_case_id?: string | null
        prospect_name?: string | null
        error?: string
      }
      if (data.error || !data.analysis) {
        setError(data.error ?? 'Could not load analysis')
        return
      }
      setResult({
        id,
        museCaseId: data.muse_case_id ?? '',
        museDisplayName: data.prospect_name ?? 'Unknown',
        analysis: data.analysis,
      })
      setExpandedRow(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(String(e))
    }
  }

  function openHermes(scenarioId: string) {
    router.push(`/dashboard/hermes?scenario=${encodeURIComponent(scenarioId)}`)
  }

  const analysis = result?.analysis ?? null

  return (
    <div className={s.fullPage}>
      <div className={s.fullPageTopbar}>
        <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
        <span className={s.fpPageTitle}>ORACLE</span>
        <span className={s.fpPageSubtitle}>Pension Estimator</span>
      </div>

      <div className={s.oracleScroll}>

        {/* ── Section 1: Input ────────────────────────────────────────────── */}
        <div className={s.oracleInputCard}>
          <div className={s.oracleInputTitle}>ORACLE — Pension Estimator</div>
          <div className={s.oracleInputSub}>Paste a LinkedIn work history to estimate pension holdings and generate call angles</div>

          <textarea
            className={s.oracleTextarea}
            placeholder="Paste LinkedIn work history here — copy directly from LinkedIn or Sales Navigator profile..."
            value={linkedinText}
            onChange={e => setLinkedinText(e.target.value)}
          />

          <button
            className={s.oracleAnalyseBtn}
            onClick={() => void analyse()}
            disabled={analysing || !linkedinText.trim()}
          >
            {analysing ? 'Analysing work history…' : 'Analyse'}
          </button>
          {error && <p className={s.athenaErrorMsg}>{error}</p>}
        </div>

        {/* ── Section 2: Results ──────────────────────────────────────────── */}
        {analysis && (
          <>
            <div className={s.oracleResultsGrid}>

              {/* Panel 1 — Prospect Overview */}
              <div className={s.oraclePanel}>
                <span className={s.fpSectionLabel}>Prospect Overview</span>
                <div className={s.oracleOverviewName}>{analysis.prospect.name ?? 'Unknown prospect'}</div>
                <div className={s.oracleRow}><span>Role</span><span>{analysis.prospect.current_role || '—'}</span></div>
                <div className={s.oracleRow}><span>Employer</span><span>{analysis.prospect.current_employer || '—'}</span></div>
                <div className={s.oracleRow}><span>Location</span><span>{analysis.prospect.current_location || '—'}</span></div>
                <div className={s.oracleRow}><span>Nationality (est.)</span><span>{analysis.prospect.nationality_estimate ?? '—'}</span></div>
                <div className={s.oracleRow}><span>Years in Switzerland</span><span>{analysis.prospect.years_in_switzerland ?? '—'}</span></div>
              </div>

              {/* Panel 2 — Pension Summary */}
              <div className={s.oraclePanel}>
                <span className={s.fpSectionLabel}>Pension Summary</span>

                <div className={s.oraclePensionBlock}>
                  <span className={s.oraclePensionBlockLabel}>UK Pensions</span>
                  <div className={s.oraclePensionRange}>
                    £{fmtMoney(analysis.pension_summary.uk_pensions.total_low)} — £{fmtMoney(analysis.pension_summary.uk_pensions.total_high)} estimated
                  </div>
                  <div className={s.oraclePensionMeta}>{analysis.pension_summary.uk_pensions.count} pension pot{analysis.pension_summary.uk_pensions.count !== 1 ? 's' : ''} identified</div>
                  {analysis.pension_summary.uk_pensions.includes_db && (
                    <div className={s.oracleDbFlag}>⚑ DB pension{analysis.pension_summary.uk_pensions.db_details ? ` — ${analysis.pension_summary.uk_pensions.db_details}` : ''}</div>
                  )}
                  <div className={s.oraclePensionMeta}>State pension: {analysis.pension_summary.uk_pensions.state_pension_status}</div>
                  <div className={s.oraclePensionMeta}>ISA: {analysis.pension_summary.uk_pensions.isa_likely ? 'likely' : 'unlikely'}</div>
                </div>

                <div className={s.oraclePensionBlock}>
                  <span className={s.oraclePensionBlockLabel}>Swiss Pillar 2</span>
                  <div className={s.oraclePensionRange}>
                    CHF {fmtMoney(analysis.pension_summary.swiss_pensions.vested_benefits_low)} — CHF {fmtMoney(analysis.pension_summary.swiss_pensions.vested_benefits_high)} estimated
                  </div>
                  <div className={s.oraclePensionMeta}>{analysis.pension_summary.swiss_pensions.pillar_2_employers} vested benefits account{analysis.pension_summary.swiss_pensions.pillar_2_employers !== 1 ? 's' : ''}</div>
                  <div className={s.oraclePensionMeta}>Currently building: {analysis.pension_summary.swiss_pensions.current_pillar_2_building ? 'yes' : 'no'}</div>
                  <div className={s.oraclePensionMeta}>Earning: ~0.02% in cash (unless invested)</div>
                </div>

                {analysis.pension_summary.other_pensions.length > 0 && (
                  <div className={s.oraclePensionBlock}>
                    <span className={s.oraclePensionBlockLabel}>Other</span>
                    {analysis.pension_summary.other_pensions.map((o, i) => (
                      <div key={i} className={s.oraclePensionMeta}>{o.country}: {o.type} — {o.estimated_value}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* Panel 3 — Key Flags */}
              <div className={s.oraclePanel}>
                <span className={s.fpSectionLabel}>Key Flags</span>
                {analysis.key_flags.length === 0 && <p className={s.oracleEmptyNote}>No flags raised.</p>}
                <div className={s.oracleFlagList}>
                  {analysis.key_flags.map((f, i) => (
                    <details key={i} className={`${s.oracleFlagChip} ${s[SEVERITY_CLASS[f.severity]] ?? ''}`}>
                      <summary>{f.flag}</summary>
                      <p className={s.oracleFlagDetail}>{f.detail}</p>
                    </details>
                  ))}
                </div>
              </div>

              {/* Panel 4 — Call Angles + HERMES */}
              <div className={s.oraclePanel}>
                <span className={s.fpSectionLabel}>Call Angles</span>

                {analysis.hermes_scenario && (
                  <>
                    <span className={s.oraclePensionBlockLabel}>Recommended Scenario</span>
                    <button className={s.oracleScenarioBtn} onClick={() => openHermes(analysis.hermes_scenario)}>
                      {analysis.hermes_scenario} →
                    </button>
                  </>
                )}

                <span className={s.oraclePensionBlockLabel} style={{ marginTop: 10, display: 'block' }}>Suggested Opener</span>
                <div className={s.oracleOpenerBox}>
                  <span>&ldquo;{analysis.opening_line_suggestion}&rdquo;</span>
                  <button
                    className={s.oracleCopyBtn}
                    onClick={() => {
                      void navigator.clipboard.writeText(analysis.opening_line_suggestion).then(() => {
                        setOpenerCopied(true)
                        setTimeout(() => setOpenerCopied(false), 2000)
                      })
                    }}
                  >
                    {openerCopied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>

                <span className={s.oraclePensionBlockLabel} style={{ marginTop: 10, display: 'block' }}>Conversation Angles</span>
                <ul className={s.oracleAngleList}>
                  {analysis.conversation_angles.map((a, i) => <li key={i}>{a}</li>)}
                </ul>

                <span className={s.oraclePensionBlockLabel} style={{ marginTop: 10, display: 'block' }}>Fact Find Priorities</span>
                <ul className={s.oracleAngleList}>
                  {analysis.fact_find_priorities.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            </div>

            {/* Work History Breakdown */}
            <div className={s.oracleWorkHistorySection}>
              <span className={s.fpSectionLabel}>Work History Breakdown</span>
              <div className={s.oracleTable}>
                <div className={s.oracleTableHead}>
                  <span>Employer</span><span>Role</span><span>Location</span><span>Years</span><span>Pension Type</span><span>Estimated Value</span>
                </div>
                {analysis.work_history.map((w, i) => (
                  <div key={i} className={s.oracleTableRowWrap}>
                    <button className={s.oracleTableRow} onClick={() => setExpandedRow(expandedRow === i ? null : i)}>
                      <span>{w.employer}</span>
                      <span>{w.role}</span>
                      <span>{w.location}</span>
                      <span>{w.years}</span>
                      <span>{w.pension_type}</span>
                      <span>{w.pension_estimate.currency} {fmtMoney(w.pension_estimate.low)}–{fmtMoney(w.pension_estimate.high)}</span>
                    </button>
                    {expandedRow === i && (
                      <div className={s.oracleTableExpand}>
                        <div><strong>Salary estimate:</strong> {w.salary_range_estimate}</div>
                        <div><strong>Dates:</strong> {w.date_from} – {w.date_to}</div>
                        <div><strong>Notes:</strong> {w.pension_estimate.notes}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <p className={s.oracleFiledMsg}>✓ Filed to MUSE — search &lsquo;{result?.museDisplayName}&rsquo; to find this analysis</p>
            <p className={s.oracleDisclaimer}>{analysis.disclaimer}</p>
          </>
        )}

        {/* ── Section 3: Recent Analyses ──────────────────────────────────── */}
        <div className={s.oracleRecentSection}>
          <span className={s.fpSectionLabel}>Recent Analyses</span>
          {recent.length === 0 && <p className={s.oracleEmptyNote}>No analyses yet — paste a work history above to get started.</p>}
          <div className={s.oracleRecentGrid}>
            {recent.slice(0, 10).map(r => {
              let parsed: OracleAnalysis | null = null
              try { parsed = JSON.parse(r.analysis_json) as OracleAnalysis } catch { /* ignore */ }
              const flag = parsed ? topFlag(parsed.key_flags) : null
              const uk = parsed?.pension_summary.uk_pensions
              const ch = parsed?.pension_summary.swiss_pensions
              return (
                <button key={r.id} className={s.oracleRecentCard} onClick={() => void loadAnalysis(r.id)}>
                  <div className={s.oracleRecentName}>{r.prospect_name ?? 'Unknown prospect'}</div>
                  <div className={s.oracleRecentMeta}>{r.current_employer ?? '—'}</div>
                  <div className={s.oracleRecentMeta}>{new Date(r.created_at * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  {uk && ch && (
                    <div className={s.oracleRecentMeta}>
                      UK £{fmtMoney(uk.total_low)}–{fmtMoney(uk.total_high)} · CH CHF {fmtMoney(ch.vested_benefits_low)}–{fmtMoney(ch.vested_benefits_high)}
                    </div>
                  )}
                  {flag && (
                    <span className={`${s.oracleFlagChip} ${s[SEVERITY_CLASS[flag.severity]] ?? ''}`} style={{ marginTop: 6 }}>
                      {flag.flag}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
