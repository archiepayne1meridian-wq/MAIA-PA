'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import s from '../dashboard.module.css'
import type { MuseEntry, MusePending, MuseEntryFull } from '../../../../tools/muse'

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

const FILTER_CHIPS = [
  { id: 'all',                  label: 'All' },
  { id: 'Training',             label: 'Training' },
  { id: 'Products',             label: 'Products' },
  { id: 'Regulations',          label: 'Regulations' },
  { id: 'Sales & Prospecting',  label: 'Sales' },
  { id: 'cases',                label: 'Cases' },
  { id: 'Expat Knowledge',      label: 'Expat' },
] as const

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

// ─── Case types (tools/muse-cases.ts shapes) ──────────────────────────────────

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

interface SearchResultItem {
  id: string
  type: 'entry' | 'case'
  title: string
  sector: string
  summary: string
}

// ─── Web Speech API types (not in default TS DOM lib without strictLib config) ─

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

// ─── D3 node / link types (compatible with SimulationNodeDatum) ───────────────

interface D3Node {
  id: string
  sector: string
  title: string
  summary: string
  linkCount: number
  index?: number
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

interface GraphLink {
  id: string
  entry_id_a: string
  entry_id_b: string
  link_type: string
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MuseWorkspace() {
  const router = useRouter()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const simRef = useRef<{ stop: () => void } | null>(null)
  const recogRef = useRef<SpeechRecognitionInstance | null>(null)

  // Graph data
  const [graphNodes, setGraphNodes] = useState<D3Node[]>([])
  const [graphLinks, setGraphLinks] = useState<GraphLink[]>([])
  const [allEntries, setAllEntries] = useState<MuseEntry[]>([])
  const [allCases, setAllCases] = useState<MuseCase[]>([])

  // Left panel — search & navigate
  const [leftSearch, setLeftSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [expandedSector, setExpandedSector] = useState<string | null>(null)

  // Right panel — tabs
  const [rightTab, setRightTab] = useState<'knowledge' | 'case' | 'pending'>('knowledge')

  // Tab 1 — Add Knowledge
  const [knowSector, setKnowSector] = useState<string>(SECTORS[0].id)
  const [knowTitle, setKnowTitle] = useState('')
  const [knowContext, setKnowContext] = useState('')
  const [knowContent, setKnowContent] = useState('')
  const [knowSubmitting, setKnowSubmitting] = useState(false)
  const [knowMsg, setKnowMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [knowDragOver, setKnowDragOver] = useState(false)
  const [micActive, setMicActive] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)

  // Tab 2 — Add Case Update
  const [caseFormMode, setCaseFormMode] = useState<'select' | 'new'>('select')
  const [caseSearchQuery, setCaseSearchQuery] = useState('')
  const [caseFormSelectedId, setCaseFormSelectedId] = useState<string | null>(null)
  const [newCaseName, setNewCaseName] = useState('')
  const [newCaseCompany, setNewCaseCompany] = useState('')
  const [newCaseLocation, setNewCaseLocation] = useState('')
  const [newCaseOccupation, setNewCaseOccupation] = useState('')
  const [eventType, setEventType] = useState<string>('call')
  const [eventDate, setEventDate] = useState(todayStr())
  const [eventSummary, setEventSummary] = useState('')
  const [eventSuggested, setEventSuggested] = useState('')
  const [eventRecommendation, setEventRecommendation] = useState('')
  const [eventWorked, setEventWorked] = useState<string>('')
  const [caseSubmitting, setCaseSubmitting] = useState(false)
  const [caseMsg, setCaseMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Tab 3 — Pending approvals (unchanged logic, moved under a tab)
  const [pendingItems, setPendingItems] = useState<MusePending[]>([])
  const [confirmLoading, setConfirmLoading] = useState<string | null>(null)
  const [refineOpenId, setRefineOpenId] = useState<string | null>(null)
  const [refineText, setRefineText] = useState('')
  const [refineLoading, setRefineLoading] = useState<string | null>(null)

  // Entry overlay
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<MuseEntryFull | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [entryLinkOpen, setEntryLinkOpen] = useState(false)
  const [entryLinkQuery, setEntryLinkQuery] = useState('')
  const [entryLinkMsg, setEntryLinkMsg] = useState<string | null>(null)

  // Case overlay
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [selectedCase, setSelectedCase] = useState<CaseWithEvents | null>(null)
  const [addUpdateOpen, setAddUpdateOpen] = useState(false)
  const [ovEventType, setOvEventType] = useState<string>('call')
  const [ovEventDate, setOvEventDate] = useState(todayStr())
  const [ovEventSummary, setOvEventSummary] = useState('')
  const [ovEventSuggested, setOvEventSuggested] = useState('')
  const [ovEventRecommendation, setOvEventRecommendation] = useState('')
  const [ovEventWorked, setOvEventWorked] = useState<string>('')
  const [ovEventSubmitting, setOvEventSubmitting] = useState(false)
  const [caseLinkOpen, setCaseLinkOpen] = useState(false)
  const [caseLinkQuery, setCaseLinkQuery] = useState('')
  const [caseLinkMsg, setCaseLinkMsg] = useState<string | null>(null)

  // Error
  const [error, setError] = useState<string | null>(null)

  // ─── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    void fetchGraph()
    void fetchPending()
    void fetchCases()
  }, [])

  useEffect(() => {
    if (!selectedEntryId) { setSelectedEntry(null); setEditOpen(false); setEntryLinkOpen(false); return }
    void fetchEntry(selectedEntryId)
  }, [selectedEntryId])

  useEffect(() => {
    if (!selectedCaseId) { setSelectedCase(null); setAddUpdateOpen(false); setCaseLinkOpen(false); return }
    void fetchCase(selectedCaseId)
  }, [selectedCaseId])

  useEffect(() => {
    if (graphNodes.length === 0) return
    void renderGraph()
    return () => { simRef.current?.stop() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphNodes, graphLinks])

  async function fetchGraph() {
    try {
      const res = await fetch('/api/dashboard/muse')
      if (!res.ok) return
      const data = await res.json() as { entries?: MuseEntry[]; links?: GraphLink[] }
      const links: GraphLink[] = data.links ?? []
      const countMap: Record<string, number> = {}
      for (const l of links) {
        countMap[l.entry_id_a] = (countMap[l.entry_id_a] ?? 0) + 1
        countMap[l.entry_id_b] = (countMap[l.entry_id_b] ?? 0) + 1
      }
      const entries = data.entries ?? []
      const nodes: D3Node[] = entries.map(en => ({
        id: en.id, sector: en.sector, title: en.title, summary: en.summary,
        linkCount: countMap[en.id] ?? 0,
      }))
      setGraphNodes(nodes)
      setGraphLinks(links)
      setAllEntries(entries)
    } catch {
      // non-fatal
    }
  }

  async function fetchPending() {
    try {
      const res = await fetch('/api/dashboard/muse/pending')
      if (!res.ok) return
      const data = await res.json() as { items?: MusePending[] }
      setPendingItems(data.items ?? [])
    } catch {
      // non-fatal
    }
  }

  async function fetchCases() {
    try {
      const res = await fetch('/api/dashboard/muse/cases')
      if (!res.ok) return
      const data = await res.json() as { cases?: MuseCase[] }
      setAllCases(data.cases ?? [])
    } catch {
      // non-fatal
    }
  }

  async function fetchEntry(id: string) {
    try {
      const res = await fetch(`/api/dashboard/muse/entry/${id}`)
      if (!res.ok) return
      const data = await res.json() as { entry?: MuseEntryFull }
      setSelectedEntry(data.entry ?? null)
    } catch {
      // non-fatal
    }
  }

  async function fetchCase(id: string) {
    try {
      const res = await fetch(`/api/dashboard/muse/cases/${id}`)
      if (!res.ok) return
      const data = await res.json() as { case?: CaseWithEvents }
      setSelectedCase(data.case ?? null)
    } catch {
      // non-fatal
    }
  }

  // ─── D3 render (unchanged — knowledge graph only) ──────────────────────────

  async function renderGraph() {
    if (!svgRef.current || graphNodes.length === 0) return
    const d3 = await import('d3')

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    simRef.current?.stop()

    const rect = svgRef.current.getBoundingClientRect()
    const W = rect.width || 800
    const H = rect.height || 600

    const nodes: D3Node[] = graphNodes.map(n => ({ ...n }))
    const links = graphLinks.map(l => ({ source: l.entry_id_a, target: l.entry_id_b, link_type: l.link_type }))

    const g = svg.append('g')

    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.25, 4])
        .on('zoom', (event: { transform: d3.ZoomTransform }) => {
          g.attr('transform', event.transform.toString())
        }),
    )

