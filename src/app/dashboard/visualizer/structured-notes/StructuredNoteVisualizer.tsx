'use client'

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import s from '../../dashboard.module.css'
import { calculateNote, periodsPerYearFor, type NoteParams, type ObservationResult } from '@/lib/structured-note-calc'

// ── Types ────────────────────────────────────────────────────────────────────

type ObservationFrequency = 'quarterly' | 'semi-annual' | 'annual'

interface FormState {
  underlyingAsset: string
  autocallBarrier: number
  couponBarrier: number
  capitalProtection: number
  couponRate: number
  termYears: number
  observationFrequency: ObservationFrequency
  investmentAmount: number
  worstOf: boolean
}

const DEFAULT_FORM: FormState = {
  underlyingAsset: 'EURO STOXX 50',
  autocallBarrier: 100,
  couponBarrier: 70,
  capitalProtection: 60,
  couponRate: 10,
  termYears: 6,
  observationFrequency: 'quarterly',
  investmentAmount: 100000,
  worstOf: false,
}

interface SavedNote {
  id: string
  name: string
  underlying_asset: string
  autocall_barrier: number
  coupon_barrier: number
  capital_protection: number
  coupon_rate: number
  term_years: number
  observation_frequency: string
  investment_amount: number
  created_at: number
}

type ParsedField =
  | 'underlyingAsset' | 'autocallBarrier' | 'couponBarrier' | 'capitalProtection'
  | 'couponRate' | 'termYears' | 'observationFrequency'

const PARSED_FIELDS: ParsedField[] = [
  'underlyingAsset', 'autocallBarrier', 'couponBarrier', 'capitalProtection',
  'couponRate', 'termYears', 'observationFrequency',
]

const FIELD_LABELS: Record<ParsedField, string> = {
  underlyingAsset: 'Underlying Asset',
  autocallBarrier: 'Autocall Barrier',
  couponBarrier: 'Coupon Barrier',
  capitalProtection: 'Capital Protection',
  couponRate: 'Coupon Rate',
  termYears: 'Term',
  observationFrequency: 'Observation Frequency',
}

// ── PDF extraction (same pattern as MUSE's brain-dump PDF drop) ───────────────

async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdfjsLib = await import('pdfjs-dist')
  // cdnjs only publishes the ESM worker (.mjs) for pdf.js 4+ — .min.js 404s.
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(pageText)
  }
  return pages.join('\n\n').trim()
}

