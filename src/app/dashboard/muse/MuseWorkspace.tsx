'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import s from '../dashboard.module.css'
import type { MuseEntry, MusePending, MuseEntryFull } from '../../../../tools/muse'

// ─── Sector definitions ───────────────────────────────────────────────────────

const SECTORS = [
  { id: 'Training',           label: 'Training',           color: '#5B9FE0', locked: false },
  { id: 'Markets',            label: 'Markets',            color: '#7BC99A', locked: false },
  { id: 'Products',           label: 'Products',           color: '#B87FD4', locked: false },
  { id: 'Regulations',        label: 'Regulations',        color: '#E07A5F', locked: false },
  { id: 'Sales & Prospecting',label: 'Sales & Prospecting',color: '#E0B341', locked: false },
  { id: 'Expat Knowledge',    label: 'Expat Knowledge',    color: '#5BC0C0', locked: false },
  { id: 'Performance',        label: 'Performance',        color: '#8AA9F0', locked: false },
  { id: 'Client Intelligence',label: 'Client Intelligence',color: '#59616D', locked: true  },
] as const

const SECTOR_COLOR: Record<string, string> = Object.fromEntries(
  SECTORS.map(s => [s.id, s.color]),
)

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
  // SimulationNodeDatum properties
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

  // Left panel
  const [selectedSector, setSelectedSector] = useState<string | null>(null)
  const [sectorEntries, setSectorEntries] = useState<MuseEntry[]>([])
  const [sectorSearch, setSectorSearch] = useState('')

  // Right panel — approvals
  const [pendingItems, setPendingItems] = useState<MusePending[]>([])
  const [confirmLoading, setConfirmLoading] = useState<string | null>(null)
  const [refineOpenId, setRefineOpenId] = useState<string | null>(null)
  const [refineText, setRefineText] = useState('')
  const [refineLoading, setRefineLoading] = useState<string | null>(null)

  // Right panel — brain dump
  const [brainDumpText, setBrainDumpText] = useState('')
  const [brainDumpLoading, setBrainDumpLoading] = useState(false)
  const [brainDumpMsg, setBrainDumpMsg] = useState<string | null>(null)
  const [micActive, setMicActive] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Entry overlay
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<MuseEntryFull | null>(null)

  // Error
  const [error, setError] = useState<string | null>(null)

  // ─── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    void fetchGraph()
    void fetchPending()
  }, [])

  useEffect(() => {
    if (!selectedEntryId) { setSelectedEntry(null); return }
    void fetchEntry(selectedEntryId)
  }, [selectedEntryId])

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
      const nodes: D3Node[] = entries.map(e => ({
        id: e.id, sector: e.sector, title: e.title, summary: e.summary,
        linkCount: countMap[e.id] ?? 0,
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

  async function fetchSectorEntries(sector: string) {
    try {
      const res = await fetch(`/api/dashboard/muse?sector=${encodeURIComponent(sector)}`)
      if (!res.ok) return
      const data = await res.json() as { entries?: MuseEntry[] }
      setSectorEntries(data.entries ?? [])
    } catch {
      // non-fatal
    }
  }

  // ─── D3 render ─────────────────────────────────────────────────────────────

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
      .on('click', (_event: MouseEvent, d: D3Node) => { setSelectedEntryId(d.id) })

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

  // ─── Handlers — sector nav ──────────────────────────────────────────────────

  function handleSectorClick(sectorId: string, locked: boolean) {
    if (locked) return
    if (selectedSector === sectorId) {
      setSelectedSector(null)
      setSectorEntries([])
      return
    }
    setSelectedSector(sectorId)
    setSectorEntries([])
    void fetchSectorEntries(sectorId)
  }

  // ─── Handlers — approvals ───────────────────────────────────────────────────

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

  // ─── Handlers — brain dump ──────────────────────────────────────────────────

  async function handleBrainDump() {
    if (!brainDumpText.trim()) return
    setBrainDumpLoading(true)
    setBrainDumpMsg(null)
    try {
      const res = await fetch('/api/dashboard/muse/braindump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: brainDumpText }),
      })
      const data = await res.json() as { message?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Submission failed')
      setBrainDumpMsg(data.message ?? 'Received — check approvals queue.')
      setBrainDumpText('')
      await fetchPending()
    } catch (err) {
      setBrainDumpMsg(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setBrainDumpLoading(false)
    }
  }

  function handleBrainDumpMic() {
    if (micActive) {
      recogRef.current?.abort()
      recogRef.current = null
      setMicActive(false)
      return
    }

    const SR = getSpeechRecognition()
    if (!SR) {
      setVoiceError('Voice unavailable — type instead')
      return
    }

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
      setBrainDumpText(prev => prev.trim() ? `${prev.trim()} ${transcript}` : transcript)
    }

    recog.onerror = (e) => {
      console.warn('[muse] speech error', e.error)
      recogRef.current = null
      setMicActive(false)
      if (e.error === 'not-allowed') {
        setVoiceError('Mic permission denied — type instead')
      }
    }

    recog.onend = () => {
      recogRef.current = null
      setMicActive(false)
    }

    recog.start()
  }

  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    })
  }

  async function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!/\.(pdf|txt|md)$/i.test(file.name)) {
      setBrainDumpMsg('Only .pdf, .txt, or .md files are supported.')
      return
    }
    try {
      const text = await readFileAsText(file)
      setBrainDumpText(prev => prev.trim() ? `${prev.trim()}\n\n${text}` : text)
      setBrainDumpMsg(`Loaded "${file.name}" — review and submit below.`)
    } catch {
      setBrainDumpMsg(`Couldn't read "${file.name}".`)
    }
  }

  // ─── Derived ────────────────────────────────────────────────────────────────

  const searchQuery = sectorSearch.trim().toLowerCase()
  const searchResults = searchQuery
    ? allEntries.filter(e =>
        e.title.toLowerCase().includes(searchQuery) ||
        e.summary.toLowerCase().includes(searchQuery),
      )
    : []

  const pendingCount = pendingItems.length

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={s.museWs}>

      {/* ── Left panel — sector navigation (permanent) ──────────────────────── */}
      <div className={s.musePermLeft}>
        <div className={s.musePanelHead}>
          <span className={s.eyebrow}>Sector Navigation</span>
        </div>

        <div className={s.musePanelSearchWrap}>
          <input
            className={s.museSectorSearch}
            placeholder="Search all sectors…"
            value={sectorSearch}
            onChange={e => setSectorSearch(e.target.value)}
          />
        </div>

        {searchQuery ? (
          searchResults.length === 0 ? (
            <p className={s.musePanelEmpty}>No matches.</p>
          ) : (
            <div className={s.museEntryList}>
              {searchResults.map(entry => (
                <button
                  key={entry.id}
                  className={s.museEntryRow}
                  onClick={() => setSelectedEntryId(entry.id)}
                >
                  <span className={s.museSectorDot} style={{ background: SECTOR_COLOR[entry.sector] ?? '#8AA9F0' }} />
                  <span className={s.museEntryTitle}>{entry.title}</span>
                </button>
              ))}
            </div>
          )
        ) : (
          <div className={s.museSectorList}>
            {SECTORS.map(sector => (
              <div key={sector.id}>
                <button
                  className={[
                    s.museSectorItem,
                    selectedSector === sector.id ? s.museSectorActive : '',
                    sector.locked ? s.museSectorLocked : '',
                  ].join(' ')}
                  onClick={() => handleSectorClick(sector.id, sector.locked)}
                  title={sector.locked ? 'Available after compliance conversation' : undefined}
                >
                  <span className={s.museSectorDot} style={{ background: sector.color }} />
                  <span className={s.museSectorLabel}>{sector.label}</span>
                  {sector.locked && <span className={s.museLock}>🔒</span>}
                </button>

                {selectedSector === sector.id && !sector.locked && (
                  <div className={s.museEntryList}>
                    {sectorEntries.length === 0 ? (
                      <p className={s.musePanelEmpty}>No entries in {sector.label} yet.</p>
                    ) : (
                      sectorEntries.map(entry => (
                        <button
                          key={entry.id}
                          className={s.museEntryRow}
                          onClick={() => setSelectedEntryId(entry.id)}
                        >
                          <span className={s.museEntryTitle}>{entry.title}</span>
                          <span className={s.museEntryDate}>
                            {new Date(entry.last_updated * 1000).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'short',
                            })}
                          </span>
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

      {/* ── Centre panel — brain graph (permanent) ──────────────────────────── */}
      <div className={s.musePermCentre}>
        <button className={s.museBackBtn} onClick={() => router.push('/dashboard')}>← MAIA</button>

        <div className={s.museBrainContainer}>
          {graphNodes.length === 0 ? (
            <div className={s.museEmptyState}>
              <div className={s.museEmptyIcon}>🧠</div>
              <p className={s.museEmptyTitle}>Your knowledge brain is empty — start adding entries to see it grow</p>
              <p className={s.museEmptyText}>Use the brain dump panel or say &quot;MUSE, file this:&quot; in Slack</p>
            </div>
          ) : (
            <svg ref={svgRef} className={s.museBrainSvg} />
          )}
        </div>
      </div>

      {/* ── Right panel — approvals + brain dump (permanent) ────────────────── */}
      <div className={s.musePermRight}>
        <div className={s.musePanelHead}>
          <span className={s.eyebrow}>
            Approvals{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </span>
        </div>

        {/* Approvals queue */}
        <div className={s.museApprovalsQueue}>
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

        {/* Brain dump */}
        <div className={s.museBrainDump}>
          <span className={s.eyebrow} style={{ display: 'block', marginBottom: 8 }}>Brain Dump</span>
          <textarea
            className={s.museBrainDumpInput}
            style={{ height: 80 }}
            placeholder="Type, paste, or speak anything..."
            value={brainDumpText}
            onChange={e => setBrainDumpText(e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className={`${s.museBrainDumpMic} ${micActive ? s.active : ''}`}
              onClick={handleBrainDumpMic}
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
            style={dragOver ? { borderColor: 'var(--accent-deep)', color: 'var(--accent)' } : undefined}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => void handleFileDrop(e)}
          >
            Drop a PDF or file
          </div>

          {brainDumpMsg && <p className={s.museBrainDumpMsg}>{brainDumpMsg}</p>}
          <button
            className={s.museBrainDumpBtn}
            style={{ alignSelf: 'stretch', textAlign: 'center' }}
            disabled={brainDumpLoading || !brainDumpText.trim()}
            onClick={() => void handleBrainDump()}
          >
            {brainDumpLoading ? 'Processing…' : 'File to MUSE'}
          </button>
        </div>
      </div>

      {/* ── Entry overlay ────────────────────────────────────────────────── */}
      {selectedEntryId && (
        <div
          className={s.museOverlay}
          onClick={() => setSelectedEntryId(null)}
        >
          <div
            className={s.museOverlayCard}
            onClick={e => e.stopPropagation()}
          >
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
                </div>

                <h2 className={s.museOverlayTitle}>{selectedEntry.title}</h2>
                <p className={s.museOverlaySummary}>{selectedEntry.summary}</p>
                <pre className={s.museOverlayBody}>{selectedEntry.content}</pre>

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
                        const otherId = l.entry_id_a === selectedEntry.id
                          ? l.entry_id_b
                          : l.entry_id_a
                        return (
                          <button
                            key={l.id}
                            className={s.museLinkChip}
                            onClick={() => setSelectedEntryId(otherId)}
                          >
                            {l.link_type}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
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
