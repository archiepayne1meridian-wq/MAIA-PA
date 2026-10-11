'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import s from '../dashboard.module.css'
import ContextPanel from '../components/ContextPanel'
import FileDropZone from '../components/FileDropZone'
import CrmExportPanel, { type CrmRow } from './CrmExportPanel'

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

function washPill(wash: string | null): { emoji: string; label: string; cls: string } {
  if (wash === 'Green') return { emoji: '🟢', label: 'Green', cls: s.nexusPillGreen }
  if (wash === 'Red') return { emoji: '🔴', label: 'Red', cls: s.nexusPillRed }
  if (wash === 'Do Not Contact') return { emoji: '⛔', label: 'DNC', cls: s.nexusPillDnc }
  return { emoji: '⬜', label: '—', cls: s.nexusPillNone }
}

function toProspectCrmRow(p: NexusProspect): CrmRow {
  return {
    firstName: p.first_name ?? '',
    lastName: p.last_name ?? '',
    company: p.company ?? '',
    jobRole: p.job_role ?? '',
    linkedinUrl: p.linkedin_url ?? '',
  }
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
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [drawerId, setDrawerId] = useState<string | null>(null)

  const [salesNavOpen, setSalesNavOpen] = useState(false)
  const [washUploadOpen, setWashUploadOpen] = useState(false)
  const [crmExportOpen, setCrmExportOpen] = useState(false)

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

  useEffect(() => { setPage(0) }, [search, filter])

  function headerSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  function sortArrow(key: SortKey): string {
    return sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
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
  const canExport = filter === 'all' || filter === 'green' || filter === 'unwashed'

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
            <button className={`${s.nexusSummaryChip} ${filter === 'unwashed' ? s.nexusSummaryChipActive : ''}`} onClick={() => selectFilter('unwashed')}>
              ⬜ Unwashed: {counts.unwashed}
            </button>
          </div>

          {/* Sheet tabs */}
          <div className={s.nexusSheetTabs}>
            {(['all', 'green', 'red', 'unwashed', 'dnc'] as WashFilter[]).map(f => {
              const activeClass = f === 'green' ? s.nexusSheetTabActiveGreen : f === 'red' ? s.nexusSheetTabActiveRed : f === 'dnc' ? s.nexusSheetTabActiveDnc : ''
              const emoji = f === 'green' ? '🟢 ' : f === 'red' ? '🔴 ' : f === 'dnc' ? '⛔ ' : f === 'unwashed' ? '⬜ ' : ''
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
              ⚠️ These prospects were previously rejected. Upload a new wash file — they may come through Green on a second wash.
            </div>
          )}

          {/* Toolbar — search + export */}
          <div className={s.nexusSearchRow}>
            <input
              className={s.nexusSearchInput}
              placeholder="🔍 Search name or company…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {canExport && (
              <button className={s.nexusPasteBtn} onClick={() => setCrmExportOpen(true)}>Export for CRM ↓</button>
            )}
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
                </tr>
              </thead>
              <tbody>
                {prospects === null ? (
                  <tr><td colSpan={7} style={{ color: 'var(--text-dim)' }}>Loading…</td></tr>
                ) : paginated.length === 0 ? (
                  <tr><td colSpan={7} style={{ color: 'var(--text-dim)' }}>No prospects in this view.</td></tr>
                ) : (
                  paginated.map(p => {
                    const pill = washPill(p.wash_result)
                    return (
                      <tr
                        key={p.id}
                        className={`${s.nexusRow} ${rowClass(p)}`}
                        onClick={() => setDrawerId(p.id)}
                      >
                        <td className={s.nexusNameCell}>{p.first_name || '—'}</td>
                        <td className={s.nexusNameCell}>{p.last_name || '—'}</td>
                        <td className={s.nexusMutedCell}>{p.job_role || '—'}</td>
                        <td className={s.nexusMutedCell}>{p.company || '—'}</td>
                        <td>
                          {p.linkedin_url ? (
                            <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className={s.nexusLinkIcon} onClick={e => e.stopPropagation()} title="Open LinkedIn profile">
                              🔗
                            </a>
                          ) : <span className={s.nexusEmptyLink}>—</span>}
                        </td>
                        <td><span className={`${s.nexusPill} ${pill.cls}`}>{pill.emoji} {pill.label}</span></td>
                        <td className={p.date_washed ? '' : s.nexusMutedCell}>{p.date_washed || '—'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className={s.nexusPaginationRow}>
            <button className={s.nexusPageBtn} onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Prev</button>
            <span>Showing {sorted.length === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min(sorted.length, (page + 1) * PAGE_SIZE)} of {sorted.length}</span>
            <button className={s.nexusPageBtn} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>Next →</button>
          </div>

          {/* Bottom action bar — always pinned to the bottom of the page */}
          <div className={s.nexusBottomBar}>
            <button className={s.nexusBottomBarBtn} onClick={() => setSalesNavOpen(true)}>📋 Sales Nav Import</button>
            <button className={s.nexusBottomBarBtn} onClick={() => setWashUploadOpen(true)}>📊 Upload Wash Results</button>
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

      {crmExportOpen && (
        <ModalShell title={`Export for CRM — ${searched.length} prospect${searched.length === 1 ? '' : 's'}`} wide onClose={() => setCrmExportOpen(false)}>
          <CrmExportPanel rows={searched.map(toProspectCrmRow)} />
        </ModalShell>
      )}
    </div>
  )
}

// ── Shared modal shell ───────────────────────────────────────────────────────

function ModalShell({ title, wide, onClose, children }: {
  title: string
  wide?: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className={s.nexusModalOverlay} onClick={onClose}>
      <div className={`${s.nexusModal} ${wide ? s.nexusModalWide : ''}`} onClick={e => e.stopPropagation()}>
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
  const [result, setResult] = useState<{ imported: number; skipped: number; addedRows: CrmRow[] } | null>(null)

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

      const addedRows: CrmRow[] = parsed.candidates
        .filter(c => !c.isDuplicate)
        .map(c => ({ firstName: c.firstName, lastName: c.lastName, company: c.company ?? '', jobRole: c.jobRole ?? '', linkedinUrl: '' }))

      setResult({ imported: confirmed.added, skipped: parsed.duplicates, addedRows })
      setText('')
      showToast(`${confirmed.added} prospect${confirmed.added === 1 ? '' : 's'} imported`)
      onDone()
    } catch {
      showToast('Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Sales Nav Import" wide={!!result?.addedRows.length} onClose={onClose}>
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
        <>
          <div className={s.nexusImportResult}>✓ {result.imported} imported · {result.skipped} skipped (already in database)</div>
          {result.addedRows.length > 0 && <CrmExportPanel rows={result.addedRows} />}
        </>
      )}
    </ModalShell>
  )
}

// ── Wash Results import — modal ──────────────────────────────────────────────

function WashUploadModal({ onClose, showToast, onDone }: {
  onClose: () => void
  showToast: (t: string) => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
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
      showToast(`${data.updated ?? 0} wash results updated`)
      onDone()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Upload Wash Results" onClose={onClose}>
      <p className={s.nexusModalHint}>Upload your wash results Excel file (.xlsx). Matches will be updated automatically.</p>
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
          ✓ {result.updated} updated
          {result.unmatched.length > 0 && (
            <>
              <br />⚠ Unmatched names (check spelling):
              <div className={s.nexusImportUnmatchedChips}>
                {result.unmatched.map((name, i) => <span key={i} className={s.nexusImportUnmatchedChip}>{unmatchedDisplay(name)}</span>)}
              </div>
            </>
          )}
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