function parseFactSheet(text: string): Partial<Record<ParsedField, string | number>> {
  const params: Partial<Record<ParsedField, string | number>> = {}
  // Fact sheets wrap text across lines and pad with runs of spaces from column
  // layouts — collapse both before matching so patterns don't need to account
  // for arbitrary whitespace.
  const t = text.replace(/\n/g, ' ').replace(/\s+/g, ' ')

  // Autocall trigger/barrier
  const autocall = t.match(/autocall\s+trigger[:\s]+(\d+(?:\.\d+)?)\s*%/i)
    || t.match(/autocall[^\d]*(\d+(?:\.\d+)?)\s*%/i)
  if (autocall) params.autocallBarrier = parseFloat(autocall[1])

  // Coupon barrier/hurdle
  const couponHurdle = t.match(/coupon\s+hurdle[:\s]+(\d+(?:\.\d+)?)\s*%/i)
    || t.match(/coupon\s+barrier[:\s]+(\d+(?:\.\d+)?)\s*%/i)
    || t.match(/(\d+(?:\.\d+)?)\s*%\s+on\s+(?:least|all)/i)
  if (couponHurdle) params.couponBarrier = parseFloat(couponHurdle[1])

  // Capital protection
  const protection = t.match(/capital\s+protection\s+barrier[:\s]+(\d+(?:\.\d+)?)\s*%/i)
    || t.match(/capital\s+protection[^\d]*(\d+(?:\.\d+)?)\s*%/i)
    || t.match(/(\d+(?:\.\d+)?)\s*%\s+european\s+barrier/i)
  if (protection) params.capitalProtection = parseFloat(protection[1])

  // Coupon rate — dual-currency fact sheets (USD/GBP) list a rate per currency;
  // this app is GBP-only (£ throughout), so prefer the figure tagged GBP over
  // a bare first-match, which would silently grab the USD leg instead.
  const gbpAnnual = t.match(/gbp[:\s]*\d+(?:\.\d+)?\s*%\s*per\s+quarter\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*p\.?a\.?\)/i)
  const gbpQuarterly = t.match(/gbp[:\s]*(\d+(?:\.\d+)?)\s*%\s*per\s+quarter/i)
  const annualRate = gbpAnnual || t.match(/(\d+(?:\.\d+)?)\s*%\s*p\.?a\.?/i)
  const quarterlyRate = gbpQuarterly || t.match(/(\d+(?:\.\d+)?)\s*%\s*per\s+quarter/i)
  if (annualRate) {
    params.couponRate = parseFloat(annualRate[1])
  } else if (quarterlyRate) {
    params.couponRate = parseFloat(quarterlyRate[1]) * 4
  }

  // Term
  const term = t.match(/term[:\s]+(\d+)\s*year/i)
    || t.match(/(\d+)[- ]?year\s+(?:term|note|product)/i)
    || t.match(/(\d+)[- ]?year/i)
  if (term) params.termYears = parseInt(term[1], 10)

  // Observation frequency
  if (/quarterly/i.test(t)) params.observationFrequency = 'quarterly'
  else if (/semi.?annual|half.?year/i.test(t)) params.observationFrequency = 'semi-annual'
  else if (/annual/i.test(t)) params.observationFrequency = 'annual'

  // Underlying asset — grab the index names present, rather than a single
  // free-text capture, since basket notes list several underlyings.
  const indices: string[] = []
  if (/nikkei/i.test(t)) indices.push('Nikkei 225')
  if (/euro\s*stoxx\s*50/i.test(t)) indices.push('Euro Stoxx 50')
  if (/nasdaq\s*100/i.test(t)) indices.push('Nasdaq 100')
  if (/s&p\s*500/i.test(t)) indices.push('S&P 500')
  if (/ftse\s*100/i.test(t)) indices.push('FTSE 100')
  if (/dax/i.test(t)) indices.push('DAX')
  if (indices.length > 0) {
    params.underlyingAsset = indices.join(', ')
  } else {
    const underlying = t.match(/(?:underlying|linked to|index)[:\s]+([A-Z][^\n,]+)/i)
    if (underlying) params.underlyingAsset = underlying[1].trim()
  }

  return params
}

