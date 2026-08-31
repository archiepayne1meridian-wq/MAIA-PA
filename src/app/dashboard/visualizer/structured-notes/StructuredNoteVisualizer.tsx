'use client'

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import s from '../../dashboard.module.css'
import {
  calculateNote, periodsPerYearFor, generatePresetPath, resizeIndexPath,
  type NoteParams, type ObservationResult, type PresetScenario,
} from '@/lib/structured-note-calc'
import ProductProfile from '@/components/atlas/ProductProfile'

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

const PRESET_LABELS: Record<PresetScenario, string> = {
  flat: 'Flat (100%)',
  'bull-run': 'Bull run — rising to ~130%',
  'bear-dip': 'Bear dip — drops to ~70%, recovers to ~95%',
  crash: 'Crash — drops to ~45%, stays low',
  volatile: 'Volatile — zigzag',
}

const PROFILE_DATA = {
  productName: 'Structured Notes',
  whatItIs: 'A structured note is a defined-outcome investment linked to one or more market indices. It is not a fund — it is a debt instrument issued by a bank (the issuer), with defined terms for how returns are calculated. The note pays a coupon if the index stays above a barrier, protects capital down to a set level, and may pay out early if the index hits the autocall trigger.',
  whatItHolds: [
    'Linked to equity indices (e.g. S&P 500, Euro Stoxx 50, Nikkei 225)',
    'May be worst-of basket (all indices must perform)',
    'Capital at risk below protection barrier',
    'Counterparty risk — issuer must not default',
  ],
  whoItsFor: [
    'Client with surplus capital seeking defined income',
    'Client uncomfortable with pure equity volatility but wanting better than cash',
    'Client with a medium-term horizon (3-6 years) who doesn’t need liquidity',
    'Client who wants to know exactly what they’ll receive under different scenarios',
    'NOT suitable for clients who need immediate access to capital',
  ],
  keyBenefits: [
    'Defined outcome — you know the rules before you invest',
    'Memory feature — missed coupons accumulate and pay later',
    'Capital protection down to the barrier (typically 60-70%)',
    'Potential for above-market income (8-12% p.a.) without taking pure equity risk',
    'Autocall — can return capital + income early if market performs well',
  ],
  gaps: [
    'Client holding cash ‘temporarily’ earning nothing — structured note offers defined income with protection',
    'Client in low-yield bonds seeking more return without full equity exposure',
    'Client who wants income but is put off by stock market volatility',
    'Client with a lump sum (inheritance, property sale, pension transfer) with no plan for it',
    'Client who thinks their money is ‘safe’ in cash but losing to inflation',
  ],
  comparisons: [
    { product: 'Cash savings', difference: 'Cash is safe from falling but loses to inflation. Structured note offers defined income with capital protection.', useWhen: 'Use structured note when client wants income and can accept defined risk' },
    { product: 'Equity funds', difference: 'Funds have unlimited upside but no protection. Structured note caps upside in exchange for downside protection.', useWhen: 'Use structured note when client wants protection floor but still wants market-linked returns' },
    { product: 'Portfolio bond', difference: 'Bond is the wrapper, note is the investment. A structured note can sit inside a portfolio bond for tax deferral.', useWhen: 'Combine both — note inside bond for income + tax efficiency' },
    { product: 'Fixed rate bonds (bank)', difference: 'Bank fixed rate is typically 4-5%. Structured notes offer 8-12% but with conditional payment and market risk.', useWhen: 'Use structured note when client wants significantly higher income and understands the conditions' },
  ],
  whenToUseVs: [
    { useThis: 'Client has lump sum, medium horizon, wants defined income with protection', useAlternative: 'Client needs guaranteed capital return or immediate liquidity', alternative: 'Cash or fixed rate deposit' },
    { useThis: 'Client wants income without full equity risk', useAlternative: 'Client wants unlimited upside and long horizon (10+ years)', alternative: 'Equity fund or portfolio bond' },
  ],
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

// ── Chart geometry (kept in sync with the ComposedChart config below) ───────
// Dragging converts mouse-pixel deltas to index-level deltas using the chart's
// known, fixed pixel dimensions — no DOM measurement needed, since every
// dimension here is one we set explicitly on the chart/axes.
const CHART_HEIGHT = 280
const CHART_MARGIN_TOP = 16
const CHART_MARGIN_BOTTOM = 8
const CHART_X_AXIS_HEIGHT = 22
const CHART_Y_MIN = 0
const CHART_Y_MAX = 180
const PLOT_PIXEL_HEIGHT = CHART_HEIGHT - CHART_MARGIN_TOP - CHART_MARGIN_BOTTOM - CHART_X_AXIS_HEIGHT
const PIXELS_PER_PERCENT = PLOT_PIXEL_HEIGHT / (CHART_Y_MAX - CHART_Y_MIN)
const PATH_MIN = 20
const PATH_MAX = 180

// ── Draggable chart dot ──────────────────────────────────────────────────────

interface DotProps {
  cx?: number
  cy?: number
  index?: number
  payload?: ObservationResult
}

function dotColor(payload: ObservationResult): string {
  if (payload.afterAutocall) return '#555E6B'
  if (payload.autocalled) return '#5BC08A'
  if (payload.memoryPaid) return '#B87FD4'
  if (payload.couponPaid) return '#8AA9F0'
  if (payload.couponMissed) return '#E0B341'
  return '#8AA9F0'
}

function renderDraggableDot(props: DotProps, onDragStart: (index: number, clientY: number) => void) {
  const { cx, cy, index, payload } = props
  if (cx == null || cy == null || !payload || index == null) return <g key={`dot-${index}`} />
  const fill = dotColor(payload)
  const opacity = payload.afterAutocall ? 0.4 : 1
  return (
    <circle
      key={`dot-${index}`}
      cx={cx} cy={cy} r={8}
      fill={fill} fillOpacity={opacity}
      stroke="#0D1014" strokeWidth={1.5}
      style={{ cursor: 'ns-resize' }}
      onMouseDown={e => { e.stopPropagation(); onDragStart(index, e.clientY) }}
      onTouchStart={e => { e.stopPropagation(); e.preventDefault(); onDragStart(index, e.touches[0].clientY) }}
    />
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StructuredNoteVisualizer() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [indexPath, setIndexPath] = useState<number[]>(() =>
    Array(periodsPerYearFor(DEFAULT_FORM.observationFrequency) * DEFAULT_FORM.termYears).fill(100))
  const [dragging, setDragging] = useState<{ index: number; startClientY: number; startValue: number } | null>(null)

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

  const totalPeriods = periodsPerYearFor(form.observationFrequency) * form.termYears

  // Keep the path aligned with term/frequency edits without discarding a drag
  // the user has already made — extend with the last value, or truncate.
  useEffect(() => {
    setIndexPath(prev => resizeIndexPath(prev, totalPeriods))
  }, [totalPeriods])

  // Drag lifecycle: mousedown/touchstart on a dot (via renderDraggableDot)
  // starts a drag; window-level listeners track movement so the drag keeps
  // working even if the pointer leaves the chart area, and end on release.
  useEffect(() => {
    if (!dragging) return
    function applyDelta(clientY: number) {
      if (!dragging) return
      const deltaPixels = clientY - dragging.startClientY
      const deltaValue = -deltaPixels / PIXELS_PER_PERCENT
      const newValue = Math.min(PATH_MAX, Math.max(PATH_MIN, Math.round(dragging.startValue + deltaValue)))
      setIndexPath(path => path.map((v, i) => (i === dragging.index ? newValue : v)))
    }
    function onMouseMove(e: MouseEvent) { applyDelta(e.clientY) }
    function onTouchMove(e: TouchEvent) { if (e.touches[0]) { e.preventDefault(); applyDelta(e.touches[0].clientY) } }
    function onEnd() { setDragging(null) }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [dragging])

  function handleDragStart(index: number, clientY: number) {
    setDragging({ index, startClientY: clientY, startValue: indexPath[index] ?? 100 })
  }

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
    indexPath,
    worstOf: form.worstOf,
  }

  const result = useMemo(() => calculateNote(noteParams), [
    form.autocallBarrier, form.couponBarrier, form.capitalProtection, form.couponRate,
    form.termYears, form.observationFrequency, form.investmentAmount, indexPath,
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
    const loadedPeriods = periodsPerYearFor(note.observation_frequency as ObservationFrequency) * note.term_years
    setIndexPath(Array(loadedPeriods).fill(100))
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
      <button className={s.agentPageBack} onClick={() => router.push('/dashboard/visualizer')}>← ATLAS</button>

      <div className={s.vizPageHead}>
        <div className={s.drawerBadge}>SN</div>
        <div>
          <div className={s.drawerName}>ATLAS — Structured Notes</div>
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

      {/* Path controls */}
      <div className={s.vizPathControls}>
        <select
          className={s.vizPresetSelect}
          value=""
          onChange={e => {
            const preset = e.target.value as PresetScenario
            if (preset) setIndexPath(generatePresetPath(preset, totalPeriods))
          }}
        >
          <option value="">Preset scenarios…</option>
          {(Object.keys(PRESET_LABELS) as PresetScenario[]).map(p => (
            <option key={p} value={p}>{PRESET_LABELS[p]}</option>
          ))}
        </select>
        <button className={s.vizResetBtn} onClick={() => setIndexPath(Array(totalPeriods).fill(100))}>
          Reset to flat
        </button>
        <span className={s.vizPathHint}>Drag any point on the chart below to set the index path</span>
      </div>

      {/* Section 3 — Graphs */}
      <div className={s.vizChartsRow}>
        <div className={s.vizChartCard}>
          <div className={s.vizChartTitle}>Note Structure</div>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ComposedChart data={chartData} margin={{ top: CHART_MARGIN_TOP, right: 60, bottom: CHART_MARGIN_BOTTOM, left: 0 }}>
              <CartesianGrid stroke="var(--hairline)" strokeDasharray="3 3" />
              <XAxis dataKey="period" height={CHART_X_AXIS_HEIGHT} tick={{ fontSize: 9, fill: 'var(--text-dim)' }} interval="preserveStartEnd" />
              <YAxis domain={[CHART_Y_MIN, CHART_Y_MAX]} width={34} tick={{ fontSize: 10, fill: 'var(--text-dim)' }} />
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
                dot={(p: DotProps) => renderDraggableDot(p, handleDragStart)} activeDot={false} isAnimationActive={false} />
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

      <ProductProfile {...PROFILE_DATA} />
    </div>
  )
}
