'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import s from '../dashboard.module.css'
import ContextPanel from '../components/ContextPanel'
import FileDropZone from '../components/FileDropZone'

interface NexusProspect {
  id: string
  last_name: string | null
  first_name: string | null
  company: string | null
  job_role: string | null
  employment_status: string
  lead_channel: string
  country: string
  linkedin_url: string | null
  email: string | null
  phone: string | null
  wash_result: string | null
  wash_reason: string | null
  date_washed: string | null
  rewash_after: string | null
  notes: string | null
  batch: string | null
  created_at: number
  updated_at: number
}

type WashFilter = 'all' | 'green' | 'red' | 'dnc' | 'unwashed'
type SortKey = 'name' | 'company' | 'date_washed'

interface SalesNavCandidate {
  firstName: string
  lastName: string
  company: string | null
  jobRole: string | null
  isDuplicate: boolean
}

const EDITABLE_FIELDS: { key: 'last_name' | 'first_name' | 'company' | 'job_role'; label: string }[] = [
  { key: 'last_name', label: 'Last' },
  { key: 'first_name', label: 'First' },
  { key: 'company', label: 'Company' },
  { key: 'job_role', label: 'Job Role' },
]

const PAGE_SIZE = 50

function rowClass(p: NexusProspect): string {
  if (p.wash_result === 'Green') return s.nexusRowGreen
  if (p.wash_result === 'Red') return s.nexusRowRed
  if (p.wash_result === 'Do Not Contact') return s.nexusRowDnc
  return ''
}

function statusLabel(wash: string | null): string {
  if (wash === 'Green') return 'Green'
  if (wash === 'Red') return 'Rewash'
  if (wash === 'Do Not Contact') return 'DNC'
  return 'Unwashed'
}

function toTSV(rows: NexusProspect[]): string {
  return rows.map(p => [
    p.last_name ?? '', p.first_name ?? '', p.company ?? '', p.job_role ?? '',
    p.employment_status, p.lead_channel, p.country, p.linkedin_url ?? '',
  ].join('\t')).join('\n')
}