// Worst-of basket notes key their payoff off the least-performing underlying.
// Real fact sheets rarely use the literal phrase "worst-of" — they say "least
// performing index/underlying" instead — so match both.
function detectWorstOf(text: string): boolean {
  const t = text.replace(/\n/g, ' ').replace(/\s+/g, ' ')
  return /worst[\s-]?of/i.test(t) || /least\s+performing/i.test(t)
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function fmtGBP(n: number): string {
  return `£${Math.round(n).toLocaleString('en-GB')}`
}
function fmtPct(n: number, dp = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%`
}
function obsLabel(o: ObservationResult, freq: ObservationFrequency): string {
  if (freq === 'annual') return `Year ${o.year}`
  const unit = freq === 'semi-annual' ? 'H' : 'Q'
  return `${unit}${o.quarter}, Year ${o.year}`
}

interface CellInfo { icon: string; cls: string; amount: string }

function cellInfo(o: ObservationResult | null, investmentAmount: number): CellInfo {
  if (!o) return { icon: '', cls: '', amount: '' }
  if (o.afterAutocall) return { icon: '—', cls: s.vizCellAfter, amount: '' }
  if (o.autocalled) return { icon: '🏁', cls: s.vizCellAutocall, amount: fmtPct(o.couponAmount / investmentAmount * 100) }
  if (o.memoryPaid) return { icon: '⭐', cls: s.vizCellMemoryPaid, amount: fmtPct(o.couponAmount / investmentAmount * 100) }
  if (o.couponPaid) return { icon: '✅', cls: s.vizCellPaid, amount: fmtPct(o.couponAmount / investmentAmount * 100) }
  if (o.couponMissed) return { icon: '🔄', cls: s.vizCellMemory, amount: fmtPct(o.memoryAmount) }
  return { icon: '', cls: '', amount: '' }
}

// ── Chart dot renderer ──────────────────────────────────────────────────────

interface DotProps {
  cx?: number
  cy?: number
  index?: number
  payload?: ObservationResult
}

function renderObservationDot(props: DotProps) {
  const { cx, cy, index, payload } = props
  if (cx == null || cy == null || !payload) return <g key={`dot-${index}`} />
  let fill = '#8AA9F0'
  let r = 4
  let opacity = 1
  if (payload.afterAutocall) { fill = '#555E6B'; r = 3; opacity = 0.4 }
  else if (payload.autocalled) { fill = '#5BC08A'; r = 5.5 }
  else if (payload.memoryPaid) { fill = '#B87FD4'; r = 5 }
  else if (payload.couponPaid) { fill = '#8AA9F0'; r = 4 }
  else if (payload.couponMissed) { fill = '#E0B341'; r = 4 }
  return <circle key={`dot-${index}`} cx={cx} cy={cy} r={r} fill={fill} fillOpacity={opacity} stroke="#0D1014" strokeWidth={1} />
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StructuredNoteVisualizer() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [performance, setPerformance] = useState(0)

  const [dropActive, setDropActive] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseErr, setParseErr] = useState<string | null>(null)
  const [extractedFields, setExtractedFields] = useState<ParsedField[]>([])

  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([])
  const [notesLoading, setNotesLoading] = useState(true)
  const [saveFormOpen, setSaveFormOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)

  const loadNotes = useCallback(async () => {
    setNotesLoading(true)
    try {
      const res = await fetch('/api/dashboard/visualizer/notes')
      const data = await res.json() as { notes?: SavedNote[] }
      setSavedNotes(data.notes ?? [])
    } catch (err) {
      console.error('[visualizer] load notes error', err)
    } finally {
      setNotesLoading(false)
    }
  }, [])

  useEffect(() => { loadNotes() }, [loadNotes])

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDropActive(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      setParseErr('Only PDF files are supported')
      return
    }
    setParsing(true)
    setParseErr(null)
    try {
      const text = await extractPdfText(file)
      const parsed = parseFactSheet(text)
      const found = Object.keys(parsed) as ParsedField[]
      setExtractedFields(found)
      setForm(f => ({
        ...f,
        ...(parsed.underlyingAsset !== undefined ? { underlyingAsset: String(parsed.underlyingAsset) } : {}),
        ...(parsed.autocallBarrier !== undefined ? { autocallBarrier: Number(parsed.autocallBarrier) } : {}),
        ...(parsed.couponBarrier !== undefined ? { couponBarrier: Number(parsed.couponBarrier) } : {}),
        ...(parsed.capitalProtection !== undefined ? { capitalProtection: Number(parsed.capitalProtection) } : {}),
        ...(parsed.couponRate !== undefined ? { couponRate: Number(parsed.couponRate) } : {}),
        ...(parsed.termYears !== undefined ? { termYears: Number(parsed.termYears) } : {}),
        ...(parsed.observationFrequency !== undefined ? { observationFrequency: parsed.observationFrequency as ObservationFrequency } : {}),
        worstOf: detectWorstOf(text),
      }))
    } catch (err) {
      console.error('[visualizer] PDF parse error', err)
      setParseErr('Could not read that PDF')
    } finally {
      setParsing(false)
    }
  }

  const noteParams: NoteParams = {
    autocallBarrier: form.autocallBarrier,
    couponBarrier: form.couponBarrier,
    capitalProtection: form.capitalProtection,
    couponRate: form.couponRate,
    termYears: form.termYears,
    observationFrequency: form.observationFrequency,
    investmentAmount: form.investmentAmount,
    indexPerformance: performance,
    worstOf: form.worstOf,
  }

  const result = useMemo(() => calculateNote(noteParams), [
    form.autocallBarrier, form.couponBarrier, form.capitalProtection, form.couponRate,
    form.termYears, form.observationFrequency, form.investmentAmount, performance,
  ])

  const chartData = result.observations
  const periodsPerYear = periodsPerYearFor(form.observationFrequency)

  const grid: (ObservationResult | null)[][] = Array.from({ length: periodsPerYear }, () => Array(form.termYears).fill(null))
  result.observations.forEach(o => {
    if (grid[o.quarter - 1]) grid[o.quarter - 1][o.year - 1] = o
  })
  const rowLabels = form.observationFrequency === 'quarterly'
    ? ['Q1', 'Q2', 'Q3', 'Q4']
    : form.observationFrequency === 'semi-annual'
    ? ['H1', 'H2']
    : ['Y']

  async function handleSave() {
    if (!saveName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/dashboard/visualizer/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveName.trim(),
          underlyingAsset: form.underlyingAsset,
          autocallBarrier: form.autocallBarrier,
          couponBarrier: form.couponBarrier,
          capitalProtection: form.capitalProtection,
          couponRate: form.couponRate,
          termYears: form.termYears,
          observationFrequency: form.observationFrequency,
          investmentAmount: form.investmentAmount,
        }),
      })
      if (!res.ok) throw new Error(`save ${res.status}`)
      setSaveName('')
      setSaveFormOpen(false)
      await loadNotes()
    } catch (err) {
      console.error('[visualizer] save note error', err)
    } finally {
      setSaving(false)
    }
  }

  function handleLoad(note: SavedNote) {
    setForm({
      underlyingAsset: note.underlying_asset,
      autocallBarrier: note.autocall_barrier,
      couponBarrier: note.coupon_barrier,
      capitalProtection: note.capital_protection,
      couponRate: note.coupon_rate,
      termYears: note.term_years,
      observationFrequency: note.observation_frequency as ObservationFrequency,
      investmentAmount: note.investment_amount,
      worstOf: false,
    })
    setPerformance(0)
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/dashboard/visualizer/notes/${id}`, { method: 'DELETE' })
      setSavedNotes(notes => notes.filter(n => n.id !== id))
    } catch (err) {
      console.error('[visualizer] delete note error', err)
    }
  }

  const notExtracted = PARSED_FIELDS.filter(f => !extractedFields.includes(f))

  // ── Returns summary derivation ────────────────────────────────────────────
  const couponPaymentsCount = result.observations.filter(o => o.couponPaid).length
  const memoryPaymentsCount = result.observations.filter(o => o.memoryPaid).length
  const capitalPct = (result.capitalReturned / form.investmentAmount) * 100

  let summaryKind: 'autocalled' | 'capital-at-risk' | 'maturity' = 'maturity'
  if (result.autocalled) summaryKind = 'autocalled'
  else if (result.capitalLost > 0) summaryKind = 'capital-at-risk'

  const autocallObs = result.observations.find(o => o.autocalled)

  return (
    <div className={s.vizPage}>
      <button className={s.agentPageBack} onClick={() => router.push('/dashboard/visualizer')}>← Product Visualizer</button>

      <div className={s.vizPageHead}>
        <div className={s.drawerBadge}>SN</div>
        <div>
          <div className={s.drawerName}>Structured Notes</div>
          <div className={s.drawerRole}>Autocall barriers, memory coupons, capital protection</div>
        </div>
      </div>

      {/* Section 1 — Product Summary */}
      <div className={s.vizIntroCard}>
        <div className={s.vizIntroTitle}>Structured Notes</div>
        <p className={s.vizIntroText}>
          A structured note is a defined-outcome investment linked to a market index. It pays a coupon
          if the index stays above the coupon barrier at each observation date, with a memory function
          that accumulates missed coupons. If the index hits the autocall barrier, the note pays out
          early. Capital is protected down to the protection level — below that, you receive back a
          proportion of your investment matching the index fall.
        </p>
      </div>

      {/* Section 2 — Parameters */}
      <div className={s.vizParamsPanel}>
        <div
          className={[s.vizDropzone, dropActive ? s.vizDropzoneActive : ''].join(' ')}
          onDragOver={e => { e.preventDefault(); setDropActive(true) }}
          onDragLeave={() => setDropActive(false)}
          onDrop={handleDrop}
        >
          <div className={s.vizDropzoneText}>
            {parsing ? 'Reading PDF…' : 'Drop a structured note fact sheet (PDF) to auto-fill parameters'}
          </div>
          <div className={s.vizDropzoneSub}>.pdf only</div>
          {parseErr && <div className={s.vizDropzoneSub} style={{ color: 'var(--alert)', marginTop: 8 }}>{parseErr}</div>}
          {extractedFields.length > 0 && (
            <div className={s.vizDropzoneInfo}>
              <div className={s.vizDropzoneExtracted}>Extracted: {extractedFields.map(f => FIELD_LABELS[f]).join(', ')}</div>
              {notExtracted.length > 0 && (
                <div className={s.vizDropzoneMissing}>Could not extract: {notExtracted.map(f => FIELD_LABELS[f]).join(', ')}</div>
              )}
            </div>
          )}
        </div>

        <div className={s.vizFieldsCol}>
          <div className={s.vizField}>
            <span className={s.vizFieldLabel}>Underlying Asset</span>
            <div className={s.vizFieldInputRow}>
              <input className={s.vizFieldInput} type="text" value={form.underlyingAsset}
                onChange={e => updateField('underlyingAsset', e.target.value)} />
            </div>
          </div>
          <div className={s.vizField}>
            <span className={s.vizFieldLabel}>Autocall Barrier</span>
            <div className={s.vizFieldInputRow}>
              <input className={s.vizFieldInput} type="number" value={form.autocallBarrier}
                onChange={e => updateField('autocallBarrier', Number(e.target.value))} />
              <span className={s.vizFieldUnit}>%</span>
            </div>
          </div>
          <div className={s.vizField}>
            <span className={s.vizFieldLabel}>Coupon Barrier</span>
            <div className={s.vizFieldInputRow}>
              <input className={s.vizFieldInput} type="number" value={form.couponBarrier}
                onChange={e => updateField('couponBarrier', Number(e.target.value))} />
              <span className={s.vizFieldUnit}>%</span>
            </div>
          </div>
          <div className={s.vizField}>
            <span className={s.vizFieldLabel}>Capital Protection</span>
            <div className={s.vizFieldInputRow}>
              <input className={s.vizFieldInput} type="number" value={form.capitalProtection}
                onChange={e => updateField('capitalProtection', Number(e.target.value))} />
              <span className={s.vizFieldUnit}>%</span>
            </div>
          </div>
          <div className={s.vizField}>
            <span className={s.vizFieldLabel}>Coupon Rate (p.a.)</span>
            <div className={s.vizFieldInputRow}>
              <input className={s.vizFieldInput} type="number" value={form.couponRate}
                onChange={e => updateField('couponRate', Number(e.target.value))} />
              <span className={s.vizFieldUnit}>%</span>
            </div>
          </div>
          <div className={s.vizField}>
            <span className={s.vizFieldLabel}>Term</span>
            <div className={s.vizFieldInputRow}>
              <input className={s.vizFieldInput} type="number" value={form.termYears}
                onChange={e => updateField('termYears', Math.max(1, Number(e.target.value)))} />
              <span className={s.vizFieldUnit}>years</span>
            </div>
          </div>
          <div className={s.vizField}>
            <span className={s.vizFieldLabel}>Observation Freq.</span>
            <div className={s.vizFieldInputRow}>
              <select className={s.vizFieldSelect} value={form.observationFrequency}
                onChange={e => updateField('observationFrequency', e.target.value as ObservationFrequency)}>
                <option value="quarterly">Quarterly</option>
                <option value="semi-annual">Semi-Annual</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>
          <div className={s.vizField}>
            <span className={s.vizFieldLabel}>Investment Amount</span>
            <div className={s.vizFieldInputRow}>
              <span className={s.vizFieldUnit}>£</span>
              <input className={s.vizFieldInput} type="number" value={form.investmentAmount}
                onChange={e => updateField('investmentAmount', Number(e.target.value))} />
            </div>
          </div>
        </div>
      </div>

      {form.worstOf && (
        <div className={s.vizWorstOfBanner}>
          ⚠ Worst-of basket — all indices must be above the barrier
        </div>
      )}

      {/* Asset performance slider */}
      <div className={s.vizSliderSection}>
        <div className={s.vizSliderLabel}>Underlying Asset Performance</div>
        <div className={s.vizSliderValueRow}>
          <span className={[s.vizSliderValue, performance > 0 ? s.vizSliderValuePos : performance < 0 ? s.vizSliderValueNeg : ''].join(' ')}>
            {performance > 0 ? '+' : ''}{performance}%
          </span>
          <span className={s.vizSliderSub}>Index at {100 + performance}% vs starting level</span>
        </div>
        <input
          className={s.vizSliderInput}
          type="range" min={-60} max={60} step={1}
          value={performance}
          onChange={e => setPerformance(Number(e.target.value))}
        />
      </div>

      {/* Section 3 — Graphs */}
      <div className={s.vizChartsRow}>
        <div className={s.vizChartCard}>
          <div className={s.vizChartTitle}>Note Structure</div>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 60, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="var(--hairline)" strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 9, fill: 'var(--text-dim)' }} interval="preserveStartEnd" />
              <YAxis domain={[0, 160]} tick={{ fontSize: 10, fill: 'var(--text-dim)' }} />
              <Tooltip
                contentStyle={{ background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: 'var(--text)' }}
              />
              <ReferenceLine y={form.autocallBarrier} stroke="#5BC08A" strokeDasharray="4 4"
                label={{ value: `Autocall ${form.autocallBarrier}%`, position: 'insideTopRight', fill: '#5BC08A', fontSize: 9 }} />
              <ReferenceLine y={form.couponBarrier} stroke="var(--idle)" strokeDasharray="4 4"
                label={{ value: `Coupon ${form.couponBarrier}%`, position: 'insideTopRight', fill: 'var(--idle)', fontSize: 9 }} />
              <ReferenceLine y={form.capitalProtection} stroke="var(--alert)" strokeDasharray="4 4"
                label={{ value: `Protection ${form.capitalProtection}%`, position: 'insideBottomRight', fill: 'var(--alert)', fontSize: 9 }} />
              {result.autocalled && result.autocallPeriod && (
                <ReferenceLine x={result.autocallPeriod} stroke="#5BC08A" strokeWidth={1.5}
                  label={{ value: 'Autocalled', position: 'top', fill: '#5BC08A', fontSize: 10 }} />
              )}
              <Line type="linear" dataKey="indexLevel" stroke="var(--accent)" strokeWidth={2}
                dot={renderObservationDot} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className={s.vizChartCard}>
          <div className={s.vizChartTitle}>Returns Breakdown</div>
          <div className={s.vizGridWrap}>
            <div className={s.vizGrid} style={{ gridTemplateColumns: `32px repeat(${form.termYears}, 44px)` }}>
              <div className={s.vizGridCorner} />
              {Array.from({ length: form.termYears }, (_, i) => (
                <div key={`col-${i}`} className={s.vizGridColHeader}>Y{i + 1}</div>
              ))}
              {rowLabels.map((rowLabel, rIdx) => (
                <Fragment key={rowLabel}>
                  <div className={s.vizGridRowLabel}>{rowLabel}</div>
                  {Array.from({ length: form.termYears }, (_, cIdx) => {
                    const obs = grid[rIdx]?.[cIdx] ?? null
                    const cell = cellInfo(obs, form.investmentAmount)
                    return (
                      <div key={`cell-${rIdx}-${cIdx}`} className={[s.vizCell, cell.cls].join(' ')}>
                        {cell.icon && <span className={s.vizCellIcon}>{cell.icon}</span>}
                        {cell.amount && <span className={s.vizCellAmount}>{cell.amount}</span>}
                      </div>
                    )
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Section 4 — Returns Summary */}
      <div className={s.vizSummaryCard}>
        {summaryKind === 'autocalled' && autocallObs && (
          <>
            <div className={[s.vizSummaryHead, s.vizSummaryHeadPositive].join(' ')}>
              🏁 Autocalled — {obsLabel(autocallObs, form.observationFrequency)}
            </div>
            <div className={s.vizSummaryRow}><span>Investment</span><span>{fmtGBP(form.investmentAmount)}</span></div>
            <div className={s.vizSummaryRow}><span>Capital returned</span><span>{fmtGBP(result.capitalReturned)} (100%)</span></div>
            <div className={s.vizSummaryRow}>
              <span>Coupons paid</span>
              <span>{fmtGBP(result.totalCouponsPaid)} ({couponPaymentsCount} payment{couponPaymentsCount !== 1 ? 's' : ''} × {(form.couponRate / periodsPerYear).toFixed(2)}%)</span>
            </div>
            {result.totalMemoryPaid > 0 && (
              <div className={s.vizSummaryRow}><span>Memory payments</span><span>{fmtGBP(result.totalMemoryPaid)}</span></div>
            )}
            <hr className={s.vizSummaryDivider} />
            <div className={s.vizSummaryRow}><span>Total returned</span><span>{fmtGBP(result.totalReturned)}</span></div>
            <div className={[s.vizSummaryTotal, s.vizSummaryTotalPositive].join(' ')}><span>Total return</span><span>{fmtPct(result.totalReturnPct)}</span></div>
            <div className={s.vizSummaryRow}><span>Annualised return</span><span>{result.annualisedReturnPct.toFixed(2)}% p.a.</span></div>
            <div className={s.vizSummaryRow}><span>Time in note</span><span>{Math.round(result.monthsInNote)} months</span></div>
          </>
        )}

        {summaryKind === 'maturity' && (
          <>
            <div className={[s.vizSummaryHead, s.vizSummaryHeadNeutral].join(' ')}>
              📋 Maturity — Year {form.termYears}
            </div>
            <div className={s.vizSummaryRow}><span>Investment</span><span>{fmtGBP(form.investmentAmount)}</span></div>
            <div className={s.vizSummaryRow}><span>Capital returned</span><span>{fmtGBP(result.capitalReturned)} ({capitalPct.toFixed(0)}%)</span></div>
            <div className={s.vizSummaryRow}>
              <span>Total coupons paid</span>
              <span>{fmtGBP(result.totalCouponsPaid + result.totalMemoryPaid)} (incl. {memoryPaymentsCount} memory payment{memoryPaymentsCount !== 1 ? 's' : ''})</span>
            </div>
            <hr className={s.vizSummaryDivider} />
            <div className={s.vizSummaryRow}><span>Total returned</span><span>{fmtGBP(result.totalReturned)}</span></div>
            <div className={[s.vizSummaryTotal, s.vizSummaryTotalPositive].join(' ')}><span>Total return</span><span>{fmtPct(result.totalReturnPct)}</span></div>
            <div className={s.vizSummaryRow}><span>Annualised return</span><span>{result.annualisedReturnPct.toFixed(2)}% p.a.</span></div>
          </>
        )}

        {summaryKind === 'capital-at-risk' && (
          <>
            <div className={[s.vizSummaryHead, s.vizSummaryHeadNegative].join(' ')}>
              ⚠ Capital at Risk — Maturity
            </div>
            <div className={s.vizSummaryRow}><span>Investment</span><span>{fmtGBP(form.investmentAmount)}</span></div>
            <div className={s.vizSummaryRow}><span>Capital returned</span><span>{fmtGBP(result.capitalReturned)} ({capitalPct.toFixed(0)}% — index fell below protection level)</span></div>
            <div className={s.vizSummaryRow}><span>Capital lost</span><span>{fmtGBP(result.capitalLost)}</span></div>
            <div className={s.vizSummaryRow}><span>Coupons paid</span><span>{fmtGBP(result.totalCouponsPaid + result.totalMemoryPaid)}</span></div>
            <hr className={s.vizSummaryDivider} />
            <div className={s.vizSummaryRow}><span>Total returned</span><span>{fmtGBP(result.totalReturned)}</span></div>
            <div className={[s.vizSummaryTotal, s.vizSummaryTotalNegative].join(' ')}><span>Total return</span><span>{fmtPct(result.totalReturnPct)}</span></div>
          </>
        )}
      </div>

      {/* Section 5 — Saved Notes */}
      <div className={s.vizSavedSection}>
        <div className={s.vizSavedHead}>
          <span className={s.eyebrow}>Saved Notes</span>
          {saveFormOpen ? (
            <div className={s.vizSaveForm}>
              <input className={s.vizSaveFormInput} type="text" placeholder="Note name…" value={saveName}
                onChange={e => setSaveName(e.target.value)} autoFocus />
              <button className={s.vizSaveFormBtn} onClick={handleSave} disabled={saving || !saveName.trim()}>
                {saving ? 'Saving…' : 'Confirm'}
              </button>
              <button className={s.vizSaveFormCancel} onClick={() => { setSaveFormOpen(false); setSaveName('') }}>Cancel</button>
            </div>
          ) : (
            <button className={s.vizSaveBtn} onClick={() => setSaveFormOpen(true)}>Save this note</button>
          )}
        </div>

        {!notesLoading && savedNotes.length === 0 && (
          <div className={s.vizSavedEmpty}>No saved notes yet — configure a note above and save it</div>
        )}

        {savedNotes.length > 0 && (
          <div className={s.vizSavedGrid}>
            {savedNotes.map(note => (
              <div key={note.id} className={s.vizSavedCard}>
                <div className={s.vizSavedName}>{note.name}</div>
                <div className={s.vizSavedAsset}>{note.underlying_asset || '—'}</div>
                <div className={s.vizSavedParams}>
                  Autocall {note.autocall_barrier}% · Coupon {note.coupon_barrier}% · Protection {note.capital_protection}% · {note.coupon_rate}% p.a. · {note.term_years}yr
                </div>
                <div className={s.vizSavedActions}>
                  <button className={s.vizSavedBtn} onClick={() => handleLoad(note)}>Load</button>
                  <button className={[s.vizSavedBtn, s.vizSavedBtnDanger].join(' ')} onClick={() => handleDelete(note.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
