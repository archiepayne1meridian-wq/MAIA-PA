'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import s from '../dashboard.module.css'
import ContextPanel from '../components/ContextPanel'

interface NexusProspect {
  id: string
  last_name: string | null
  first_name: string | null
  company: string | null
  job_role: string | null
  employment_status: string
  employment_type: string | null
  lead_channel: string
  country: string
  linkedin_url: string | null
  email: string | null
  phone: string | null
  wash_result: string | null
  wash_category: string | null
  wash_reason: string | null
  date_washed: string | null
  rewash_after: string | null
  conflicting_advisor: string | null
  notes: string | null
  batch: string | null
  flagged: number
  created_at: number
  updated_at: number
  // Computed server-side (GET /api/dashboard/nexus/prospects), never stored —
  // null when company is blank (not applicable), else true/false against the
  // live map_companies table.
  company_on_map: boolean | null
}

const EMPLOYMENT_TYPES = ['Controlling Director', 'Director', 'Employee', 'Self-Employed'] as const
type EmploymentType = typeof EMPLOYMENT_TYPES[number]

const LEAD_CHANNELS = ['Cold - LinkedIn', 'Cold - Call', 'Webinar', 'Referral', 'Other']

type WashFilter = 'all' | 'green' | 'red' | 'dnc' | 'others_client' | 'unwashed'
type SortKey = 'name' | 'company' | 'date_washed' | 'created_at'
type CellPos = { row: number; col: number }

interface SalesNavCandidate {
  firstName: string
  lastName: string
  company: string | null
  jobRole: string | null
  isDuplicate: boolean
  flagged: boolean
}

// First Name, Last Name, Job Title, Company, LinkedIn URL, Wash Result, Date Washed, Employment Type, Lead Source, Country
const COL_COUNT = 10

// Derives the 5-bucket status from wash_result + wash_category. The Claude
// wash-sheet parser (wash-results route) always sets both; the older plain
// 3-column paste (import-wash-paste) only ever sets wash_result — those rows
// fall through to the legacy mapping below, which can't distinguish
// "others' client" from a generic DNC since that paste format never carried
// the distinction in the first place.
function statusOf(p: NexusProspect): Exclude<WashFilter, 'all'> {
  if (!p.wash_result) return 'unwashed'
  if (p.wash_category === 'ok_to_contact') return 'green'
  if (p.wash_category === 'others_client') return 'others_client'
  if (p.wash_category === 'pool_conflict' || p.wash_category === 'redlisted_company') return 'red'
  if (p.wash_category === 'dnc') return 'dnc'
  if (p.wash_result === 'Green') return 'green'
  if (p.wash_result === 'Red') return 'red'
  return 'dnc'
}

function rowClass(p: NexusProspect): string {
  const st = statusOf(p)
  if (st === 'green') return s.nexusRowGreen
  if (st === 'red') return s.nexusRowRed
  if (st === 'dnc') return s.nexusRowDnc
  if (st === 'others_client') return s.nexusRowOthersClient
  return ''
}

function statusLabelOf(p: NexusProspect): string {
  const st = statusOf(p)
  if (st === 'green') return 'Green'
  if (st === 'red') return 'Rewash'
  if (st === 'dnc') return 'DNC'
  if (st === 'others_client') return "Others' Client"
  return 'Unwashed'
}

function washPillOf(p: NexusProspect): { emoji: string; label: string; cls: string } {
  const st = statusOf(p)
  if (st === 'green') return { emoji: '🟢', label: 'Green', cls: s.nexusPillGreen }
  if (st === 'red') return { emoji: '🔴', label: 'Red', cls: s.nexusPillRed }
  if (st === 'dnc') return { emoji: '⛔', label: 'DNC', cls: s.nexusPillDnc }
  if (st === 'others_client') return { emoji: '👤', label: "Others'", cls: s.nexusPillOthersClient }
  return { emoji: '⬜', label: '—', cls: s.nexusPillNone }
}