export default function NexusWorkspace() {
  const [prospects, setProspects] = useState<NexusProspect[] | null>(null)
  const [filter, setFilter] = useState<WashFilter>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [drawerId, setDrawerId] = useState<string | null>(null)

  const anchorRef = useRef<number | null>(null)
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const draggingRef = useRef(false)
  const gridRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(() => {
    fetch('/api/dashboard/nexus/prospects?filter=all')
      .then(r => r.json() as Promise<{ prospects: NexusProspect[] }>)
      .then(d => setProspects(d.prospects))
      .catch(() => setProspects([]))
  }, [])

  useEffect(() => { load() }, [load])

  function showToast(text: string) {
    setToast(text)
    setTimeout(() => setToast(null), 2800)
  }

  const all = prospects ?? []
  const counts = useMemo(() => ({
    total: all.length,
    green: all.filter(p => p.wash_result === 'Green').length,
    red: all.filter(p => p.wash_result === 'Red').length,
    dnc: all.filter(p => p.wash_result === 'Do Not Contact').length,
    unwashed: all.filter(p => !p.wash_result).length,
  }), [all])

  function pct(n: number): string {
    return counts.total > 0 ? `${Math.round((n / counts.total) * 100)}%` : '0%'
  }

  function selectFilter(f: WashFilter) {
    setFilter(f)
    setPage(0)
    // Red prospects need rewashing periodically — default to oldest-washed-first
    // so the highest-priority rewash candidates sit at the top.
    if (f === 'red') { setSortKey('date_washed'); setSortDir('asc') }
    else { setSortKey('name'); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return all
    if (filter === 'green') return all.filter(p => p.wash_result === 'Green')
    if (filter === 'red') return all.filter(p => p.wash_result === 'Red')
    if (filter === 'dnc') return all.filter(p => p.wash_result === 'Do Not Contact')
    return all.filter(p => !p.wash_result)
  }, [all, filter])

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return filtered
    return filtered.filter(p =>
      `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase().includes(q) ||
      (p.company ?? '').toLowerCase().includes(q),
    )
  }, [filtered, search])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...searched].sort((a, b) => {
      if (sortKey === 'company') return dir * (a.company ?? '').localeCompare(b.company ?? '')
      if (sortKey === 'date_washed') return dir * (a.date_washed ?? '').localeCompare(b.date_washed ?? '')
      return dir * `${a.last_name ?? ''}${a.first_name ?? ''}`.localeCompare(`${b.last_name ?? ''}${b.first_name ?? ''}`)
    })
  }, [searched, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = useMemo(() => sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [sorted, page])

  // Clamp/clear any row selection that no longer makes sense after the
  // visible page changes shape (switching tabs, searching, paging, edits).
  useEffect(() => { setSelection(null); anchorRef.current = null }, [filter, search, sortKey, sortDir, page])
  useEffect(() => { setPage(0) }, [search])

  // ── Excel-style row selection (operates on the current page's rows) ──────

  function onRowMouseDown(index: number, e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('a, input, button')) return
    draggingRef.current = true
    if (e.shiftKey && anchorRef.current !== null) {
      setSelection({ start: Math.min(anchorRef.current, index), end: Math.max(anchorRef.current, index) })
    } else {
      anchorRef.current = index
      setSelection({ start: index, end: index })
    }
  }

  function onRowMouseEnter(index: number) {
    if (!draggingRef.current || anchorRef.current === null) return
    setSelection({ start: Math.min(anchorRef.current, index), end: Math.max(anchorRef.current, index) })
  }

  useEffect(() => {
    function onMouseUp() { draggingRef.current = false }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [])

  useEffect(() => {
    function onCopy(e: ClipboardEvent) {
      const active = document.activeElement as HTMLElement | null
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
      if (!selection) return
      const rows = paginated.slice(selection.start, selection.end + 1)
      if (rows.length === 0) return
      e.preventDefault()
      const tsv = toTSV(rows)
      e.clipboardData?.setData('text/plain', tsv)
      if (!e.clipboardData) void navigator.clipboard.writeText(tsv)
      showToast(`${rows.length} prospect${rows.length === 1 ? '' : 's'} copied — ready to paste`)
    }
    document.addEventListener('copy', onCopy)
    return () => document.removeEventListener('copy', onCopy)
  }, [selection, paginated])

  // ── Inline cell editing ───────────────────────────────────────────────────

  function startEdit(p: NexusProspect, field: string, current: string | null) {
    setEditing({ id: p.id, field })
    setEditValue(current ?? '')
  }

  async function commitEdit() {
    if (!editing) return
    const { id, field } = editing
    setEditing(null)
    const current = all.find(p => p.id === id)
    if (!current || (current as unknown as Record<string, string | null>)[field] === editValue) return
    setProspects(prev => prev?.map(p => p.id === id ? { ...p, [field]: editValue } : p) ?? prev)
    try {
      await fetch(`/api/dashboard/nexus/prospects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: editValue }),
      })
    } catch { load() }
  }

  async function saveDrawerField(id: string, field: string, value: string) {
    setProspects(prev => prev?.map(p => p.id === id ? { ...p, [field]: value } : p) ?? prev)
    try {
      await fetch(`/api/dashboard/nexus/prospects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
    } catch { load() }
  }

  async function removeProspect(id: string) {
    await fetch(`/api/dashboard/nexus/prospects/${id}`, { method: 'DELETE' })
    showToast('Removed — set to Do Not Contact')
    setDrawerId(null)
    load()
  }

  const drawerProspect = drawerId ? all.find(p => p.id === drawerId) ?? null : null

  return (
    <div className={s.fullPage}>
      <div className={s.fullPageTopbar}>
        <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
        <span className={s.fpPageTitle}>PROSPECTS</span>
        <span className={s.fpPageSubtitle}>NEXUS · List Management</span>
      </div>

      <div className={s.fullPageCols}>
        <div className={s.nexusCol}>

          {/* Summary bar — clickable chips */}
          <div className={s.nexusSummaryBar}>
            <button className={`${s.nexusSummaryChip} ${filter === 'all' ? s.nexusSummaryChipActive : ''}`} onClick={() => selectFilter('all')}>
              Total: {counts.total}
            </button>
            <button className={`${s.nexusSummaryChip} ${s.nexusSummaryChipGreen} ${filter === 'green' ? s.nexusSummaryChipActive : ''}`} onClick={() => selectFilter('green')}>
              Green: {counts.green}
            </button>
            <button className={`${s.nexusSummaryChip} ${s.nexusSummaryChipRed} ${filter === 'red' ? s.nexusSummaryChipActive : ''}`} onClick={() => selectFilter('red')}>
              Red: {counts.red}
            </button>
            <button className={`${s.nexusSummaryChip} ${s.nexusSummaryChipDnc} ${filter === 'dnc' ? s.nexusSummaryChipActive : ''}`} onClick={() => selectFilter('dnc')}>
              DNC: {counts.dnc}
            </button>
            <button className={`${s.nexusSummaryChip} ${filter === 'unwashed' ? s.nexusSummaryChipActive : ''}`} onClick={() => selectFilter('unwashed')}>
              Unwashed: {counts.unwashed}
            </button>
          </div>

          {/* Import widgets */}
          <div className={s.nexusImportRow}>
            <SalesNavPanel showToast={showToast} onDone={load} existing={all} />
            <WashXlsxPanel showToast={showToast} onDone={load} />
          </div>

          {/* Sheet tabs */}
          <div className={s.nexusSheetTabs}>
            {(['all', 'green', 'red', 'unwashed', 'dnc'] as WashFilter[]).map(f => {
              const activeClass = f === 'green' ? s.nexusSheetTabActiveGreen : f === 'red' ? s.nexusSheetTabActiveRed : f === 'dnc' ? s.nexusSheetTabActiveDnc : ''
              const emoji = f === 'green' ? '🟢 ' : f === 'red' ? '🔴 ' : f === 'dnc' ? '⛔ ' : f === 'unwashed' ? '⚪ ' : ''
              const label = f === 'all' ? 'All' : f === 'dnc' ? 'DNC' : f[0].toUpperCase() + f.slice(1)
              const count = f === 'all' ? counts.total : f === 'green' ? counts.green : f === 'red' ? counts.red : f === 'dnc' ? counts.dnc : counts.unwashed
              return (
                <button
                  key={f}
                  className={`${s.nexusSheetTab} ${filter === f ? `${s.nexusSheetTabActive} ${activeClass}` : ''}`}
                  onClick={() => selectFilter(f)}
                >
                  {emoji}{label} ({count})
                </button>
              )
            })}
          </div>

          {filter === 'red' && (
            <div className={s.nexusRedBanner}>
              ⚠️ These prospects were previously rejected. Upload a new wash results file to update them — they may come through as Green on a second wash.
            </div>
          )}

          {/* Search + sort */}
          <div className={s.nexusSearchRow}>
            <input
              className={s.nexusSearchInput}
              placeholder="Search name or company…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className={s.nexusSortSelect} value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
              <option value="name">Sort: Name</option>
              <option value="company">Sort: Company</option>
              <option value="date_washed">Sort: Date Washed</option>
            </select>
            <select className={s.nexusSortSelect} value={sortDir} onChange={e => setSortDir(e.target.value as 'asc' | 'desc')}>
              <option value="asc">A–Z / Oldest</option>
              <option value="desc">Z–A / Newest</option>
            </select>
          </div>

          <div className={s.nexusGridWrap} ref={gridRef}>
            <table className={s.nexusTable}>
              <thead>
                <tr>
                  <th>Last</th><th>First</th><th>Company</th><th>Job Role</th><th>Status</th><th>Date Washed</th><th>LinkedIn</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {prospects === null ? (
                  <tr><td colSpan={8} style={{ color: 'var(--text-dim)' }}>Loading…</td></tr>
                ) : paginated.length === 0 ? (
                  <tr><td colSpan={8} style={{ color: 'var(--text-dim)' }}>No prospects in this view.</td></tr>
                ) : (
                  paginated.map((p, i) => {
                    const selected = selection && i >= selection.start && i <= selection.end
                    return (
                      <tr
                        key={p.id}
                        className={`${s.nexusRow} ${rowClass(p)} ${selected ? s.nexusRowSelected : ''}`}
                        onMouseDown={e => onRowMouseDown(i, e)}
                        onMouseEnter={() => onRowMouseEnter(i)}
                      >
                        {EDITABLE_FIELDS.map(f => (
                          <td
                            key={f.key}
                            className={f.key === 'last_name' || f.key === 'first_name' ? s.nexusNameCell : ''}
                            onDoubleClick={() => startEdit(p, f.key, p[f.key])}
                          >
                            {editing?.id === p.id && editing.field === f.key ? (
                              <input
                                className={s.nexusCellInput}
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
                              />
                            ) : (p[f.key] || '—')}
                          </td>
                        ))}
                        <td>{statusLabel(p.wash_result)}</td>
                        <td>{p.date_washed || '—'}</td>
                        <td>
                          {p.linkedin_url ? (
                            <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className={s.nexusLink} onClick={e => e.stopPropagation()}>
                              Profile ↗
                            </a>
                          ) : <span className={s.nexusEmptyLink}>—</span>}
                        </td>
                        <td>
                          <button className={s.nexusEditActionBtn} onClick={() => setDrawerId(p.id)}>Edit</button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className={s.nexusPaginationRow}>
            <button className={s.nexusPageBtn} onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Prev</button>
            <span>Page {page + 1} of {pageCount} · {sorted.length} prospect{sorted.length === 1 ? '' : 's'}</span>
            <button className={s.nexusPageBtn} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>Next →</button>
          </div>
        </div>

        <ContextPanel agent="prospects" contextTitle="PROSPECTS" />
      </div>

      {toast && <div className={s.nexusToast}>{toast}</div>}

      {drawerProspect && (
        <ProspectDrawer
          prospect={drawerProspect}
          onClose={() => setDrawerId(null)}
          onSave={saveDrawerField}
          onRemove={() => void removeProspect(drawerProspect.id)}
        />
      )}
    </div>
  )
}

// ── Sales Nav import — inline panel, single-click import (no modal) ─────────

function SalesNavPanel({ showToast, onDone, existing }: {
  showToast: (t: string) => void
  onDone: () => void
  existing: NexusProspect[]
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)

  async function importNames() {
    if (!text.trim()) return
    setBusy(true)
    setResult(null)
    try {
      const parseRes = await fetch('/api/dashboard/nexus/parse-salesnav', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      })
      const parsed = await parseRes.json() as { candidates: SalesNavCandidate[]; found: number; duplicates: number; readyToAdd: number }

      const confirmRes = await fetch('/api/dashboard/nexus/parse-salesnav', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, candidates: parsed.candidates }),
      })
      const confirmed = await confirmRes.json() as { added: number }

      setResult({ imported: confirmed.added, skipped: parsed.duplicates })
      setText('')
      setCollapsed(true)
      showToast(`${confirmed.added} prospect${confirmed.added === 1 ? '' : 's'} imported`)
      onDone()
    } catch {
      showToast('Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.nexusImportPanel}>
      <div className={s.nexusImportHead}>
        <span className={s.nexusImportTitle}>📋 Sales Nav Import</span>
        {result && (
          <button className={s.nexusImportCollapseBtn} onClick={() => setCollapsed(c => !c)}>
            {collapsed ? '▸ expand' : '▾ collapse'}
          </button>
        )}
      </div>

      {collapsed && result ? (
        <div className={s.nexusImportDoneBadge}>✓ {result.imported} imported, {result.skipped} skipped (already in DB)</div>
      ) : (
        <>
          <textarea
            className={s.nexusTextarea}
            placeholder="Paste Sales Navigator results here…"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={8}
          />
          <button className={`${s.nexusBtn} ${s.nexusBtnPrimary}`} onClick={() => void importNames()} disabled={busy || !text.trim()}>
            {busy ? 'Importing…' : 'Import names'}
          </button>
          {result && (
            <div className={s.nexusImportResult}>{result.imported} imported, {result.skipped} skipped (already in DB)</div>
          )}
        </>
      )}
    </div>
  )
}

// ── Wash Results import — xlsx upload, inline panel (no modal) ──────────────

function WashXlsxPanel({ showToast, onDone }: { showToast: (t: string) => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [result, setResult] = useState<{ updated: number; unmatched: string[] } | null>(null)

  async function handleFile(file: File) {
    setBusy(true)
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/dashboard/nexus/import-wash-xlsx', { method: 'POST', body: formData })
      const data = await res.json() as { updated?: number; unmatched?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setResult({ updated: data.updated ?? 0, unmatched: data.unmatched ?? [] })
      setCollapsed(true)
      showToast(`${data.updated ?? 0} wash results updated`)
      onDone()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.nexusImportPanel}>
      <div className={s.nexusImportHead}>
        <span className={s.nexusImportTitle}>📊 Wash Results Upload</span>
        {result && (
          <button className={s.nexusImportCollapseBtn} onClick={() => setCollapsed(c => !c)}>
            {collapsed ? '▸ expand' : '▾ collapse'}
          </button>
        )}
      </div>

      {collapsed && result ? (
        <div className={s.nexusImportDoneBadge}>✓ {result.updated} updated</div>
      ) : (
        <>
          <FileDropZone
            accept={['xlsx', 'xls']}
            onFile={file => void handleFile(file)}
            onRejected={() => showToast('Only .xlsx files are accepted')}
            disabled={busy}
            icon="📊"
            label={busy ? 'Uploading…' : 'Drop your wash results .xlsx here or click'}
            hint=".xlsx only"
          />
          {result && (
            <div className={s.nexusImportResult}>
              {result.updated} updated.
              {result.unmatched.length > 0 && (
                <>
                  {' '}Unmatched:
                  <div className={s.nexusImportUnmatchedChips}>
                    {result.unmatched.map((name, i) => <span key={i} className={s.nexusImportUnmatchedChip}>{name}</span>)}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function ProspectDrawer({ prospect, onClose, onSave, onRemove }: {
  prospect: NexusProspect
  onClose: () => void
  onSave: (id: string, field: string, value: string) => void
  onRemove: () => void
}) {
  const [values, setValues] = useState({
    first_name: prospect.first_name ?? '', last_name: prospect.last_name ?? '',
    company: prospect.company ?? '', job_role: prospect.job_role ?? '',
    linkedin_url: prospect.linkedin_url ?? '', email: prospect.email ?? '',
    phone: prospect.phone ?? '', notes: prospect.notes ?? '',
  })

  function field(key: keyof typeof values, label: string) {
    return (
      <div className={s.nexusDrawerField}>
        <span className={s.nexusDrawerLabel}>{label}</span>
        <input
          className={s.nexusDrawerInput}
          value={values[key]}
          onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
          onBlur={() => onSave(prospect.id, key, values[key])}
        />
      </div>
    )
  }

  return (
    <div className={s.nexusDrawerOverlay} onClick={onClose}>
      <div className={s.nexusDrawer} onClick={e => e.stopPropagation()}>
        <div className={s.nexusDrawerHead}>
          <span className={s.nexusDrawerTitle}>{prospect.first_name} {prospect.last_name}</span>
          <button className={s.nexusDrawerClose} onClick={onClose}>✕</button>
        </div>

        {field('first_name', 'First Name')}
        {field('last_name', 'Last Name')}
        {field('company', 'Company')}
        {field('job_role', 'Job Role')}
        {field('linkedin_url', 'LinkedIn URL')}
        {field('email', 'Email')}
        {field('phone', 'Phone')}
        {field('notes', 'Notes')}

        <div className={s.nexusDrawerField}>
          <span className={s.nexusDrawerLabel}>Wash Result</span>
          <div className={s.nexusDrawerReadonly}>{statusLabel(prospect.wash_result)}</div>
        </div>
        {prospect.wash_reason && (
          <div className={s.nexusDrawerField}>
            <span className={s.nexusDrawerLabel}>Wash Reason</span>
            <div className={s.nexusDrawerReadonly}>{prospect.wash_reason}</div>
          </div>
        )}
        {prospect.date_washed && (
          <div className={s.nexusDrawerField}>
            <span className={s.nexusDrawerLabel}>Date Washed</span>
            <div className={s.nexusDrawerReadonly}>{prospect.date_washed}</div>
          </div>
        )}
        {prospect.wash_result === 'Red' && prospect.rewash_after && (
          <div className={s.nexusDrawerField}>
            <span className={s.nexusDrawerLabel}>Rewash After</span>
            <div className={s.nexusDrawerReadonly}>{prospect.rewash_after}</div>
          </div>
        )}

        <div className={s.nexusDrawerActions}>
          <button className={`${s.nexusBtn} ${s.nexusBtnGhost}`} onClick={onRemove}>Remove (→ DNC)</button>
        </div>
      </div>
    </div>
  )
}
