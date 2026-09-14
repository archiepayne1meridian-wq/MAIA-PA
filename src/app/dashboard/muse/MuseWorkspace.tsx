'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import s from '../dashboard.module.css'
import type { MuseEntryFull } from '../../../../tools/muse'

// ─── Sector definitions ───────────────────────────────────────────────────────

const SECTORS = [
  { id: 'Training',                      label: 'Training',                      color: '#5B9FE0', locked: false },
  { id: 'Products',                      label: 'Products',                      color: '#B87FD4', locked: false },
  { id: 'Regulations',                   label: 'Regulations',                   color: '#E07A5F', locked: false },
  { id: 'Sales & Prospecting',           label: 'Sales & Prospecting',           color: '#E0B341', locked: false },
  { id: 'Expat Knowledge',               label: 'Expat Knowledge',               color: '#5BC0C0', locked: false },
  { id: 'Funds & Macro',                 label: 'Funds & Macro',                 color: '#7BC99A', locked: false },
  { id: 'Client Psychology & Profiles',  label: 'Client Psychology & Profiles',  color: '#8AA9F0', locked: false },
  { id: 'Client Intelligence',           label: 'Client Intelligence',           color: '#59616D', locked: true  },
] as const

const SECTOR_COLOR: Record<string, string> = Object.fromEntries(
  SECTORS.map(sec => [sec.id, sec.color]),
)
SECTOR_COLOR['Case'] = '#C0C05B'

// Knowledge: blue · Case: green · Template: amber · News: purple
const RESULT_TYPE_COLOR: Record<string, string> = {
  knowledge: 'var(--accent)',
  case: 'var(--online)',
  template: 'var(--idle)',
  news: '#B87FD4',
}

const FILTER_CHIPS = [
  { id: 'all',       label: 'All' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'cases',     label: 'Cases' },
  { id: 'templates', label: 'Templates' },
  { id: 'news',      label: 'News' },
] as const

const ENTRY_TYPES = [
  { id: 'knowledge',        label: 'Knowledge' },
  { id: 'adviser_email',    label: 'Adviser Email' },
  { id: 'linkedin_message', label: 'LinkedIn Message' },
  { id: 'news',             label: 'News' },
  { id: 'other',            label: 'Other' },
] as const

const TEMPLATE_CATEGORIES = ['email', 'linkedin', 'follow_up', 'reference'] as const
const TEMPLATE_MEDIUMS = ['email', 'linkedin', 'whatsapp'] as const

const EVENT_TYPES = [
  { id: 'call',            label: 'Call' },
  { id: 'meeting_booked',  label: 'Meeting Booked' },
  { id: 'meeting_sat',     label: 'Meeting Sat' },
  { id: 'adviser_note',    label: 'Adviser Note' },
  { id: 'outcome',         label: 'Outcome' },
  { id: 'follow_up',       label: 'Follow Up' },
] as const

const CASE_STATUS_LABEL: Record<string, string> = {
  active: 'Active', meeting_booked: 'Meeting Booked', meeting_sat: 'Meeting Sat', closed: 'Closed',
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fmtDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function parseTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface MuseEntryLite {
  id: string
  sector: string
  title: string
  summary: string
  content: string
  entry_type: string
  privacy_tier: number
  tags: string
  linked_entries: string
  last_updated: number
  date_filed: number
}

interface MuseTemplate {
  id: string
  name: string
  category: string
  scenario: string | null
  angle: string | null
  subject: string | null
  body: string
  medium: string
  times_used: number
  last_used: number | null
  created_at: number
  updated_at: number
}

interface MuseCase {
  id: string
  display_name: string
  company: string | null
  location: string | null
  occupation: string | null
  financial_profile: string | null
  status: string
  outcome: string | null
  created_at: number
  updated_at: number
}

interface MuseCaseEvent {
  id: string
  case_id: string
  event_type: string
  date: string
  summary: string
  what_suggested: string | null
  adviser_recommendation: string | null
  worked: string | null
  apollo_call_id: string | null
  created_at: number
}

interface CaseWithEvents extends MuseCase {
  events: MuseCaseEvent[]
  linkedEntries: { id: string; title: string; sector: string }[]
}

interface MusePending {
  id: string
  source: string
  source_agent: string | null
  suggested_sector: string
  suggested_title: string
  suggested_summary: string
  suggested_content: string
  suggested_depth: string
  suggested_links: string
  status: string
  slack_ts: string | null
  created_at: number
}

interface SearchResponse {
  knowledge: (MuseEntryLite & { relevance_score: number; result_type: 'knowledge' })[]
  templates: (MuseTemplate & { result_type: 'template' })[]
  cases: (MuseCase & { result_type: 'case' })[]
}

interface HermesScenarioLite { id: string; name: string }

// ─── File / voice helpers (unchanged from prior version) ──────────────────────

type AnyWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionInstance
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechResultEvent) => void) | null
  onerror: ((e: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
}
interface SpeechResultEvent {
  results: { [i: number]: { [j: number]: { transcript: string } } }
}
interface SpeechErrorEvent {
  error: string
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  const win = window as AnyWindow
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => ('str' in item ? item.str : '')).join(' ')
    pages.push(pageText)
  }
  return pages.join('\n\n').trim()
}

// ─── Placeholder highlighting (template preview) ───────────────────────────────

const PLACEHOLDER_COLOR: Record<string, string> = {
  NAME: 'var(--accent)',
  COMPANY: 'var(--online)',
  SPECIFIC_DETAIL: 'var(--idle)',
}
const PLACEHOLDER_RE = /(\[[A-Z_]+\])/g