function employmentPillOf(p: NexusProspect): { label: string; cls: string } {
  if (p.employment_type === 'Controlling Director') return { label: 'Controlling Director', cls: s.nexusPillMd }
  if (p.employment_type === 'Director') return { label: 'Director', cls: s.nexusPillDirector }
  if (p.employment_type === 'Self-Employed') return { label: 'Self-Employed', cls: s.nexusPillSelfEmployed }
  if (p.employment_type === 'Employee') return { label: 'Employee', cls: s.nexusPillEmployee }
  return { label: '—', cls: s.nexusPillNone }
}

// Plain-text value for a given column, in TSV copy order — used for clipboard
// output only, independent of how each cell is rendered on screen (e.g. the
// Wash Result pill shows an emoji; the copy value is just "Green"/"Red"/"DNC").
function cellCopyValue(p: NexusProspect, col: number): string {
  switch (col) {
    case 0: return p.first_name ?? ''
    case 1: return p.last_name ?? ''
    case 2: return p.job_role ?? ''
    case 3: return p.company ?? ''
    case 4: return p.linkedin_url ?? ''
    case 5: { const st = statusOf(p); return st === 'unwashed' ? '' : st === 'others_client' ? "Others' Client" : washPillOf(p).label }
    case 6: return p.date_washed ?? ''
    case 7: return p.employment_type ?? ''
    case 8: return p.lead_channel
    case 9: return p.country
    default: return ''
  }
}