    const linkSel = g.append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', 'rgba(255,255,255,0.1)')
      .attr('stroke-width', 1)

    const radius = (d: D3Node) => Math.min(8 + (d.linkCount ?? 0) * 2, 24)

    const nodeSel = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .enter()
      .append('circle')
      .attr('r', radius)
      .attr('fill', (d: D3Node) => SECTOR_COLOR[d.sector] ?? '#8AA9F0')
      .attr('stroke', 'rgba(255,255,255,0.18)')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .on('click', (_event: MouseEvent, d: D3Node) => { setSelectedCaseId(null); setSelectedEntryId(d.id) })

    nodeSel.append('title').text((d: D3Node) => `${d.title}\n${d.sector}`)

    type DragEvent = d3.D3DragEvent<SVGCircleElement, D3Node, D3Node>

    nodeSel.call(
      d3.drag<SVGCircleElement, D3Node>()
        .on('start', (ev: DragEvent, d: D3Node) => {
          if (!ev.active) sim.alphaTarget(0.3).restart()
          d.fx = d.x ?? 0; d.fy = d.y ?? 0
        })
        .on('drag', (ev: DragEvent, d: D3Node) => { d.fx = ev.x; d.fy = ev.y })
        .on('end', (ev: DragEvent, d: D3Node) => {
          if (!ev.active) sim.alphaTarget(0)
          d.fx = null; d.fy = null
        }),
    )