function renderWithPlaceholders(text: string): React.ReactNode[] {
  return text.split(PLACEHOLDER_RE).map((part, i) => {
    const match = part.match(/^\[([A-Z_]+)\]$/)
    if (!match) return <span key={i}>{part}</span>
    const key = match[1]!
    const color = PLACEHOLDER_COLOR[key] ?? 'var(--text-dim)'
    return (
      <span key={i} style={{ color, fontWeight: 600, background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '0 3px' }}>
        {part}
      </span>
    )
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MuseWorkspace() {
  const router = useRouter()
  const recogRef = useRef<SpeechRecognitionInstance | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tagsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didDeepLink = useRef(false)

  // Left panel
  const [leftSearch, setLeftSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [expandedSector, setExpandedSector] = useState<string | null>(null)
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false)

  const [allEntries, setAllEntries] = useState<MuseEntryLite[]>([])
  const [allCases, setAllCases] = useState<MuseCase[]>([])
  const [allTemplates, setAllTemplates] = useState<MuseTemplate[]>([])
  const [hermesScenarios, setHermesScenarios] = useState<HermesScenarioLite[]>([])

  // Centre panel selection
  const [selected, setSelected] = useState<{ type: 'entry' | 'case' | 'template'; id: string } | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<MuseEntryFull | null>(null)
  const [selectedCase, setSelectedCase] = useState<CaseWithEvents | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<MuseTemplate | null>(null)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)

  // Entry editing
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingContent, setEditingContent] = useState(false)
  const [contentDraft, setContentDraft] = useState('')
  const [entrySaving, setEntrySaving] = useState(false)
  const [tagInput, setTagInput] = useState('')

  // Case: add update / new case
  const [addUpdateOpen, setAddUpdateOpen] = useState(false)
  const [newCaseMode, setNewCaseMode] = useState(false)
  const [ovEventType, setOvEventType] = useState<string>('call')
  const [ovEventDate, setOvEventDate] = useState(todayStr())
  const [ovEventSummary, setOvEventSummary] = useState('')
  const [ovEventSuggested, setOvEventSuggested] = useState('')
  const [ovEventRecommendation, setOvEventRecommendation] = useState('')
  const [ovEventWorked, setOvEventWorked] = useState<string>('')
  const [ovEventSubmitting, setOvEventSubmitting] = useState(false)
  const [newCaseName, setNewCaseName] = useState('')
  const [newCaseCompany, setNewCaseCompany] = useState('')
  const [newCaseLocation, setNewCaseLocation] = useState('')
  const [newCaseOccupation, setNewCaseOccupation] = useState('')

  // Right panel tabs
  const [rightTab, setRightTab] = useState<'knowledge' | 'template' | 'pending'>('knowledge')

  // Tab 1 — Add Knowledge
  const [knowEntryType, setKnowEntryType] = useState<string>('knowledge')
  const [knowPrivacyTier, setKnowPrivacyTier] = useState<1 | 2>(1)
  const [knowSector, setKnowSector] = useState<string>(SECTORS[0].id)
  const [knowTitle, setKnowTitle] = useState('')
  const [knowContext, setKnowContext] = useState('')
  const [knowContent, setKnowContent] = useState('')
  const [knowTagsPreview, setKnowTagsPreview] = useState<string[]>([])
  const [knowSubmitting, setKnowSubmitting] = useState(false)
  const [knowMsg, setKnowMsg] = useState<{ text: string; ok: boolean; tags?: string[] } | null>(null)
  const [knowDragOver, setKnowDragOver] = useState(false)
  const [pdfExtracting, setPdfExtracting] = useState(false)
  const [micActive, setMicActive] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)

  // Tab 2 — Add Template
  const [tplName, setTplName] = useState('')
  const [tplCategory, setTplCategory] = useState<string>('email')
  const [tplMedium, setTplMedium] = useState<string>('email')
  const [tplScenario, setTplScenario] = useState<string>('')
  const [tplSubject, setTplSubject] = useState('')
  const [tplBody, setTplBody] = useState('')
  const [tplSubmitting, setTplSubmitting] = useState(false)
  const [tplMsg, setTplMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Tab 3 — Pending
  const [pendingItems, setPendingItems] = useState<MusePending[]>([])
  const [confirmLoading, setConfirmLoading] = useState<string | null>(null)
  const [refineOpenId, setRefineOpenId] = useState<string | null>(null)
  const [refineText, setRefineText] = useState('')
  const [refineLoading, setRefineLoading] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/muse')
      if (!res.ok) return
      const data = await res.json() as { entries?: MuseEntryLite[] }
      setAllEntries(data.entries ?? [])
    } catch { /* non-fatal */ }
  }, [])

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/muse/pending')
      if (!res.ok) return
      const data = await res.json() as { items?: MusePending[] }
      setPendingItems(data.items ?? [])
    } catch { /* non-fatal */ }
  }, [])

  const fetchCases = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/muse/cases')
      if (!res.ok) return
      const data = await res.json() as { cases?: MuseCase[] }
      setAllCases(data.cases ?? [])
    } catch { /* non-fatal */ }
  }, [])

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/muse/templates')
      if (!res.ok) return
      const data = await res.json() as { templates?: MuseTemplate[] }
      setAllTemplates(data.templates ?? [])
    } catch { /* non-fatal */ }
  }, [])

  const fetchHermesScenarios = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/hermes/scenarios')
      if (!res.ok) return
      const data = await res.json() as { scenarios?: HermesScenarioLite[] }
      setHermesScenarios((data.scenarios ?? []).map(sc => ({ id: sc.id, name: sc.name })))
    } catch { /* non-fatal */ }
  }, [])

  async function fetchEntry(id: string) {
    try {
      const res = await fetch(`/api/dashboard/muse/entry/${id}`)
      if (!res.ok) return
      const data = await res.json() as { entry?: MuseEntryFull }
      setSelectedEntry(data.entry ?? null)
    } catch { /* non-fatal */ }
  }

  async function fetchCase(id: string) {
    try {
      const res = await fetch(`/api/dashboard/muse/cases/${id}`)
      if (!res.ok) return
      const data = await res.json() as { case?: CaseWithEvents }
      setSelectedCase(data.case ?? null)
    } catch { /* non-fatal */ }
  }

  async function fetchTemplate(id: string) {
    const t = allTemplates.find(tp => tp.id === id) ?? null
    setSelectedTemplate(t)
  }

  useEffect(() => {
    void fetchEntries()
    void fetchPending()
    void fetchCases()
    void fetchTemplates()
    void fetchHermesScenarios()
  }, [fetchEntries, fetchPending, fetchCases, fetchTemplates, fetchHermesScenarios])

  // Deep link: ?entry=<id> opens that entry in the centre panel on first load —
  // read via window.location rather than useSearchParams() to avoid needing a
  // Suspense boundary for what's only ever a one-time initial read.
  useEffect(() => {
    if (didDeepLink.current) return
    didDeepLink.current = true
    const params = new URLSearchParams(window.location.search)
    const entryId = params.get('entry')
    if (entryId) {
      setSelected({ type: 'entry', id: entryId })
    }
  }, [])

  useEffect(() => {
    if (!selected) { setSelectedEntry(null); setSelectedCase(null); setSelectedTemplate(null); return }
    setAddUpdateOpen(false)
    setEditOpenReset()
    if (selected.type === 'entry') void fetchEntry(selected.id)
    else if (selected.type === 'case') void fetchCase(selected.id)
    else void fetchTemplate(selected.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  function setEditOpenReset() {
    setEditingTitle(false)
    setEditingContent(false)
  }

  // ─── Search (300ms debounce) ────────────────────────────────────────────────

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    const q = leftSearch.trim()
    if (!q) { setSearchResult(null); setSearching(false); return }
    setSearching(true)
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/dashboard/muse/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, privacyTier: 'all', limit: 30 }),
        })
        const data = await res.json() as SearchResponse
        setSearchResult(data)
      } catch {
        setSearchResult({ knowledge: [], templates: [], cases: [] })
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [leftSearch])

  // ─── Tags preview (400ms debounce, Tab 1) ──────────────────────────────────

  useEffect(() => {
    if (tagsDebounceRef.current) clearTimeout(tagsDebounceRef.current)
    if (!knowContent.trim()) { setKnowTagsPreview([]); return }
    tagsDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/dashboard/muse/preview-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: knowTitle, content: knowContent }),
        })
        const data = await res.json() as { tags?: string[] }
        setKnowTagsPreview(data.tags ?? [])
      } catch {
        setKnowTagsPreview([])
      }
    }, 400)
    return () => { if (tagsDebounceRef.current) clearTimeout(tagsDebounceRef.current) }
  }, [knowTitle, knowContent])

  // ─── Handlers — Tab 1: Add Knowledge ────────────────────────────────────────

  function handleKnowMic() {
    if (micActive) {
      recogRef.current?.abort()
      recogRef.current = null
      setMicActive(false)
      return
    }
    const SR = getSpeechRecognition()
    if (!SR) { setVoiceError('Voice unavailable — type instead'); return }

    setVoiceError(null)
    setMicActive(true)
    const recog = new SR()
    recog.lang = 'en-GB'
    recog.interimResults = false
    recog.maxAlternatives = 1
    recogRef.current = recog

    recog.onresult = (e) => {
      const transcript = e.results[0][0].transcript
      recogRef.current = null
      setKnowContent(prev => prev.trim() ? `${prev.trim()} ${transcript}` : transcript)
    }
    recog.onerror = (e) => {
      recogRef.current = null
      setMicActive(false)
      if (e.error === 'not-allowed') setVoiceError('Mic permission denied — type instead')
    }
    recog.onend = () => { recogRef.current = null; setMicActive(false) }
    recog.start()
  }

  async function handleKnowFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setKnowDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!/\.(pdf|txt|md)$/i.test(file.name)) {
      setKnowMsg({ text: 'Only .pdf, .txt, or .md files are supported.', ok: false })
      return
    }
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    try {
      let text: string
      if (isPdf) {
        setPdfExtracting(true)
        setKnowMsg(null)
        text = await extractPdfText(file)
        if (!text.trim()) {
          setKnowMsg({ text: `"${file.name}" has no extractable text — it may be a scanned/image-only PDF.`, ok: false })
          return
        }
      } else {
        text = await readFileAsText(file)
      }
      setKnowContent(prev => prev.trim() ? `${prev.trim()}\n\n${text}` : text)
      setKnowMsg({ text: `Loaded "${file.name}" — review and submit below.`, ok: true })
    } catch {
      setKnowMsg({ text: `Couldn't read "${file.name}".`, ok: false })
    } finally {
      setPdfExtracting(false)
    }
  }

  function removeTagPreview(tag: string) {
    setKnowTagsPreview(tags => tags.filter(t => t !== tag))
  }

  function addTagPreview() {
    const t = tagInput.trim().toLowerCase()
    if (!t) return
    setKnowTagsPreview(tags => tags.includes(t) ? tags : [...tags, t])
    setTagInput('')
  }

  async function handleKnowSubmit() {
    if (!knowContent.trim() || !knowSector) return
    setKnowSubmitting(true)
    setKnowMsg(null)
    try {
      const res = await fetch('/api/dashboard/muse/file-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: knowContent.trim(),
          sector: knowSector,
          title: knowTitle.trim() || undefined,
          context: knowContext.trim() || undefined,
          entryType: knowEntryType,
          privacyTier: knowPrivacyTier,
          tags: knowTagsPreview,
        }),
      })
      const data = await res.json() as { id?: string; title?: string; sector?: string; tags?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Filing failed')
      setKnowMsg({ text: `Filed to ${data.sector} ✓ — "${data.title}"`, ok: true, tags: data.tags })
      setKnowTitle('')
      setKnowContext('')
      setKnowContent('')
      setKnowTagsPreview([])
      await fetchEntries()
    } catch (err) {
      setKnowMsg({ text: err instanceof Error ? err.message : 'Filing failed', ok: false })
    } finally {
      setKnowSubmitting(false)
    }
  }

  // ─── Handlers — Tab 2: Add Template ─────────────────────────────────────────

  async function handleTemplateSubmit() {
    if (!tplName.trim() || !tplBody.trim()) return
    setTplSubmitting(true)
    setTplMsg(null)
    try {
      const res = await fetch('/api/dashboard/muse/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tplName.trim(),
          category: tplCategory,
          medium: tplMedium,
          scenario: tplScenario || null,
          subject: tplCategory === 'email' ? tplSubject.trim() || null : null,
          body: tplBody,
        }),
      })
      const data = await res.json() as { id?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setTplMsg({ text: 'Template saved ✓', ok: true })
      setTplName(''); setTplSubject(''); setTplBody(''); setTplScenario('')
      await fetchTemplates()
    } catch (err) {
      setTplMsg({ text: err instanceof Error ? err.message : 'Save failed', ok: false })
    } finally {
      setTplSubmitting(false)
    }
  }

  // ─── Handlers — approvals (Tab 3) ───────────────────────────────────────────

  async function handleConfirm(pendingId: string, decision: 'keep' | 'discard') {
    setConfirmLoading(pendingId)
    try {
      const res = await fetch('/api/dashboard/muse/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingId, decision }),
      })
      if (!res.ok) throw new Error('Confirm failed')
      await fetchPending()
      if (decision === 'keep') await fetchEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirm failed')
    } finally {
      setConfirmLoading(null)
    }
  }

  function toggleRefine(pendingId: string) {
    if (refineOpenId === pendingId) { setRefineOpenId(null); setRefineText('') }
    else { setRefineOpenId(pendingId); setRefineText('') }
  }

  async function handleRefineSubmit(pendingId: string) {
    if (!refineText.trim()) return
    setRefineLoading(pendingId)
    try {
      const res = await fetch('/api/dashboard/muse/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingId, instruction: refineText.trim() }),
      })
      if (!res.ok) throw new Error('Refine failed')
      await fetchPending()
      setRefineOpenId(null)
      setRefineText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refine failed')
    } finally {
      setRefineLoading(null)
    }
  }

  // ─── Handlers — entry overlay: title/content edit, tags, links ─────────────

  async function saveEntryPatch(patch: { title?: string; content?: string }) {
    if (!selectedEntry) return
    setEntrySaving(true)
    try {
      const res = await fetch(`/api/dashboard/muse/entry/${selectedEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('Save failed')
      const data = await res.json() as { entry?: MuseEntryFull }
      setSelectedEntry(data.entry ?? null)
      await fetchEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setEntrySaving(false)
    }
  }

  function openTitleEdit() {
    if (!selectedEntry) return
    setEditingTitle(true)
  }

  function openContentEdit() {
    if (!selectedEntry) return
    setContentDraft(selectedEntry.content)
    setEditingContent(true)
  }

  function navigateToEntry(id: string) {
    setSelected({ type: 'entry', id })
  }

  // ─── Handlers — case: add update / new case ────────────────────────────────

  function resetOverlayEventForm() {
    setOvEventType('call'); setOvEventDate(todayStr()); setOvEventSummary('')
    setOvEventSuggested(''); setOvEventRecommendation(''); setOvEventWorked('')
  }

  async function submitOverlayUpdate() {
    if (!selectedCase || !ovEventSummary.trim()) return
    setOvEventSubmitting(true)
    try {
      const res = await fetch(`/api/dashboard/muse/cases/${selectedCase.id}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: ovEventType,
          date: ovEventDate,
          summary: ovEventSummary.trim(),
          what_suggested: ovEventSuggested.trim() || undefined,
          adviser_recommendation: ovEventRecommendation.trim() || undefined,
          worked: ovEventWorked || undefined,
        }),
      })
      if (!res.ok) throw new Error('Update failed')
      const data = await res.json() as { case?: CaseWithEvents }
      setSelectedCase(data.case ?? null)
      setAddUpdateOpen(false)
      resetOverlayEventForm()
      await fetchCases()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setOvEventSubmitting(false)
    }
  }

  function resetNewCaseForm() {
    setNewCaseMode(false)
    setNewCaseName(''); setNewCaseCompany(''); setNewCaseLocation(''); setNewCaseOccupation('')
    resetOverlayEventForm()
  }

  async function submitNewCase() {
    if (!newCaseName.trim() || !ovEventSummary.trim()) return
    setOvEventSubmitting(true)
    try {
      const res = await fetch('/api/dashboard/muse/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: newCaseName.trim(),
          company: newCaseCompany.trim() || undefined,
          location: newCaseLocation.trim() || undefined,
          occupation: newCaseOccupation.trim() || undefined,
        }),
      })
      const data = await res.json() as { id?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Case creation failed')
      const caseId = data.id!

      await fetch(`/api/dashboard/muse/cases/${caseId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: ovEventType,
          date: ovEventDate,
          summary: ovEventSummary.trim(),
          what_suggested: ovEventSuggested.trim() || undefined,
          adviser_recommendation: ovEventRecommendation.trim() || undefined,
          worked: ovEventWorked || undefined,
        }),
      })

      resetNewCaseForm()
      await fetchCases()
      setSelected({ type: 'case', id: caseId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setOvEventSubmitting(false)
    }
  }

  // ─── Left panel derived data ────────────────────────────────────────────────

  const isSearching = leftSearch.trim().length > 0

  function entriesForFilter(filter: string): MuseEntryLite[] {
    if (filter === 'news') return allEntries.filter(e => e.entry_type === 'news')
    if (filter === 'knowledge') return allEntries.filter(e => e.entry_type !== 'news')
    return allEntries
  }

  const sectorEntriesFor = (sectorId: string) => allEntries.filter(en => en.sector === sectorId)

  function copyTemplate(t: MuseTemplate) {
    void navigator.clipboard.writeText(t.body).then(() => {
      setCopyMsg('Copied ✓')
      setTimeout(() => setCopyMsg(null), 2000)
    })
  }

  function outlookLink(t: MuseTemplate): string {
    const subject = encodeURIComponent(t.subject ?? t.name)
    const body = encodeURIComponent(t.body)
    return `mailto:?subject=${subject}&body=${body}`
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={s.museWs}>

      {/* ── Left panel — search & navigate ──────────────────────────────────── */}
      <div className={s.musePermLeft}>
        <div className={s.musePanelHead}>
          <span className={s.eyebrow}>Search & Navigate</span>
        </div>

        <div className={s.musePanelSearchWrap}>
          <input
            className={s.museSectorSearch}
            placeholder="Search knowledge, cases, templates…"
            value={leftSearch}
            onChange={e => setLeftSearch(e.target.value)}
          />
        </div>

        <div className={s.museFilterChips}>
          {FILTER_CHIPS.map(chip => (
            <button
              key={chip.id}
              className={`${s.museFilterChip} ${activeFilter === chip.id ? s.museFilterChipActive : ''}`}
              onClick={() => setActiveFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {isSearching ? (
          searching && !searchResult ? (
            <p className={s.musePanelEmpty}>Searching…</p>
          ) : !searchResult || (searchResult.knowledge.length === 0 && searchResult.templates.length === 0 && searchResult.cases.length === 0) ? (
            <p className={s.musePanelEmpty}>No matches.</p>
          ) : (
            <div className={s.museEntryList}>
              {(activeFilter === 'all' || activeFilter === 'knowledge' || activeFilter === 'news') &&
                searchResult.knowledge
                  .filter(k => activeFilter === 'news' ? k.entry_type === 'news' : activeFilter === 'knowledge' ? k.entry_type !== 'news' : true)
                  .map(k => (
                    <button key={`k-${k.id}`} className={s.museEntryRow} onClick={() => setSelected({ type: 'entry', id: k.id })}>
                      <span className={s.museResultDot} style={{ background: RESULT_TYPE_COLOR[k.entry_type === 'news' ? 'news' : 'knowledge'] }} />
                      <span className={s.museEntryTitle}>{k.title}</span>
                      {k.privacy_tier === 2 && <span title="Server only — never sent to AI">🔒</span>}
                    </button>
                  ))}
              {(activeFilter === 'all' || activeFilter === 'templates') && searchResult.templates.map(t => (
                <button key={`t-${t.id}`} className={s.museEntryRow} onClick={() => setSelected({ type: 'template', id: t.id })}>
                  <span className={s.museResultDot} style={{ background: RESULT_TYPE_COLOR.template }} />
                  <span className={s.museEntryTitle}>{t.name}</span>
                  <span className={s.museResultTypeChip}>Template</span>
                </button>
              ))}
              {(activeFilter === 'all' || activeFilter === 'cases') && searchResult.cases.map(c => (
                <button key={`c-${c.id}`} className={s.museEntryRow} onClick={() => setSelected({ type: 'case', id: c.id })}>
                  <span className={s.museResultDot} style={{ background: RESULT_TYPE_COLOR.case }} />
                  <span className={s.museEntryTitle}>{c.company ? `${c.display_name} — ${c.company}` : c.display_name}</span>
                  <span className={s.museResultTypeChip}>Case</span>
                </button>
              ))}
            </div>
          )
        ) : activeFilter === 'cases' ? (
          <div className={s.museEntryList}>
            <button className={s.museNewCaseBtn} onClick={() => { setSelected(null); setNewCaseMode(true) }}>+ New Case</button>
            {allCases.length === 0 ? (
              <p className={s.musePanelEmpty}>No cases yet.</p>
            ) : (
              allCases.map(c => (
                <button key={c.id} className={s.museCaseRow} onClick={() => setSelected({ type: 'case', id: c.id })}>
                  <div className={s.museCaseRowMain}>
                    <span className={s.museEntryTitle}>{c.display_name}{c.company ? ` — ${c.company}` : ''}</span>
                    <span className={s.museCaseRowLoc}>{c.location ?? ''}</span>
                  </div>
                  <span className={s.museCaseStatusChip}>{CASE_STATUS_LABEL[c.status] ?? c.status}</span>
                </button>
              ))
            )}
          </div>
        ) : activeFilter === 'templates' ? (
          <div className={s.museEntryList}>
            {allTemplates.length === 0 ? (
              <p className={s.musePanelEmpty}>No templates yet.</p>
            ) : (
              allTemplates.map(t => (
                <button key={t.id} className={s.museEntryRow} onClick={() => setSelected({ type: 'template', id: t.id })}>
                  <span className={s.museResultDot} style={{ background: RESULT_TYPE_COLOR.template }} />
                  <span className={s.museEntryTitle}>{t.name}</span>
                </button>
              ))
            )}
          </div>
        ) : activeFilter === 'news' ? (
          <div className={s.museEntryList}>
            {entriesForFilter('news').length === 0 ? (
              <p className={s.musePanelEmpty}>No news entries yet.</p>
            ) : (
              entriesForFilter('news').map(entry => (
                <button key={entry.id} className={s.museEntryRow} onClick={() => setSelected({ type: 'entry', id: entry.id })}>
                  <span className={s.museResultDot} style={{ background: RESULT_TYPE_COLOR.news }} />
                  <span className={s.museEntryTitle}>{entry.title}</span>
                  <span className={s.museEntryDate}>{fmtDate(entry.last_updated)}</span>
                </button>
              ))
            )}
          </div>
        ) : activeFilter === 'knowledge' ? (
          <div className={s.museEntryList}>
            {entriesForFilter('knowledge').map(entry => (
              <button key={entry.id} className={s.museEntryRow} onClick={() => setSelected({ type: 'entry', id: entry.id })}>
                <span className={s.museResultDot} style={{ background: RESULT_TYPE_COLOR.knowledge }} />
                <span className={s.museEntryTitle}>{entry.title}</span>
                {entry.privacy_tier === 2 && <span title="Server only — never sent to AI">🔒</span>}
              </button>
            ))}
          </div>
        ) : (
          <div className={s.museSectorList}>
            {SECTORS.map(sector => (
              <div key={sector.id}>
                <button
                  className={[
                    s.museSectorItem,
                    expandedSector === sector.id ? s.museSectorActive : '',
                    sector.locked ? s.museSectorLocked : '',
                  ].join(' ')}
                  onClick={() => { if (!sector.locked) setExpandedSector(expandedSector === sector.id ? null : sector.id) }}
                  title={sector.locked ? 'Available after compliance conversation' : undefined}
                >
                  <span className={s.museSectorDot} style={{ background: sector.color }} />
                  <span className={s.museSectorLabel}>{sector.label}</span>
                  {sector.locked && <span className={s.museLock}>🔒</span>}
                </button>

                {expandedSector === sector.id && !sector.locked && (
                  <div className={s.museEntryList}>
                    {sectorEntriesFor(sector.id).length === 0 ? (
                      <p className={s.musePanelEmpty}>No entries in {sector.label} yet.</p>
                    ) : (
                      sectorEntriesFor(sector.id).map(entry => (
                        <button key={entry.id} className={s.museEntryRow} onClick={() => setSelected({ type: 'entry', id: entry.id })}>
                          <span className={s.museEntryTitle}>{entry.title}</span>
                          {entry.privacy_tier === 2 && <span title="Server only — never sent to AI">🔒</span>}
                          <span className={s.museEntryDate}>{fmtDate(entry.last_updated)}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Centre panel — entry / template / case view ─────────────────────── */}
      <div className={s.musePermCentre} style={{ overflowY: 'auto' }}>
        <button className={s.museBackBtn} onClick={() => router.push('/dashboard')}>← MAIA</button>

        <div className={s.museCentreBody}>
          {newCaseMode ? (
            <div className={s.museFileForm} style={{ maxWidth: 480, margin: '60px auto 0' }}>
              <span className={s.eyebrow}>New Case</span>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Display name</span>
                <input className={s.museTextInput} placeholder="e.g. John S." value={newCaseName} onChange={e => setNewCaseName(e.target.value)} />
              </div>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Company</span>
                <input className={s.museTextInput} value={newCaseCompany} onChange={e => setNewCaseCompany(e.target.value)} />
              </div>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Location</span>
                <input className={s.museTextInput} value={newCaseLocation} onChange={e => setNewCaseLocation(e.target.value)} />
              </div>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Occupation</span>
                <input className={s.museTextInput} value={newCaseOccupation} onChange={e => setNewCaseOccupation(e.target.value)} />
              </div>
              <div className={s.fpDivider} />
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>First event — summary</span>
                <textarea className={s.museBrainDumpInput} style={{ height: 60 }} value={ovEventSummary} onChange={e => setOvEventSummary(e.target.value)} />
              </div>
              <div className={s.museEditActions}>
                <button className={s.museKeepBtn} disabled={ovEventSubmitting || !newCaseName.trim() || !ovEventSummary.trim()} onClick={() => void submitNewCase()}>
                  {ovEventSubmitting ? 'Saving…' : 'Create Case'}
                </button>
                <button className={s.museDiscardBtn} onClick={resetNewCaseForm}>Cancel</button>
              </div>
            </div>
          ) : !selected ? (
            <div className={s.museEmptyState}>
              <div className={s.museEmptyIcon}>🧠</div>
              <p className={s.museEmptyTitle}>MUSE — Your Second Brain</p>
              <p className={s.museEmptyText}>Search anything above or browse sectors on the left.</p>
              <p className={s.museEmptyText}>Everything connected. Everything searchable.</p>
            </div>
          ) : selected.type === 'entry' ? (
            !selectedEntry ? (
              <p className={s.museOverlayLoading}>Loading…</p>
            ) : (
              <div className={s.museEntryView}>
                <div className={s.museOverlayMeta}>
                  <span className={s.museOverlaySector} style={{ background: SECTOR_COLOR[selectedEntry.sector] ?? '#8AA9F0' }}>
                    {selectedEntry.sector}
                  </span>
                  <span className={s.museTypeChip}>{ENTRY_TYPES.find(t => t.id === selectedEntry.entry_type)?.label ?? selectedEntry.entry_type}</span>
                  <span className={s.musePrivacyBadge} title={selectedEntry.privacy_tier === 2 ? 'Server only — never sent to AI' : 'AI can read this'}>
                    {selectedEntry.privacy_tier === 2 ? '🔒 Locked' : '🟢 Open'}
                  </span>
                </div>

                {editingTitle ? (
                  <input
                    className={s.museTextInput}
                    autoFocus
                    defaultValue={selectedEntry.title}
                    onBlur={e => { setEditingTitle(false); if (e.target.value.trim() && e.target.value !== selectedEntry.title) void saveEntryPatch({ title: e.target.value.trim() }) }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  />
                ) : (
                  <h2 className={s.museOverlayTitle} onClick={openTitleEdit} style={{ cursor: 'text' }}>{selectedEntry.title}</h2>
                )}

                <div className={s.museLinksRow}>
                  {parseTags(selectedEntry.tags).map(tag => (
                    <span key={tag} className={s.museTagChip}>{tag}</span>
                  ))}
                </div>

                {(() => {
                  const linkedIds = parseTags(selectedEntry.linked_entries)
                  const linkedFromMuseLinks = selectedEntry.links.map(l => l.entry_id_a === selectedEntry.id ? l.entry_id_b : l.entry_id_a)
                  const allLinkedIds = Array.from(new Set([...linkedIds, ...linkedFromMuseLinks]))
                  if (allLinkedIds.length === 0) return null
                  return (
                    <div className={s.museOverlayLinks}>
                      <span className={s.eyebrow} style={{ display: 'block', marginBottom: 6 }}>Linked entries</span>
                      <div className={s.museLinksRow}>
                        {allLinkedIds.map(id => {
                          const target = allEntries.find(e => e.id === id)
                          return (
                            <button key={id} className={s.museLinkChip} onClick={() => navigateToEntry(id)}>
                              {target?.title ?? id.slice(0, 8)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {selectedEntry.privacy_tier === 1 ? (
                  editingContent ? (
                    <div className={s.museEditBox}>
                      <textarea className={s.museEditTextarea} value={contentDraft} onChange={e => setContentDraft(e.target.value)} />
                      <div className={s.museEditActions}>
                        <button className={s.museKeepBtn} disabled={entrySaving} onClick={() => { void saveEntryPatch({ content: contentDraft }); setEditingContent(false) }}>
                          {entrySaving ? 'Saving…' : 'Save'}
                        </button>
                        <button className={s.museDiscardBtn} onClick={() => setEditingContent(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <pre className={s.museOverlayBody} onClick={openContentEdit} style={{ cursor: 'text' }}>{selectedEntry.content}</pre>
                  )
                ) : (
                  <pre className={s.museOverlayBody}>{selectedEntry.content}</pre>
                )}

                <p className={s.museLastEdited}>Last edited {fmtDateTime(selectedEntry.last_updated)}</p>
              </div>
            )
          ) : selected.type === 'template' ? (
            !selectedTemplate ? (
              <p className={s.museOverlayLoading}>Loading…</p>
            ) : (
              <div className={s.museEntryView}>
                <div className={s.museOverlayMeta}>
                  <span className={s.museTypeChip}>{selectedTemplate.category}</span>
                  <span className={s.museOverlayDate}>{selectedTemplate.medium}</span>
                  {selectedTemplate.scenario && <span className={s.museOverlayDate}>Scenario: {selectedTemplate.scenario}</span>}
                </div>
                <h2 className={s.museOverlayTitle}>{selectedTemplate.name}</h2>
                {selectedTemplate.subject && (
                  <p className={s.museOverlaySummary}><strong>Subject:</strong> {renderWithPlaceholders(selectedTemplate.subject)}</p>
                )}
                <pre className={s.museOverlayBody}>{renderWithPlaceholders(selectedTemplate.body)}</pre>

                <div className={s.museEditActions}>
                  <button className={s.museKeepBtn} onClick={() => copyTemplate(selectedTemplate)}>Copy to clipboard</button>
                  {selectedTemplate.medium === 'email' && (
                    <a className={s.museDiscardBtn} href={outlookLink(selectedTemplate)} style={{ textDecoration: 'none', display: 'inline-block' }}>
                      Open in Outlook
                    </a>
                  )}
                </div>
                {copyMsg && <p className={s.museBrainDumpMsg}>{copyMsg}</p>}
              </div>
            )
          ) : (
            !selectedCase ? (
              <p className={s.museOverlayLoading}>Loading…</p>
            ) : (
              <div className={s.museEntryView}>
                <div className={s.museOverlayMeta}>
                  <span className={s.museOverlaySector} style={{ background: SECTOR_COLOR.Case }}>Case</span>
                  <span className={s.museCaseStatusChip}>{CASE_STATUS_LABEL[selectedCase.status] ?? selectedCase.status}</span>
                  <span className={s.museOverlayDate}>{selectedCase.location ?? ''}</span>
                </div>

                <h2 className={s.museOverlayTitle}>
                  {selectedCase.display_name}{selectedCase.company ? ` — ${selectedCase.company}` : ''}
                </h2>

                <div className={s.museCaseProfileBlock}>
                  {selectedCase.occupation && <p><strong>Occupation:</strong> {selectedCase.occupation}</p>}
                  {selectedCase.financial_profile && <p><strong>Financial profile:</strong> {selectedCase.financial_profile}</p>}
                  {selectedCase.outcome && <p><strong>Outcome:</strong> {selectedCase.outcome}</p>}
                </div>

                <div className={s.museCaseTimeline}>
                  <span className={s.eyebrow} style={{ display: 'block', marginBottom: 8 }}>Timeline</span>
                  {selectedCase.events.length === 0 ? (
                    <p className={s.musePanelEmpty}>No updates yet.</p>
                  ) : (
                    selectedCase.events.map(ev => (
                      <div key={ev.id} className={s.museTimelineItem}>
                        <div className={s.museTimelineHead}>
                          <span className={s.museTimelineDate}>{ev.date}</span>
                          <span className={s.museTimelineType}>{EVENT_TYPES.find(t => t.id === ev.event_type)?.label ?? ev.event_type}</span>
                          {ev.worked === 'yes' && <span className={s.museWorkedYes}>✅ worked</span>}
                          {ev.worked === 'no' && <span className={s.museWorkedNo}>❌ didn&apos;t</span>}
                          {ev.worked === 'pending' && <span className={s.museWorkedPending}>⏳ pending</span>}
                        </div>
                        <p className={s.museTimelineSummary}>{ev.summary}</p>
                        {ev.what_suggested && <p className={s.museTimelineDetail}><strong>Suggested:</strong> {ev.what_suggested}</p>}
                        {ev.adviser_recommendation && <p className={s.museTimelineDetail}><strong>Steven recommended:</strong> {ev.adviser_recommendation}</p>}
                      </div>
                    ))
                  )}
                </div>

                {!addUpdateOpen ? (
                  <button className={s.museBrainDumpBtn} onClick={() => setAddUpdateOpen(true)}>+ Add Update</button>
                ) : (
                  <div className={s.museFileForm}>
                    <div className={s.fpSection}>
                      <span className={s.fpSectionLabel}>Event type</span>
                      <select className={s.museSelect} value={ovEventType} onChange={e => setOvEventType(e.target.value)}>
                        {EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className={s.fpSection}>
                      <span className={s.fpSectionLabel}>Date</span>
                      <input type="date" className={s.museTextInput} value={ovEventDate} onChange={e => setOvEventDate(e.target.value)} />
                    </div>
                    <div className={s.fpSection}>
                      <span className={s.fpSectionLabel}>Summary</span>
                      <textarea className={s.museBrainDumpInput} style={{ height: 50 }} value={ovEventSummary} onChange={e => setOvEventSummary(e.target.value)} />
                    </div>
                    <div className={s.fpSection}>
                      <span className={s.fpSectionLabel}>What did you suggest?</span>
                      <textarea className={s.museBrainDumpInput} style={{ height: 44 }} value={ovEventSuggested} onChange={e => setOvEventSuggested(e.target.value)} />
                    </div>
                    <div className={s.fpSection}>
                      <span className={s.fpSectionLabel}>Steven&apos;s recommendation (optional)</span>
                      <textarea className={s.museBrainDumpInput} style={{ height: 44 }} value={ovEventRecommendation} onChange={e => setOvEventRecommendation(e.target.value)} />
                    </div>
                    <div className={s.museFilterChips}>
                      {['yes', 'no', 'pending'].map(v => (
                        <button key={v} className={`${s.museFilterChip} ${ovEventWorked === v ? s.museFilterChipActive : ''}`} onClick={() => setOvEventWorked(ovEventWorked === v ? '' : v)}>
                          {v}
                        </button>
                      ))}
                    </div>
                    <div className={s.museEditActions}>
                      <button className={s.museKeepBtn} disabled={ovEventSubmitting || !ovEventSummary.trim()} onClick={() => void submitOverlayUpdate()}>
                        {ovEventSubmitting ? 'Saving…' : 'Submit'}
                      </button>
                      <button className={s.museDiscardBtn} onClick={() => setAddUpdateOpen(false)}>Cancel</button>
                    </div>
                  </div>
                )}

                {selectedCase.linkedEntries.length > 0 && (
                  <div className={s.museOverlayLinks}>
                    <span className={s.eyebrow} style={{ display: 'block', marginBottom: 6 }}>Linked knowledge</span>
                    <div className={s.museLinksRow}>
                      {selectedCase.linkedEntries.map(le => (
                        <button key={le.id} className={s.museLinkChip} onClick={() => navigateToEntry(le.id)}>{le.title}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Right panel — Add & File ─────────────────────────────────────────── */}
      <div className={s.musePermRight}>
        <div className={s.museTabRow}>
          <button className={`${s.museTab} ${rightTab === 'knowledge' ? s.museTabActive : ''}`} onClick={() => setRightTab('knowledge')}>
            Add Knowledge
          </button>
          <button className={`${s.museTab} ${rightTab === 'template' ? s.museTabActive : ''}`} onClick={() => setRightTab('template')}>
            Add Template
          </button>
          <button className={`${s.museTab} ${rightTab === 'pending' ? s.museTabActive : ''}`} onClick={() => setRightTab('pending')}>
            Pending{pendingItems.length > 0 && <span className={s.museTabBadge}>{pendingItems.length}</span>}
          </button>
        </div>

        <div className={s.museTabBody}>

          {/* ── Tab 1: Add Knowledge ─────────────────────────────────────── */}
          {rightTab === 'knowledge' && (
            <div className={s.museFileForm}>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Entry type</span>
                <select className={s.museSelect} value={knowEntryType} onChange={e => setKnowEntryType(e.target.value)}>
                  {ENTRY_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>

              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Privacy tier</span>
                <div className={s.museFilterChips} style={{ padding: 0, border: 'none' }}>
                  <button className={`${s.museFilterChip} ${knowPrivacyTier === 1 ? s.museFilterChipActive : ''}`} onClick={() => setKnowPrivacyTier(1)}>🟢 Open (AI)</button>
                  <button className={`${s.museFilterChip} ${knowPrivacyTier === 2 ? s.museFilterChipActive : ''}`} onClick={() => setKnowPrivacyTier(2)}>🔒 Locked (Server only)</button>
                </div>
                {knowPrivacyTier === 2 && (
                  <p className={s.museLockedWarning}>This entry will never be sent to any AI model.</p>
                )}
              </div>

              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Sector</span>
                <select className={s.museSelect} value={knowSector} onChange={e => setKnowSector(e.target.value)}>
                  {SECTORS.filter(sec => !sec.locked).map(sec => (
                    <option key={sec.id} value={sec.id}>{sec.label}</option>
                  ))}
                </select>
              </div>

              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Title (optional — MUSE generates if empty)</span>
                <input className={s.museTextInput} value={knowTitle} onChange={e => setKnowTitle(e.target.value)} placeholder="Leave blank to auto-generate" />
              </div>

              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Context</span>
                <textarea
                  className={s.museBrainDumpInput}
                  style={{ height: 60 }}
                  placeholder="Describe what this is and why you're filing it…"
                  value={knowContext}
                  onChange={e => setKnowContext(e.target.value)}
                />
              </div>

              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Content</span>
                <textarea
                  className={s.museBrainDumpInput}
                  style={{ height: 110 }}
                  placeholder="Paste content, or drop a file below…"
                  value={knowContent}
                  onChange={e => setKnowContent(e.target.value)}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className={`${s.museBrainDumpMic} ${micActive ? s.active : ''}`} onClick={handleKnowMic} aria-label={micActive ? 'Stop listening' : 'Voice input'}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3" />
                    </svg>
                  </button>
                  {micActive && <span className={s.museBrainDumpMsg}>Listening…</span>}
                  {voiceError && <span className={s.museBrainDumpMsg} style={{ color: 'var(--alert)' }}>{voiceError}</span>}
                </div>
                <div
                  className={s.museDropZone}
                  style={pdfExtracting ? { borderColor: 'var(--accent-deep)', color: 'var(--accent)', cursor: 'wait' } : knowDragOver ? { borderColor: 'var(--accent-deep)', color: 'var(--accent)' } : undefined}
                  onDragOver={e => { e.preventDefault(); if (!pdfExtracting) setKnowDragOver(true) }}
                  onDragLeave={() => setKnowDragOver(false)}
                  onDrop={e => { e.preventDefault(); if (!pdfExtracting) void handleKnowFileDrop(e) }}
                >
                  {pdfExtracting ? 'Extracting text from PDF…' : 'Drop a PDF, .txt, or .md file — combines with content above'}
                </div>
              </div>

              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Tags {knowTagsPreview.length === 0 ? '(auto-generated as you type)' : '(auto-generated — editable)'}</span>
                <div className={s.museLinksRow}>
                  {knowTagsPreview.map(tag => (
                    <span key={tag} className={s.museTagChip}>
                      {tag}
                      <button className={s.museTagRemove} onClick={() => removeTagPreview(tag)}>✕</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className={s.museTextInput}
                    placeholder="Add a tag…"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addTagPreview() }}
                  />
                  <button className={s.museDiscardBtn} onClick={addTagPreview}>Add</button>
                </div>
              </div>

              {knowMsg && (
                <div>
                  <p className={s.museBrainDumpMsg} style={{ color: knowMsg.ok ? 'var(--online)' : 'var(--alert)' }}>{knowMsg.text}</p>
                  {knowMsg.ok && knowMsg.tags && knowMsg.tags.length > 0 && (
                    <div className={s.museLinksRow}>
                      {knowMsg.tags.map(tag => <span key={tag} className={s.museTagChip}>{tag}</span>)}
                    </div>
                  )}
                </div>
              )}

              <button
                className={s.museBrainDumpBtn}
                style={{ alignSelf: 'stretch', textAlign: 'center' }}
                disabled={knowSubmitting || !knowContent.trim()}
                onClick={() => void handleKnowSubmit()}
              >
                {knowSubmitting ? 'Filing…' : 'File to MUSE'}
              </button>
            </div>
          )}

          {/* ── Tab 2: Add Template ──────────────────────────────────────── */}
          {rightTab === 'template' && (
            <div className={s.museFileForm}>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Template name</span>
                <input className={s.museTextInput} value={tplName} onChange={e => setTplName(e.target.value)} />
              </div>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Category</span>
                <select className={s.museSelect} value={tplCategory} onChange={e => setTplCategory(e.target.value)}>
                  {TEMPLATE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Medium</span>
                <select className={s.museSelect} value={tplMedium} onChange={e => setTplMedium(e.target.value)}>
                  {TEMPLATE_MEDIUMS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Scenario link</span>
                <select className={s.museSelect} value={tplScenario} onChange={e => setTplScenario(e.target.value)}>
                  <option value="">Generic / none</option>
                  {hermesScenarios.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                </select>
              </div>
              {tplCategory === 'email' && (
                <div className={s.fpSection}>
                  <span className={s.fpSectionLabel}>Subject</span>
                  <input className={s.museTextInput} value={tplSubject} onChange={e => setTplSubject(e.target.value)} />
                </div>
              )}
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Body</span>
                <textarea className={s.museBrainDumpInput} style={{ height: 100 }} value={tplBody} onChange={e => setTplBody(e.target.value)} />
                <p className={s.musePlaceholderHelper}>Use [NAME] [COMPANY] [LOCATION] [MEETING_DATE] [MEETING_TIME] [SPECIFIC_DETAIL]</p>
              </div>

              {tplBody.trim() && (
                <div className={s.fpSection}>
                  <span className={s.fpSectionLabel}>Preview</span>
                  <pre className={s.museOverlayBody}>{renderWithPlaceholders(tplBody)}</pre>
                </div>
              )}

              {tplMsg && <p className={s.museBrainDumpMsg} style={{ color: tplMsg.ok ? 'var(--online)' : 'var(--alert)' }}>{tplMsg.text}</p>}

              <button
                className={s.museBrainDumpBtn}
                style={{ alignSelf: 'stretch', textAlign: 'center' }}
                disabled={tplSubmitting || !tplName.trim() || !tplBody.trim()}
                onClick={() => void handleTemplateSubmit()}
              >
                {tplSubmitting ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          )}

          {/* ── Tab 3: Pending Approvals ──────────────────────────────────── */}
          {rightTab === 'pending' && (
            <div className={s.museApprovalsQueue} style={{ borderBottom: 'none' }}>
              {pendingItems.length === 0 ? (
                <p className={s.musePanelEmpty}>No pending approvals</p>
              ) : (
                pendingItems.map(item => (
                  <div key={item.id} className={s.museApprovalItem}>
                    <div className={s.museApprovalMeta}>
                      <span className={s.museApprovalSector} style={{ background: SECTOR_COLOR[item.suggested_sector] ?? '#8AA9F0' }}>
                        {item.suggested_sector}
                      </span>
                      {item.source_agent && <span className={s.museApprovalSource}>{item.source_agent}</span>}
                    </div>
                    <div className={s.museApprovalTitle}>{item.suggested_title}</div>
                    <div className={s.museApprovalActions}>
                      <button className={s.museKeepBtn} disabled={confirmLoading === item.id} onClick={() => void handleConfirm(item.id, 'keep')}>
                        {confirmLoading === item.id ? '…' : 'Keep'}
                      </button>
                      <button className={s.museDiscardBtn} disabled={confirmLoading === item.id} onClick={() => void handleConfirm(item.id, 'discard')}>
                        Discard
                      </button>
                      <button className={s.museDiscardBtn} disabled={confirmLoading === item.id} onClick={() => toggleRefine(item.id)}>
                        {refineOpenId === item.id ? 'Cancel' : 'Edit'}
                      </button>
                    </div>

                    {refineOpenId === item.id && (
                      <div className={s.museRefineBox}>
                        <input
                          className={s.museRefineInput}
                          placeholder='Edit instruction, e.g. "make the summary shorter"…'
                          value={refineText}
                          onChange={e => setRefineText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') void handleRefineSubmit(item.id) }}
                          disabled={refineLoading === item.id}
                        />
                        <button className={s.museKeepBtn} disabled={refineLoading === item.id || !refineText.trim()} onClick={() => void handleRefineSubmit(item.id)}>
                          {refineLoading === item.id ? '…' : 'Send'}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Error toast ──────────────────────────────────────────────────── */}
      {error && (
        <div className={s.museErrorToast}>
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
    </div>
  )
}