function buildTSV(rows: NexusProspect[], anchor: CellPos, focus: CellPos): string {
  const r0 = Math.min(anchor.row, focus.row)
  const r1 = Math.max(anchor.row, focus.row)
  const c0 = Math.min(anchor.col, focus.col)
  const c1 = Math.max(anchor.col, focus.col)
  const lines: string[] = []
  for (let r = r0; r <= r1; r++) {
    const p = rows[r]
    if (!p) continue
    const cells: string[] = []
    for (let c = c0; c <= c1; c++) cells.push(cellCopyValue(p, c))
    lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}

// Cosmetic-only reformat for display — the upload API only returns unmatched
// names as a plain "First Last" string, so this never touches stored data.
function unmatchedDisplay(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  const [first, ...rest] = parts
  return `${rest.join(' ')}, ${first}`
}

export default function NexusWorkspace() {
  const [prospects, setProspects] = useState<NexusProspect[] | null>(null)
  const [filter, setFilter] = useState<WashFilter>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [toast, setToast] = useState<string | null>(null)
  const [drawerId, setDrawerId] = useState<string | null>(null)

  const [salesNavOpen, setSalesNavOpen] = useState(false)
  const [washUploadOpen, setWashUploadOpen] = useState(false)
  const [contextRefreshKey, setContextRefreshKey] = useState(0)

  const [anchor, setAnchor] = useState<CellPos | null>(null)
  const [focus, setFocus] = useState<CellPos | null>(null)
  const draggingRef = useRef(false)

  const [overridingId, setOverridingId] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'lead_channel' | 'country' } | null>(null)

  const load = useCallback(() => {
    setContextRefreshKey(k => k + 1)
    fetch('/api/dashboard/nexus/prospects?filter=all')
      .then(r => r.json() as Promise<{ prospects: NexusProspect[] }>)
      .then(d => setProspects(d.prospects))
      .catch(() => setProspects([]))
  }, [])

  useEffect(() => { load() }, [load])

  // Silent auto-fill, every page load — no button, no confirm dialog. Just
  // fills whatever's still blank with the defaults; a prospect that already
  // has a value is never touched. Runs once per load; harmless to re-run
  // since it's a no-op once nothing's blank.
  useEffect(() => {
    let cancelled = false
    async function autofill() {
      for (const [field, value] of [['lead_channel', 'Cold - LinkedIn'], ['country', 'Switzerland']] as const) {
        const result = await fetch('/api/dashboard/nexus/bulk-set', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, value }),
        }).then(r => r.json() as Promise<{ updated?: number }>).catch(() => null)
        if (cancelled) return
        if (result?.updated) load()
      }
    }
    void autofill()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function showToast(text: string) {
    setToast(text)
    setTimeout(() => setToast(null), 2800)
  }

  async function saveInlineField(id: string, field: 'lead_channel' | 'country', value: string) {
    setEditingCell(null)
    setProspects(prev => prev?.map(p => p.id === id ? { ...p, [field]: value } : p) ?? prev)
    try {
      await fetch(`/api/dashboard/nexus/prospects/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }),
      })
    } catch { load() }
  }

  async function overrideEmploymentType(id: string, value: EmploymentType) {
    setOverridingId(null)
    setProspects(prev => prev?.map(p => p.id === id ? { ...p, employment_type: value } : p) ?? prev)
    try {
      await fetch(`/api/dashboard/nexus/prospects/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employment_type: value }),
      })
    } catch { load() }
  }

  const all = prospects ?? []
  const counts = useMemo(() => ({
    total: all.length,
    green: all.filter(p => statusOf(p) === 'green').length,
    red: all.filter(p => statusOf(p) === 'red').length,
    dnc: all.filter(p => statusOf(p) === 'dnc').length,
    others_client: all.filter(p => statusOf(p) === 'others_client').length,
    unwashed: all.filter(p => statusOf(p) === 'unwashed').length,
  }), [all])

  function selectFilter(f: WashFilter) {
    setFilter(f)
    // Red prospects need rewashing periodically — default to oldest-washed-first
    // so the highest-priority rewash candidates sit at the top.
    if (f === 'red') { setSortKey('date_washed'); setSortDir('asc') }
    else { setSortKey('created_at'); setSortDir('desc') }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return all
    return all.filter(p => statusOf(p) === filter)
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
      if (sortKey === 'created_at') return dir * (a.created_at - b.created_at)
      return dir * `${a.last_name ?? ''}${a.first_name ?? ''}`.localeCompare(`${b.last_name ?? ''}${b.first_name ?? ''}`)
    })
  }, [searched, sortKey, sortDir])

  function headerSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  // Quick toggle between the two most common views — label describes the
  // CURRENT state; clicking flips to the other one.
  function toggleSortOrder() {
    if (sortKey === 'created_at' && sortDir === 'desc') { setSortKey('name'); setSortDir('asc') }
    else { setSortKey('created_at'); setSortDir('desc') }
  }

  function sortArrow(key: SortKey): string {
    return sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
  }

  // ── Excel-style cell selection ────────────────────────────────────────────

  useEffect(() => { setAnchor(null); setFocus(null) }, [filter, search, sortKey, sortDir])

  useEffect(() => {
    function onMouseUp() { draggingRef.current = false }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [])

  function onCellMouseDown(row: number, col: number, e: React.MouseEvent) {
    if (e.button !== 0) return
    if (e.shiftKey && anchor) {
      setFocus({ row, col })
    } else {
      setAnchor({ row, col })
      setFocus({ row, col })
    }
    draggingRef.current = true
  }

  function onCellMouseEnter(row: number, col: number) {
    if (draggingRef.current) setFocus({ row, col })
  }

  function selCls(row: number, col: number): string {
    if (!anchor || !focus) return ''
    const r0 = Math.min(anchor.row, focus.row)
    const r1 = Math.max(anchor.row, focus.row)
    const c0 = Math.min(anchor.col, focus.col)
    const c1 = Math.max(anchor.col, focus.col)
    if (row < r0 || row > r1 || col < c0 || col > c1) return ''
    let cls = s.nexusCellSelected
    if (row === r0) cls += ` ${s.nexusCellSelTop}`
    if (row === r1) cls += ` ${s.nexusCellSelBottom}`
    if (col === c0) cls += ` ${s.nexusCellSelLeft}`
    if (col === c1) cls += ` ${s.nexusCellSelRight}`
    return cls
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement as HTMLElement | null
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return
      const meta = e.ctrlKey || e.metaKey
      if (!meta) return

      if (e.key.toLowerCase() === 'a') {
        if (sorted.length === 0) return
        e.preventDefault()
        setAnchor({ row: 0, col: 0 })
        setFocus({ row: sorted.length - 1, col: COL_COUNT - 1 })
        return
      }
      if (e.key.toLowerCase() === 'c') {
        if (!anchor || !focus) return
        e.preventDefault()
        const tsv = buildTSV(sorted, anchor, focus)
        if (!tsv) return
        void navigator.clipboard.writeText(tsv)
        const rows = Math.abs(anchor.row - focus.row) + 1
        showToast(`${rows} row${rows === 1 ? '' : 's'} copied — ready to paste`)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [anchor, focus, sorted])

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
              🟢 Green: {counts.green}
            </button>
            <button className={`${s.nexusSummaryChip} ${s.nexusSummaryChipRed} ${filter === 'red' ? s.nexusSummaryChipActive : ''}`} onClick={() => selectFilter('red')}>
              🔴 Red: {counts.red}
            </button>
            <button className={`${s.nexusSummaryChip} ${s.nexusSummaryChipDnc} ${filter === 'dnc' ? s.nexusSummaryChipActive : ''}`} onClick={() => selectFilter('dnc')}>
              ⛔ DNC: {counts.dnc}
            </button>
            <button className={`${s.nexusSummaryChip} ${s.nexusSummaryChipOthersClient} ${filter === 'others_client' ? s.nexusSummaryChipActive : ''}`} onClick={() => selectFilter('others_client')}>
              👤 Others' Clients: {counts.others_client}
            </button>
            <button className={`${s.nexusSummaryChip} ${filter === 'unwashed' ? s.nexusSummaryChipActive : ''}`} onClick={() => selectFilter('unwashed')}>
              ⬜ Unwashed: {counts.unwashed}
            </button>
          </div>

          {/* Sheet tabs */}
          <div className={s.nexusSheetTabs}>
            {(['all', 'green', 'red', 'dnc', 'others_client', 'unwashed'] as WashFilter[]).map(f => {
              const activeClass = f === 'green' ? s.nexusSheetTabActiveGreen : f === 'red' ? s.nexusSheetTabActiveRed : f === 'dnc' ? s.nexusSheetTabActiveDnc : f === 'others_client' ? s.nexusSheetTabActiveOthersClient : ''
              const emoji = f === 'green' ? '🟢 ' : f === 'red' ? '🔴 ' : f === 'dnc' ? '⛔ ' : f === 'others_client' ? '👤 ' : f === 'unwashed' ? '⬜ ' : ''
              const label = f === 'all' ? 'All' : f === 'dnc' ? 'DNC' : f === 'others_client' ? "Others' Clients" : f[0].toUpperCase() + f.slice(1)
              const count = f === 'all' ? counts.total : f === 'green' ? counts.green : f === 'red' ? counts.red : f === 'dnc' ? counts.dnc : f === 'others_client' ? counts.others_client : counts.unwashed
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
              ⚠️ These prospects were previously rejected. Upload a new wash file — they may come through Green on a second wash.
            </div>
          )}

          {/* Toolbar — search + sort toggle */}
          <div className={s.nexusSearchRow}>
            <input
              className={s.nexusSearchInput}
              placeholder="🔍 Search name or company…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button className={s.nexusPasteBtn} onClick={toggleSortOrder}>
              {sortKey === 'created_at' && sortDir === 'desc' ? 'Newest first ↓' : 'A–Z ↑'}
            </button>
          </div>

          <div className={s.nexusGridWrap}>
            <table className={s.nexusTable}>
              <thead>
                <tr>
                  <th className={s.nexusThSortable} onClick={() => headerSort('name')}>First Name{sortArrow('name')}</th>
                  <th className={s.nexusThSortable} onClick={() => headerSort('name')}>Last Name{sortArrow('name')}</th>
                  <th>Job Title</th>
                  <th className={s.nexusThSortable} onClick={() => headerSort('company')}>Company{sortArrow('company')}</th>
                  <th>LinkedIn</th>
                  <th>Wash Result</th>
                  <th className={s.nexusThSortable} onClick={() => headerSort('date_washed')}>Date Washed{sortArrow('date_washed')}</th>
                  <th>Employment</th>
                  <th>Lead Source</th>
                  <th>Country</th>
                </tr>
              </thead>
              <tbody>
                {prospects === null ? (
                  <tr><td colSpan={10} style={{ color: 'var(--text-dim)' }}>Loading…</td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={10} style={{ color: 'var(--text-dim)' }}>No prospects in this view.</td></tr>
                ) : (
                  sorted.map((p, i) => {
                    const pill = washPillOf(p)
                    return (
                      <tr
                        key={p.id}
                        className={`${s.nexusRow} ${rowClass(p)}`}
                        onDoubleClick={() => setDrawerId(p.id)}
                      >
                        <td className={`${s.nexusNameCell} ${selCls(i, 0)}`} onMouseDown={e => onCellMouseDown(i, 0, e)} onMouseEnter={() => onCellMouseEnter(i, 0)}>
                          {p.first_name || '—'}
                        </td>
                        <td className={`${s.nexusNameCell} ${p.flagged ? s.nexusCellFlagged : ''} ${selCls(i, 1)}`} onMouseDown={e => onCellMouseDown(i, 1, e)} onMouseEnter={() => onCellMouseEnter(i, 1)} title={p.flagged ? 'Surname incomplete — needs checking' : undefined}>
                          {p.last_name || '—'}
                        </td>
                        <td className={`${s.nexusMutedCell} ${selCls(i, 2)}`} onMouseDown={e => onCellMouseDown(i, 2, e)} onMouseEnter={() => onCellMouseEnter(i, 2)}>
                          {p.job_role || '—'}
                        </td>
                        <td className={`${s.nexusMutedCell} ${selCls(i, 3)}`} onMouseDown={e => onCellMouseDown(i, 3, e)} onMouseEnter={() => onCellMouseEnter(i, 3)}>
                          {p.company ?? ''}
                          {p.company_on_map === false && (
                            <span className={s.nexusNotOnMapBadge} title="This company isn't on the map yet">?</span>
                          )}
                        </td>
                        <td className={selCls(i, 4)} onMouseDown={e => onCellMouseDown(i, 4, e)} onMouseEnter={() => onCellMouseEnter(i, 4)}>
                          {p.linkedin_url ? (
                            <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className={s.nexusLinkIcon} title="Open LinkedIn profile">
                              🔗
                            </a>
                          ) : <span className={s.nexusEmptyLink}>—</span>}
                        </td>
                        <td className={selCls(i, 5)} onMouseDown={e => onCellMouseDown(i, 5, e)} onMouseEnter={() => onCellMouseEnter(i, 5)}>
                          <span className={`${s.nexusPill} ${pill.cls}`}>{pill.emoji} {pill.label}</span>
                        </td>
                        <td className={`${p.date_washed ? '' : s.nexusMutedCell} ${selCls(i, 6)}`} onMouseDown={e => onCellMouseDown(i, 6, e)} onMouseEnter={() => onCellMouseEnter(i, 6)}>
                          {p.date_washed || '—'}
                        </td>
                        <td className={selCls(i, 7)} onMouseDown={e => onCellMouseDown(i, 7, e)} onMouseEnter={() => onCellMouseEnter(i, 7)}>
                          {overridingId === p.id ? (
                            <select
                              className={s.nexusEmploymentSelect}
                              autoFocus
                              defaultValue={p.employment_type ?? ''}
                              onChange={e => void overrideEmploymentType(p.id, e.target.value as EmploymentType)}
                              onBlur={() => setOverridingId(null)}
                            >
                              <option value="" disabled>— choose —</option>
                              {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          ) : (
                            <span
                              className={`${s.nexusPill} ${employmentPillOf(p).cls}`}
                              onClick={() => setOverridingId(p.id)}
                              style={{ cursor: 'pointer' }}
                              title="Tap to override"
                            >
                              {employmentPillOf(p).label}
                            </span>
                          )}
                        </td>
                        <td className={selCls(i, 8)} onMouseDown={e => onCellMouseDown(i, 8, e)} onMouseEnter={() => onCellMouseEnter(i, 8)}>
                          {editingCell?.id === p.id && editingCell.field === 'lead_channel' ? (
                            <select
                              className={s.nexusEmploymentSelect}
                              autoFocus
                              defaultValue={p.lead_channel}
                              onChange={e => void saveInlineField(p.id, 'lead_channel', e.target.value)}
                              onBlur={() => setEditingCell(null)}
                            >
                              {LEAD_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          ) : (
                            <span onClick={() => setEditingCell({ id: p.id, field: 'lead_channel' })} style={{ cursor: 'pointer' }} title="Tap to change">
                              {p.lead_channel}
                            </span>
                          )}
                        </td>
                        <td className={selCls(i, 9)} onMouseDown={e => onCellMouseDown(i, 9, e)} onMouseEnter={() => onCellMouseEnter(i, 9)}>
                          {editingCell?.id === p.id && editingCell.field === 'country' ? (
                            <input
                              className={s.nexusEmploymentSelect}
                              autoFocus
                              defaultValue={p.country}
                              onBlur={e => void saveInlineField(p.id, 'country', e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            />
                          ) : (
                            <span onClick={() => setEditingCell({ id: p.id, field: 'country' })} style={{ cursor: 'pointer' }} title="Tap to change">
                              {p.country}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom action bar — always pinned to the bottom of the page */}
          <div className={s.nexusBottomBar}>
            <button className={s.nexusBottomBarBtn} onClick={() => setSalesNavOpen(true)}>📋 Sales Nav Import</button>
            <button className={s.nexusBottomBarBtn} onClick={() => setWashUploadOpen(true)}>📊 Paste Wash Results</button>
          </div>
        </div>

        <ContextPanel agent="prospects" contextTitle="PROSPECTS" refreshKey={contextRefreshKey} />
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

      {salesNavOpen && (
        <SalesNavModal
          onClose={() => setSalesNavOpen(false)}
          showToast={showToast}
          onDone={load}
        />
      )}

      {washUploadOpen && (
        <WashUploadModal
          onClose={() => setWashUploadOpen(false)}
          showToast={showToast}
          onDone={load}
        />
      )}
    </div>
  )
}

// ── Shared modal shell ───────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className={s.nexusModalOverlay} onClick={onClose}>
      <div className={s.nexusModal} onClick={e => e.stopPropagation()}>
        <div className={s.nexusModalHead}>
          <span className={s.nexusModalTitle}>{title}</span>
          <button className={s.nexusModalClose} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Sales Nav import — modal ─────────────────────────────────────────────────

function SalesNavModal({ onClose, showToast, onDone }: {
  onClose: () => void
  showToast: (t: string) => void
  onDone: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number; flagged: number } | null>(null)

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
      const confirmed = await confirmRes.json() as { added: number; skipped: number; flagged: number }

      setResult({ imported: confirmed.added, skipped: confirmed.skipped, flagged: confirmed.flagged })
      setText('')
      showToast(`${confirmed.added} prospect${confirmed.added === 1 ? '' : 's'} imported`)
      onDone()
      setTimeout(onClose, 2000)
    } catch {
      showToast('Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Sales Nav Import" onClose={onClose}>
      <p className={s.nexusModalHint}>Paste your Sales Navigator search results below.</p>
      <textarea
        className={s.nexusTextarea}
        placeholder="Paste Sales Navigator results here…"
        value={text}
        onChange={e => setText(e.target.value)}
        rows={10}
      />
      <div className={s.nexusModalActions}>
        <button className={`${s.nexusBtn} ${s.nexusBtnPrimary}`} onClick={() => void importNames()} disabled={busy || !text.trim()}>
          {busy ? 'Importing…' : 'Import names'}
        </button>
      </div>

      {result && (
        <div className={s.nexusImportResult}>
          ✓ {result.imported} imported · {result.skipped} duplicate{result.skipped === 1 ? '' : 's'} skipped
          {result.flagged > 0 && <><br />⚠ {result.flagged} name{result.flagged === 1 ? '' : 's'} need{result.flagged === 1 ? 's' : ''} checking (surname incomplete)</>}
        </div>
      )}
    </ModalShell>
  )
}

// ── Wash Results import — modal ──────────────────────────────────────────────
// Claude reads the full wash sheet paste (Contact Name / Wash Result /
// Comments) and classifies each row — green/red alone can't tell a plain
// DNC apart from another advisor's active client or a pool conflict, but
// the Comments column carries that detail. Preview-then-confirm, same
// pattern as the Sales Nav import, since an LLM classification is worth a
// look before it writes to prospects Archie is actively working.

interface WashResultCandidate {
  id: string | null
  name: string
  result: 'green' | 'red'
  category: 'ok_to_contact' | 'dnc' | 'others_client' | 'pool_conflict' | 'redlisted_company'
  reason: string
  conflictingAdvisor: string | null
  matched: boolean
  aiMatched: boolean
  matchedName: string | null
}

interface WashConfirmResult {
  matched: number
  unmatched: string[]
  ok_to_contact: number
  dnc: number
  others_client: number
  pool_conflict: number
  redlisted_company: number
}

function WashUploadModal({ onClose, showToast, onDone }: {
  onClose: () => void
  showToast: (t: string) => void
  onDone: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [candidates, setCandidates] = useState<WashResultCandidate[] | null>(null)
  const [result, setResult] = useState<WashConfirmResult | null>(null)

  async function parsePaste() {
    if (!text.trim()) return
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/dashboard/nexus/wash-results', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      })
      const data = await res.json() as { candidates?: WashResultCandidate[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Parsing failed')
      setCandidates(data.candidates ?? [])
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Parsing failed')
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport() {
    if (!candidates || candidates.length === 0) return
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/nexus/wash-results', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, candidates }),
      })
      const data = await res.json() as WashConfirmResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      setResult(data)
      setCandidates(null)
      setText('')
      showToast(`${data.matched} matched and updated`)
      onDone()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const unmatchedPreview = candidates?.filter(c => !c.matched) ?? []

  return (
    <ModalShell title="Paste Wash Results" onClose={onClose}>
      <p className={s.nexusModalHint}>
        Paste straight from the wash results sheet — Contact Name, Wash Result, Comments columns. Claude reads the Comments to tell DNC, another advisor's client, a pool conflict, and a redlisted company apart.
      </p>
      <textarea
        className={s.nexusTextarea}
        placeholder={'James Hill\tGreen\tOK TO CONTACT\nSarah Jones\tRed\tDO NOT CONTACT - on CLIENT list'}
        value={text}
        onChange={e => setText(e.target.value)}
        rows={10}
        disabled={busy || Boolean(candidates)}
      />

      {!candidates && (
        <div className={s.nexusModalActions}>
          <button className={`${s.nexusBtn} ${s.nexusBtnPrimary}`} onClick={() => void parsePaste()} disabled={busy || !text.trim()}>
            {busy ? 'Reading…' : 'Preview'}
          </button>
        </div>
      )}

      {candidates && (
        <>
          <div className={s.nexusImportResult}>
            {candidates.filter(c => c.matched).length} of {candidates.length} rows matched a prospect — review below, then confirm.
          </div>
          <div className={s.nexusImportUnmatchedChips}>
            {candidates.map((c, i) => (
              <span key={i} className={s.nexusImportUnmatchedChip} title={c.reason}>
                {c.matched ? (c.aiMatched ? '✓🤖' : '✓') : '✗'} {c.name} — {c.category === 'ok_to_contact' ? 'Green' : c.category === 'dnc' ? 'DNC' : c.category === 'others_client' ? "Others' Client" : c.category === 'redlisted_company' ? 'Redlisted' : 'Pool Conflict'}
                {c.conflictingAdvisor ? ` (${c.conflictingAdvisor})` : ''}
              </span>
            ))}
          </div>
          {candidates.some(c => c.aiMatched) && (
            <div className={s.nexusImportResult}>
              🤖 AI-matched {candidates.filter(c => c.aiMatched).length} name{candidates.filter(c => c.aiMatched).length === 1 ? '' : 's'} the fast pass missed:
              <div className={s.nexusImportUnmatchedChips}>
                {candidates.filter(c => c.aiMatched).map((c, i) => (
                  <span key={i} className={s.nexusImportUnmatchedChip}>{c.name} → {c.matchedName ?? '?'}</span>
                ))}
              </div>
            </div>
          )}
          {unmatchedPreview.length > 0 && (
            <div className={s.nexusWashWarning}>
              ⚠️ {unmatchedPreview.length} name{unmatchedPreview.length === 1 ? '' : 's'} couldn't be matched to a prospect — check spelling before confirming:
              <div className={s.nexusImportUnmatchedChips}>
                {unmatchedPreview.map((c, i) => <span key={i} className={s.nexusImportUnmatchedChip}>{unmatchedDisplay(c.name)}</span>)}
              </div>
            </div>
          )}
          <div className={s.nexusModalActions}>
            <button className={s.nexusBtn} onClick={() => setCandidates(null)} disabled={busy}>Back</button>
            <button className={`${s.nexusBtn} ${s.nexusBtnPrimary}`} onClick={() => void confirmImport()} disabled={busy}>
              {busy ? 'Updating…' : `Confirm & update ${candidates.filter(c => c.matched).length}`}
            </button>
          </div>
        </>
      )}

      {result && (
        <div className={s.nexusImportResult}>
          ✓ {result.matched} matched and updated
          <br />🟢 {result.ok_to_contact} OK to contact
          <br />⛔ {result.dnc} DNC — never rewash
          <br />👤 {result.others_client} Others' Clients — never rewash
          <br />🔴 {result.pool_conflict + result.redlisted_company} Red — rewash later (pool conflicts + redlisted)
        </div>
      )}

      {result && result.unmatched.length > 0 && (
        <div className={s.nexusWashWarning}>
          ⚠️ {result.unmatched.length} name{result.unmatched.length === 1 ? '' : 's'} couldn't be matched — check spelling against your prospect list:
          <div className={s.nexusImportUnmatchedChips}>
            {result.unmatched.map((name, i) => <span key={i} className={s.nexusImportUnmatchedChip}>{unmatchedDisplay(name)}</span>)}
          </div>
        </div>
      )}
    </ModalShell>
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
          <div className={s.nexusDrawerReadonly}>{statusLabelOf(prospect)}</div>
        </div>
        {prospect.conflicting_advisor && (
          <div className={s.nexusDrawerField}>
            <span className={s.nexusDrawerLabel}>Under Advisor</span>
            <div className={s.nexusDrawerReadonly}>{prospect.conflicting_advisor}</div>
          </div>
        )}
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
        {statusOf(prospect) === 'red' && prospect.rewash_after && (
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
