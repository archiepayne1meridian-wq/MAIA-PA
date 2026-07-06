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

  // Panel state
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)

  // Graph data
  const [graphNodes, setGraphNodes] = useState<D3Node[]>([])
  const [graphLinks, setGraphLinks] = useState<GraphLink[]>([])

  // Left panel
  const [selectedSector, setSelectedSector] = useState<string | null>(null)
  const [sectorEntries, setSectorEntries] = useState<MuseEntry[]>([])
  const [sectorSearch, setSectorSearch] = useState('')

  // Right panel
  const [pendingItems, setPendingItems] = useState<MusePending[]>([])
  const [confirmLoading, setConfirmLoading] = useState<string | null>(null)
  const [brainDumpText, setBrainDumpText] = useState('')
  const [brainDumpLoading, setBrainDumpLoading] = useState(false)
  const [brainDumpMsg, setBrainDumpMsg] = useState<string | null>(null)

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
      const nodes: D3Node[] = (data.entries ?? []).map(e => ({
        id: e.id, sector: e.sector, title: e.title, summary: e.summary,
        linkCount: countMap[e.id] ?? 0,
      }))
      setGraphNodes(nodes)
      setGraphLinks(links)
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

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleSectorClick(sectorId: string, locked: boolean) {
    if (locked) return
    setSelectedSector(sectorId)
    setSectorSearch('')
    setSectorEntries([])
    void fetchSectorEntries(sectorId)
  }

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

  // ─── Derived ────────────────────────────────────────────────────────────────

  const filteredEntries = sectorEntries.filter(e =>
    !sectorSearch ||
    e.title.toLowerCase().includes(sectorSearch.toLowerCase()) ||
    e.summary.toLowerCase().includes(sectorSearch.toLowerCase()),
  )

  const pendingCount = pendingItems.length

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={s.museWs}>

      {/* ── Back button ─────────────────────────────────────────────────── */}
      <button className={s.museBackBtn} onClick={() => router.push('/dashboard')}>← MAIA</button>

      {/* ── Left tab ────────────────────────────────────────────────────── */}
      <button
        className={`${s.museLeftTab} ${leftOpen ? s.museTabOpen : ''}`}
        onClick={() => setLeftOpen(o => !o)}
        title="Knowledge sectors"
      >
        {leftOpen ? '‹' : '›'}
      </button>

      {/* ── Right tab ───────────────────────────────────────────────────── */}
      <button
        className={`${s.museRightTab} ${rightOpen ? s.museTabOpen : ''}`}
        onClick={() => setRightOpen(o => !o)}
        title="Approvals & brain dump"
      >
        {pendingCount > 0 && <span className={s.museTabBadge}>{pendingCount}</span>}
        {rightOpen ? '›' : '‹'}
      </button>

      {/* ── Brain graph ─────────────────────────────────────────────────── */}
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

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div className={`${s.museLeftPanel} ${leftOpen ? s.museLeftPanelOpen : ''}`}>
        <div className={s.musePanelHead}>
          <span className={s.eyebrow}>Knowledge Sectors</span>
          <button className={s.musePanelClose} onClick={() => setLeftOpen(false)}>✕</button>
        </div>

        <div className={s.museSectorList}>
          {SECTORS.map(sector => (
            <button
              key={sector.id}
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
          ))}
        </div>

        {selectedSector && !SECTORS.find(sec => sec.id === selectedSector)?.locked && (
          <div className={s.museSectorEntries}>
            <div className={s.musePanelSearchWrap}>
              <input
                className={s.musePanelSearch}
                placeholder={`Search ${selectedSector}…`}
                value={sectorSearch}
                onChange={e => setSectorSearch(e.target.value)}
              />
            </div>
            {filteredEntries.length === 0 ? (
              <p className={s.musePanelEmpty}>
                {sectorSearch ? 'No matches.' : `No entries in ${selectedSector} yet.`}
              </p>
            ) : (
              <div className={s.museEntryList}>
                {filteredEntries.map(entry => (
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
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div className={`${s.museRightPanel} ${rightOpen ? s.museRightPanelOpen : ''}`}>
        <div className={s.musePanelHead}>
          <span className={s.eyebrow}>
            Approvals{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </span>
          <button className={s.musePanelClose} onClick={() => setRightOpen(false)}>✕</button>
        </div>

        {/* Approvals queue */}
        <div className={s.museApprovalsQueue}>
          {pendingItems.length === 0 ? (
            <p className={s.musePanelEmpty}>No pending items — all clear.</p>
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
                </div>
              </div>
            ))
          )}
        </div>

        {/* Brain dump */}
        <div className={s.museBrainDump}>
          <span className={s.eyebrow} style={{ display: 'block', marginBottom: 8 }}>Brain Dump</span>
          <textarea
            className={s.museBrainDumpInput}
            placeholder="Paste a thought, insight, article, or anything worth keeping…"
            rows={5}
            value={brainDumpText}
            onChange={e => setBrainDumpText(e.target.value)}
          />
          {brainDumpMsg && <p className={s.museBrainDumpMsg}>{brainDumpMsg}</p>}
          <button
            className={s.museBrainDumpBtn}
            disabled={brainDumpLoading || !brainDumpText.trim()}
            onClick={() => void handleBrainDump()}
          >
            {brainDumpLoading ? 'Processing…' : 'Send to MUSE'}
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