    const sim = d3.forceSimulation(nodes)
      .force('link',
        d3.forceLink(links)
          .id((d) => (d as D3Node).id)
          .distance(100),
      )
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius((d) => radius(d as D3Node) + 8))
      .on('tick', () => {
        linkSel
          .attr('x1', (d) => ((d.source as unknown) as D3Node).x ?? 0)
          .attr('y1', (d) => ((d.source as unknown) as D3Node).y ?? 0)
          .attr('x2', (d) => ((d.target as unknown) as D3Node).x ?? 0)
          .attr('y2', (d) => ((d.target as unknown) as D3Node).y ?? 0)
        nodeSel
          .attr('cx', (d: D3Node) => d.x ?? 0)
          .attr('cy', (d: D3Node) => d.y ?? 0)
      })

    simRef.current = { stop: () => sim.stop() }
  }

  // ─── Handlers — approvals (Tab 3, unchanged logic) ─────────────────────────

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
      if (decision === 'keep') await fetchGraph()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirm failed')
    } finally {
      setConfirmLoading(null)
    }
  }

  function toggleRefine(pendingId: string) {
    if (refineOpenId === pendingId) {
      setRefineOpenId(null)
      setRefineText('')
    } else {
      setRefineOpenId(pendingId)
      setRefineText('')
    }
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
    try {
      const text = await readFileAsText(file)
      setKnowContent(prev => prev.trim() ? `${prev.trim()}\n\n${text}` : text)
      setKnowMsg({ text: `Loaded "${file.name}" — review and submit below.`, ok: true })
    } catch {
      setKnowMsg({ text: `Couldn't read "${file.name}".`, ok: false })
    }
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
          entryType: 'knowledge',
        }),
      })
      const data = await res.json() as { id?: string; title?: string; sector?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Filing failed')
      setKnowMsg({ text: `Filed to ${data.sector} ✓ — "${data.title}"`, ok: true })
      setKnowTitle('')
      setKnowContext('')
      setKnowContent('')
      await fetchGraph()
    } catch (err) {
      setKnowMsg({ text: err instanceof Error ? err.message : 'Filing failed', ok: false })
    } finally {
      setKnowSubmitting(false)
    }
  }

  // ─── Handlers — Tab 2: Add Case Update ──────────────────────────────────────

  const caseSearchResults = caseSearchQuery.trim()
    ? allCases.filter(c => {
        const q = caseSearchQuery.trim().toLowerCase()
        return c.display_name.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q)
      })
    : allCases.slice(0, 8)

  function resetCaseForm() {
    setCaseFormMode('select')
    setCaseSearchQuery('')
    setCaseFormSelectedId(null)
    setNewCaseName('')
    setNewCaseCompany('')
    setNewCaseLocation('')
    setNewCaseOccupation('')
    setEventType('call')
    setEventDate(todayStr())
    setEventSummary('')
    setEventSuggested('')
    setEventRecommendation('')
    setEventWorked('')
  }

  async function handleCaseSubmit() {
    if (caseFormMode === 'select' && !caseFormSelectedId) return
    if (caseFormMode === 'new' && !newCaseName.trim()) return
    if (!eventSummary.trim()) return

    setCaseSubmitting(true)
    setCaseMsg(null)
    try {
      let caseId = caseFormSelectedId

      if (caseFormMode === 'new') {
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
        caseId = data.id ?? null
      }

      if (!caseId) throw new Error('No case selected')

      const evRes = await fetch(`/api/dashboard/muse/cases/${caseId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: eventType,
          date: eventDate,
          summary: eventSummary.trim(),
          what_suggested: eventSuggested.trim() || undefined,
          adviser_recommendation: eventRecommendation.trim() || undefined,
          worked: eventWorked || undefined,
        }),
      })
      const evData = await evRes.json() as { error?: string }
      if (!evRes.ok) throw new Error(evData.error ?? 'Event failed')

      setCaseMsg({ text: 'Case update saved ✓', ok: true })
      resetCaseForm()
      await fetchCases()
    } catch (err) {
      setCaseMsg({ text: err instanceof Error ? err.message : 'Failed to save', ok: false })
    } finally {
      setCaseSubmitting(false)
    }
  }

  // ─── Handlers — entry overlay: edit ─────────────────────────────────────────

  function openEdit() {
    if (!selectedEntry) return
    setEditContent(selectedEntry.content)
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!selectedEntry) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/dashboard/muse/entry/${selectedEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      })
      if (!res.ok) throw new Error('Save failed')
      const data = await res.json() as { entry?: MuseEntryFull }
      setSelectedEntry(data.entry ?? null)
      setEditOpen(false)
      await fetchGraph()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }

  async function submitEntryLink() {
    if (!selectedEntry || !entryLinkQuery.trim()) return
    const target = allEntries.find(e =>
      e.id !== selectedEntry.id && e.title.toLowerCase() === entryLinkQuery.trim().toLowerCase(),
    ) ?? allEntries.find(e => e.id !== selectedEntry.id && e.title.toLowerCase().includes(entryLinkQuery.trim().toLowerCase()))

    if (!target) { setEntryLinkMsg('No matching entry found — try the exact title.'); return }

    try {
      const res = await fetch(`/api/dashboard/muse/entry/${selectedEntry.id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: target.id }),
      })
      if (!res.ok) throw new Error('Link failed')
      const data = await res.json() as { entry?: MuseEntryFull }
      setSelectedEntry(data.entry ?? null)
      setEntryLinkQuery('')
      setEntryLinkMsg(`Linked to "${target.title}" ✓`)
    } catch {
      setEntryLinkMsg('Link failed')
    }
  }

  // ─── Handlers — case overlay: add update + link ────────────────────────────

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
      setOvEventType('call'); setOvEventDate(todayStr()); setOvEventSummary('')
      setOvEventSuggested(''); setOvEventRecommendation(''); setOvEventWorked('')
      await fetchCases()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setOvEventSubmitting(false)
    }
  }

  async function submitCaseLink() {
    if (!selectedCase || !caseLinkQuery.trim()) return
    const target = allEntries.find(e => e.title.toLowerCase() === caseLinkQuery.trim().toLowerCase())
      ?? allEntries.find(e => e.title.toLowerCase().includes(caseLinkQuery.trim().toLowerCase()))

    if (!target) { setCaseLinkMsg('No matching entry found — try the exact title.'); return }

    try {
      const res = await fetch(`/api/dashboard/muse/cases/${selectedCase.id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ museEntryId: target.id }),
      })
      if (!res.ok) throw new Error('Link failed')
      const data = await res.json() as { case?: CaseWithEvents }
      setSelectedCase(data.case ?? null)
      setCaseLinkQuery('')
      setCaseLinkMsg(`Linked to "${target.title}" ✓`)
    } catch {
      setCaseLinkMsg('Link failed')
    }
  }

  // ─── Left panel derived data ────────────────────────────────────────────────

  const searchQuery = leftSearch.trim().toLowerCase()

  const searchResults: SearchResultItem[] = searchQuery
    ? [
        ...allEntries
          .filter(en => activeFilter === 'all' || activeFilter === en.sector)
          .filter(en => activeFilter !== 'cases')
          .filter(en => en.title.toLowerCase().includes(searchQuery) || en.summary.toLowerCase().includes(searchQuery))
          .map((en): SearchResultItem => ({ id: en.id, type: 'entry', title: en.title, sector: en.sector, summary: en.summary })),
        ...(activeFilter === 'all' || activeFilter === 'cases'
          ? allCases
              .filter(c => {
                const hay = `${c.display_name} ${c.company ?? ''} ${c.location ?? ''} ${c.occupation ?? ''} ${c.financial_profile ?? ''} ${c.outcome ?? ''}`.toLowerCase()
                return hay.includes(searchQuery)
              })
              .map((c): SearchResultItem => ({
                id: c.id, type: 'case',
                title: c.company ? `${c.display_name} — ${c.company}` : c.display_name,
                sector: 'Case',
                summary: [c.occupation, c.financial_profile].filter(Boolean).join(' — '),
              }))
          : []),
      ]
    : []

  function openResult(r: SearchResultItem) {
    if (r.type === 'case') { setSelectedEntryId(null); setSelectedCaseId(r.id) }
    else { setSelectedCaseId(null); setSelectedEntryId(r.id) }
  }

  const sectorEntriesFor = (sectorId: string) => allEntries.filter(en => en.sector === sectorId)

  const recentCasesForSidebar = [...allCases]
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, 5)

  const pendingCount = pendingItems.length

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={s.museWs}>

      {/* ── Left panel — search & navigate (permanent) ──────────────────────── */}
      <div className={s.musePermLeft}>
        <div className={s.musePanelHead}>
          <span className={s.eyebrow}>Search & Navigate</span>
        </div>

        <div className={s.musePanelSearchWrap}>
          <input
            className={s.museSectorSearch}
            placeholder="Search knowledge + cases…"
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

        {searchQuery ? (
          searchResults.length === 0 ? (
            <p className={s.musePanelEmpty}>No matches.</p>
          ) : (
            <div className={s.museEntryList}>
              {searchResults.map(r => (
                <button key={`${r.type}-${r.id}`} className={s.museEntryRow} onClick={() => openResult(r)}>
                  <span className={s.museSectorDot} style={{ background: SECTOR_COLOR[r.sector] ?? '#8AA9F0' }} />
                  <span className={s.museEntryTitle}>{r.title}</span>
                  {r.type === 'case' && <span className={s.museResultTypeChip}>Case</span>}
                </button>
              ))}
            </div>
          )
        ) : activeFilter === 'cases' ? (
          <div className={s.museEntryList}>
            {allCases.length === 0 ? (
              <p className={s.musePanelEmpty}>No cases yet.</p>
            ) : (
              allCases.map(c => (
                <button key={c.id} className={s.museCaseRow} onClick={() => { setSelectedEntryId(null); setSelectedCaseId(c.id) }}>
                  <div className={s.museCaseRowMain}>
                    <span className={s.museEntryTitle}>{c.display_name}{c.company ? ` — ${c.company}` : ''}</span>
                    <span className={s.museCaseRowLoc}>{c.location ?? ''}</span>
                  </div>
                  <span className={s.museCaseStatusChip}>{CASE_STATUS_LABEL[c.status] ?? c.status}</span>
                </button>
              ))
            )}
          </div>
        ) : activeFilter !== 'all' ? (
          <div className={s.museEntryList}>
            {sectorEntriesFor(activeFilter).length === 0 ? (
              <p className={s.musePanelEmpty}>No entries in this sector yet.</p>
            ) : (
              sectorEntriesFor(activeFilter).map(entry => (
                <button key={entry.id} className={s.museEntryRow} onClick={() => { setSelectedCaseId(null); setSelectedEntryId(entry.id) }}>
                  <span className={s.museEntryTitle}>{entry.title}</span>
                  <span className={s.museEntryDate}>{fmtDate(entry.last_updated)}</span>
                </button>
              ))
            )}
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
                        <button key={entry.id} className={s.museEntryRow} onClick={() => { setSelectedCaseId(null); setSelectedEntryId(entry.id) }}>
                          <span className={s.museEntryTitle}>{entry.title}</span>
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

        {activeFilter !== 'cases' && !searchQuery && (
          <div className={s.museRecentCases}>
            <div className={s.musePanelHead} style={{ padding: '10px 16px' }}>
              <span className={s.eyebrow}>Cases</span>
            </div>
            {recentCasesForSidebar.length === 0 ? (
              <p className={s.musePanelEmpty}>No cases yet.</p>
            ) : (
              <div className={s.museEntryList}>
                {recentCasesForSidebar.map(c => (
                  <button key={c.id} className={s.museCaseRow} onClick={() => { setSelectedEntryId(null); setSelectedCaseId(c.id) }}>
                    <div className={s.museCaseRowMain}>
                      <span className={s.museEntryTitle}>{c.display_name}{c.company ? ` — ${c.company}` : ''}</span>
                      <span className={s.museCaseRowLoc}>{c.location ?? ''}</span>
                    </div>
                    <span className={s.museCaseStatusChip}>{CASE_STATUS_LABEL[c.status] ?? c.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Centre panel — brain graph (permanent) ──────────────────────────── */}
      <div className={s.musePermCentre}>
        <button className={s.museBackBtn} onClick={() => router.push('/dashboard')}>← MAIA</button>

        <div className={s.museBrainContainer}>
          {graphNodes.length === 0 ? (
            <div className={s.museEmptyState}>
              <div className={s.museEmptyIcon}>🧠</div>
              <p className={s.museEmptyTitle}>Your knowledge brain is empty — start adding entries to see it grow</p>
              <p className={s.museEmptyText}>Use the Add Knowledge tab or say &quot;MUSE, file this:&quot; in Slack</p>
            </div>
          ) : (
            <svg ref={svgRef} className={s.museBrainSvg} />
          )}
        </div>
      </div>

      {/* ── Right panel — filing tabs (permanent) ────────────────────────────── */}
      <div className={s.musePermRight}>
        <div className={s.museTabRow}>
          <button className={`${s.museTab} ${rightTab === 'knowledge' ? s.museTabActive : ''}`} onClick={() => setRightTab('knowledge')}>
            Add Knowledge
          </button>
          <button className={`${s.museTab} ${rightTab === 'case' ? s.museTabActive : ''}`} onClick={() => setRightTab('case')}>
            Add Case Update
          </button>
          <button className={`${s.museTab} ${rightTab === 'pending' ? s.museTabActive : ''}`} onClick={() => setRightTab('pending')}>
            Pending{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        </div>

        <div className={s.museTabBody}>

          {/* ── Tab 1: Add Knowledge ─────────────────────────────────────── */}
          {rightTab === 'knowledge' && (
            <div className={s.museFileForm}>
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
                  <button
                    className={`${s.museBrainDumpMic} ${micActive ? s.active : ''}`}
                    onClick={handleKnowMic}
                    aria-label={micActive ? 'Stop listening' : 'Voice input'}
                  >
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
                  style={knowDragOver ? { borderColor: 'var(--accent-deep)', color: 'var(--accent)' } : undefined}
                  onDragOver={e => { e.preventDefault(); setKnowDragOver(true) }}
                  onDragLeave={() => setKnowDragOver(false)}
                  onDrop={e => void handleKnowFileDrop(e)}
                >
                  Drop a PDF, .txt, or .md file — combines with content above
                </div>
              </div>

              {knowMsg && (
                <p className={s.museBrainDumpMsg} style={{ color: knowMsg.ok ? 'var(--online)' : 'var(--alert)' }}>{knowMsg.text}</p>
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

          {/* ── Tab 2: Add Case Update ───────────────────────────────────── */}
          {rightTab === 'case' && (
            <div className={s.museFileForm}>
              <div className={s.museCaseModeRow}>
                <button
                  className={`${s.museFilterChip} ${caseFormMode === 'select' ? s.museFilterChipActive : ''}`}
                  onClick={() => setCaseFormMode('select')}
                >
                  Existing case
                </button>
                <button
                  className={`${s.museFilterChip} ${caseFormMode === 'new' ? s.museFilterChipActive : ''}`}
                  onClick={() => setCaseFormMode('new')}
                >
                  New case
                </button>
              </div>

              {caseFormMode === 'select' ? (
                <div className={s.fpSection}>
                  <span className={s.fpSectionLabel}>Find case</span>
                  <input
                    className={s.museTextInput}
                    placeholder="Search by name or company…"
                    value={caseSearchQuery}
                    onChange={e => { setCaseSearchQuery(e.target.value); setCaseFormSelectedId(null) }}
                  />
                  {caseSearchResults.length > 0 && (
                    <div className={s.museCaseSelectList}>
                      {caseSearchResults.map(c => (
                        <button
                          key={c.id}
                          className={`${s.museCaseSelectRow} ${caseFormSelectedId === c.id ? s.museCaseSelectRowActive : ''}`}
                          onClick={() => setCaseFormSelectedId(c.id)}
                        >
                          {c.display_name}{c.company ? ` — ${c.company}` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
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
                </>
              )}

              <div className={s.fpDivider} />

              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Event type</span>
                <select className={s.museSelect} value={eventType} onChange={e => setEventType(e.target.value)}>
                  {EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Date</span>
                <input type="date" className={s.museTextInput} value={eventDate} onChange={e => setEventDate(e.target.value)} />
              </div>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Summary</span>
                <textarea className={s.museBrainDumpInput} style={{ height: 60 }} value={eventSummary} onChange={e => setEventSummary(e.target.value)} />
              </div>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>What did you suggest?</span>
                <textarea className={s.museBrainDumpInput} style={{ height: 50 }} value={eventSuggested} onChange={e => setEventSuggested(e.target.value)} />
              </div>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Steven&apos;s recommendation (optional)</span>
                <textarea className={s.museBrainDumpInput} style={{ height: 50 }} value={eventRecommendation} onChange={e => setEventRecommendation(e.target.value)} />
              </div>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>Did it work? (optional)</span>
                <div className={s.museFilterChips}>
                  {['yes', 'no', 'pending'].map(v => (
                    <button key={v} className={`${s.museFilterChip} ${eventWorked === v ? s.museFilterChipActive : ''}`} onClick={() => setEventWorked(eventWorked === v ? '' : v)}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {caseMsg && (
                <p className={s.museBrainDumpMsg} style={{ color: caseMsg.ok ? 'var(--online)' : 'var(--alert)' }}>{caseMsg.text}</p>
              )}

              <button
                className={s.museBrainDumpBtn}
                style={{ alignSelf: 'stretch', textAlign: 'center' }}
                disabled={
                  caseSubmitting || !eventSummary.trim() ||
                  (caseFormMode === 'select' ? !caseFormSelectedId : !newCaseName.trim())
                }
                onClick={() => void handleCaseSubmit()}
              >
                {caseSubmitting ? 'Saving…' : 'Save Case Update'}
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
                      <span
                        className={s.museApprovalSector}
                        style={{ background: SECTOR_COLOR[item.suggested_sector] ?? '#8AA9F0' }}
                      >
                        {item.suggested_sector}
                      </span>
                      {item.source_agent && (
                        <span className={s.museApprovalSource}>{item.source_agent}</span>
                      )}
                    </div>
                    <div className={s.museApprovalTitle}>{item.suggested_title}</div>
                    <div className={s.museApprovalActions}>
                      <button
                        className={s.museKeepBtn}
                        disabled={confirmLoading === item.id}
                        onClick={() => void handleConfirm(item.id, 'keep')}
                      >
                        {confirmLoading === item.id ? '…' : 'Keep'}
                      </button>
                      <button
                        className={s.museDiscardBtn}
                        disabled={confirmLoading === item.id}
                        onClick={() => void handleConfirm(item.id, 'discard')}
                      >
                        Discard
                      </button>
                      <button
                        className={s.museDiscardBtn}
                        disabled={confirmLoading === item.id}
                        onClick={() => toggleRefine(item.id)}
                      >
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
                        <button
                          className={s.museKeepBtn}
                          disabled={refineLoading === item.id || !refineText.trim()}
                          onClick={() => void handleRefineSubmit(item.id)}
                        >
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

      {/* ── Entry overlay ────────────────────────────────────────────────── */}
      {selectedEntryId && (
        <div className={s.museOverlay} onClick={() => setSelectedEntryId(null)}>
          <div className={s.museOverlayCard} onClick={e => e.stopPropagation()}>
            <button className={s.museOverlayClose} onClick={() => setSelectedEntryId(null)}>✕</button>

            {!selectedEntry ? (
              <p className={s.museOverlayLoading}>Loading…</p>
            ) : (
              <>
                <div className={s.museOverlayMeta}>
                  <span
                    className={s.museOverlaySector}
                    style={{ background: SECTOR_COLOR[selectedEntry.sector] ?? '#8AA9F0' }}
                  >
                    {selectedEntry.sector}
                  </span>
                  <span className={s.museOverlayDate}>
                    Filed{' '}
                    {new Date(selectedEntry.date_filed * 1000).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </span>
                  {!editOpen && (
                    <button className={s.museEditBtn} onClick={openEdit}>Edit</button>
                  )}
                </div>

                <h2 className={s.museOverlayTitle}>{selectedEntry.title}</h2>

                {!editOpen ? (
                  <>
                    <p className={s.museOverlaySummary}>{selectedEntry.summary}</p>
                    <pre className={s.museOverlayBody}>{selectedEntry.content}</pre>
                  </>
                ) : (
                  <div className={s.museEditBox}>
                    <textarea
                      className={s.museEditTextarea}
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                    />
                    <div className={s.museEditActions}>
                      <button className={s.museKeepBtn} disabled={editSaving} onClick={() => void saveEdit()}>
                        {editSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button className={s.museDiscardBtn} disabled={editSaving} onClick={() => setEditOpen(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {selectedEntry.changeLog.length > 0 && (
                  <details className={s.museChangeLog}>
                    <summary className={s.museChangeLogSummary}>
                      Change log ({selectedEntry.changeLog.length})
                    </summary>
                    {selectedEntry.changeLog.map(c => (
                      <div key={c.id} className={s.museChangeItem}>
                        <span className={s.museChangeDate}>
                          {new Date(c.changed_at * 1000).toLocaleDateString('en-GB')}
                        </span>
                        {c.change_summary}
                      </div>
                    ))}
                  </details>
                )}

                {selectedEntry.links.length > 0 && (
                  <div className={s.museOverlayLinks}>
                    <span className={s.eyebrow} style={{ display: 'block', marginBottom: 6 }}>
                      Linked entries
                    </span>
                    <div className={s.museLinksRow}>
                      {selectedEntry.links.map(l => {
                        const otherId = l.entry_id_a === selectedEntry.id ? l.entry_id_b : l.entry_id_a
                        return (
                          <button
                            key={l.id}
                            className={s.museLinkChip}
                            onClick={() => {
                              if (l.link_type === 'case') { setSelectedEntryId(null); setSelectedCaseId(otherId) }
                              else setSelectedEntryId(otherId)
                            }}
                          >
                            {l.link_type}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className={s.museLinkToSection}>
                  {!entryLinkOpen ? (
                    <button className={s.museDiscardBtn} onClick={() => setEntryLinkOpen(true)}>Link to…</button>
                  ) : (
                    <div className={s.museRefineBox}>
                      <input
                        className={s.museRefineInput}
                        placeholder="Exact title of entry to link…"
                        value={entryLinkQuery}
                        onChange={e => setEntryLinkQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void submitEntryLink() }}
                      />
                      <button className={s.museKeepBtn} onClick={() => void submitEntryLink()}>Link</button>
                    </div>
                  )}
                  {entryLinkMsg && <p className={s.museBrainDumpMsg}>{entryLinkMsg}</p>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Case overlay ─────────────────────────────────────────────────── */}
      {selectedCaseId && (
        <div className={s.museOverlay} onClick={() => setSelectedCaseId(null)}>
          <div className={s.museOverlayCard} onClick={e => e.stopPropagation()}>
            <button className={s.museOverlayClose} onClick={() => setSelectedCaseId(null)}>✕</button>

            {!selectedCase ? (
              <p className={s.museOverlayLoading}>Loading…</p>
            ) : (
              <>
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

                <div className={s.museOverlayLinks}>
                  <span className={s.eyebrow} style={{ display: 'block', marginBottom: 6 }}>Linked knowledge</span>
                  {selectedCase.linkedEntries.length === 0 ? (
                    <p className={s.musePanelEmpty}>No linked entries yet.</p>
                  ) : (
                    <div className={s.museLinksRow}>
                      {selectedCase.linkedEntries.map(le => (
                        <button
                          key={le.id}
                          className={s.museLinkChip}
                          onClick={() => { setSelectedCaseId(null); setSelectedEntryId(le.id) }}
                        >
                          {le.title}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={s.museLinkToSection}>
                    {!caseLinkOpen ? (
                      <button className={s.museDiscardBtn} onClick={() => setCaseLinkOpen(true)}>Link entry…</button>
                    ) : (
                      <div className={s.museRefineBox}>
                        <input
                          className={s.museRefineInput}
                          placeholder="Exact title of entry to link…"
                          value={caseLinkQuery}
                          onChange={e => setCaseLinkQuery(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') void submitCaseLink() }}
                        />
                        <button className={s.museKeepBtn} onClick={() => void submitCaseLink()}>Link</button>
                      </div>
                    )}
                    {caseLinkMsg && <p className={s.museBrainDumpMsg}>{caseLinkMsg}</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
