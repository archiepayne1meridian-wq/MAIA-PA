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
  lead_channel: string
  country: string
  linkedin_url: string | null
  wash_result: string | null
  batch: string | null
  created_at: number
  updated_at: number
}

type WashFilter = 'all' | 'green' | 'red' | 'dnc' | 'unwashed'

interface SalesNavCandidate {
  firstName: string
  lastName: string
  company: string | null
  jobRole: string | null
  isDuplicate: boolean
}

interface WashUpdateCandidate {
  id: string | null
  name: string
  washResult: 'Green' | 'Red' | 'Do Not Contact'
  matched: boolean
}

const EDITABLE_FIELDS: { key: 'last_name' | 'first_name' | 'company' | 'job_role'; label: string }[] = [
  { key: 'last_name', label: 'Last' },
  { key: 'first_name', label: 'First' },
  { key: 'company', label: 'Company' },
  { key: 'job_role', label: 'Job Role' },
]

function rowClass(p: NexusProspect): string {
  if (p.wash_result === 'Green') return s.nexusRowGreen
  if (p.wash_result === 'Red') return s.nexusRowRed
  if (p.wash_result === 'Do Not Contact') return s.nexusRowDnc
  return ''
}

function statusLabel(wash: string | null): string {
  if (wash === 'Green') return 'Green'
  if (wash === 'Red') return 'Red'
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
  const [toast, setToast] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [modal, setModal] = useState<'salesnav' | 'wash' | null>(null)

  const anchorRef = useRef<number | null>(null)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
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
    setTimeout(() => setToast(null), 2200)
  }

  const all = prospects ?? []
  const counts = useMemo(() => ({
    total: all.length,
    green: all.filter(p => p.wash_result === 'Green').length,
    red: all.filter(p => p.wash_result === 'Red').length,
    dnc: all.filter(p => p.wash_result === 'Do Not Contact').length,
    unwashed: all.filter(p => !p.wash_result).length,
  }), [all])

  const filtered = useMemo(() => {
    if (filter === 'all') return all
    if (filter === 'green') return all.filter(p => p.wash_result === 'Green')
    if (filter === 'red') return all.filter(p => p.wash_result === 'Red')
    if (filter === 'dnc') return all.filter(p => p.wash_result === 'Do Not Contact')
    return all.filter(p => !p.wash_result)
  }, [all, filter])

  // Clamp/clear any row selection that no longer makes sense after the
  // filtered list changes shape (switching tabs, edits, paste imports).
  useEffect(() => { setSelection(null); anchorRef.current = null; setFocusIndex(null) }, [filter])

  function pct(n: number): string {
    return counts.total > 0 ? `${Math.round((n / counts.total) * 100)}%` : '0%'
  }

  // ── Excel-style row selection ────────────────────────────────────────────

  function onRowMouseDown(index: number, e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('a, input')) return
    draggingRef.current = true
    if (e.shiftKey && anchorRef.current !== null) {
      setFocusIndex(index)
      setSelection({ start: Math.min(anchorRef.current, index), end: Math.max(anchorRef.current, index) })
    } else {
      anchorRef.current = index
      setFocusIndex(index)
      setSelection({ start: index, end: index })
    }
  }

  function onRowMouseEnter(index: number) {
    if (!draggingRef.current || anchorRef.current === null) return
    setFocusIndex(index)
    setSelection({ start: Math.min(anchorRef.current, index), end: Math.max(anchorRef.current, index) })
  }

  useEffect(() => {
    function onMouseUp() { draggingRef.current = false }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [])

  // ── Clipboard copy — tab-separated, Core CRM column order ───────────────

  useEffect(() => {
    function onCopy(e: ClipboardEvent) {
      const active = document.activeElement as HTMLElement | null
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
      if (!selection) return
      const rows = filtered.slice(selection.start, selection.end + 1)
      if (rows.length === 0) return
      e.preventDefault()
      const tsv = toTSV(rows)
      e.clipboardData?.setData('text/plain', tsv)
      if (!e.clipboardData) void navigator.clipboard.writeText(tsv)
      showToast(`${rows.length} prospect${rows.length === 1 ? '' : 's'} copied — ready to paste`)
    }
    document.addEventListener('copy', onCopy)
    return () => document.removeEventListener('copy', onCopy)
  }, [selection, filtered])

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

  return (
    <div className={s.fullPage}>
      <div className={s.fullPageTopbar}>
        <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
        <span className={s.fpPageTitle}>PROSPECTS</span>
        <span className={s.fpPageSubtitle}>NEXUS · List Management</span>
      </div>

      <div className={s.fullPageCols}>
        <div className={s.nexusCol}>
          <div className={s.nexusToolbar}>
            <div className={s.nexusStatsBar}>
              {counts.total} total · {counts.green} green ({pct(counts.green)}) · {counts.red} red ({pct(counts.red)}) · {counts.dnc} DNC · {counts.unwashed} unwashed
            </div>
            <div className={s.nexusToolbarRow}>
              {(['all', 'green', 'red', 'dnc', 'unwashed'] as WashFilter[]).map(f => (
                <button
                  key={f}
                  className={`${s.nexusTab} ${filter === f ? s.nexusTabActive : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'dnc' ? 'Do Not Contact' : f[0].toUpperCase() + f.slice(1)}
                  {' '}({f === 'all' ? counts.total : f === 'green' ? counts.green : f === 'red' ? counts.red : f === 'dnc' ? counts.dnc : counts.unwashed})
                </button>
              ))}
              <div className={s.nexusPasteBtns}>
                <button className={s.nexusPasteBtn} onClick={() => setModal('wash')}>Paste wash results</button>
                <button className={s.nexusPasteBtn} onClick={() => setModal('salesnav')}>Paste new prospects</button>
              </div>
            </div>
          </div>

          <div className={s.nexusGridWrap} ref={gridRef}>
            <table className={s.nexusTable}>
              <thead>
                <tr>
                  <th>Last</th><th>First</th><th>Company</th><th>Job Role</th><th>Status</th><th>LinkedIn</th>
                </tr>
              </thead>
              <tbody>
                {prospects === null ? (
                  <tr><td colSpan={6} style={{ color: 'var(--text-dim)' }}>Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ color: 'var(--text-dim)' }}>No prospects in this view.</td></tr>
                ) : (
                  filtered.map((p, i) => {
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
                        <td>
                          {p.linkedin_url ? (
                            <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className={s.nexusLink} onClick={e => e.stopPropagation()}>
                              Profile ↗
                            </a>
                          ) : <span className={s.nexusEmptyLink}>—</span>}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <ContextPanel agent="prospects" contextTitle="PROSPECTS" />
      </div>

      {toast && <div className={s.nexusToast}>{toast}</div>}

      {modal === 'salesnav' && (
        <SalesNavModal onClose={() => setModal(null)} onDone={() => { setModal(null); load() }} showToast={showToast} />
      )}
      {modal === 'wash' && (
        <WashModal onClose={() => setModal(null)} onDone={() => { setModal(null); load() }} showToast={showToast} />
      )}
    </div>
  )
}

function SalesNavModal({ onClose, onDone, showToast }: { onClose: () => void; onDone: () => void; showToast: (t: string) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ candidates: SalesNavCandidate[]; found: number; duplicates: number; readyToAdd: number } | null>(null)

  async function parse() {
    if (!text.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/nexus/parse-salesnav', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      })
      setPreview(await res.json())
    } finally { setBusy(false) }
  }

  async function confirm() {
    if (!preview) return
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/nexus/parse-salesnav', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, candidates: preview.candidates }),
      })
      const data = await res.json() as { added: number }
      showToast(`${data.added} prospect${data.added === 1 ? '' : 's'} added`)
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div className={s.nexusModalOverlay} onClick={onClose}>
      <div className={s.nexusModal} onClick={e => e.stopPropagation()}>
        <div className={s.nexusModalTitle}>Paste new prospects</div>
        {!preview ? (
          <>
            <textarea
              className={s.nexusTextarea}
              placeholder="Paste Sales Navigator lead list here…"
              value={text}
              onChange={e => setText(e.target.value)}
              autoFocus
            />
            <div className={s.nexusModalActions}>
              <button className={`${s.nexusBtn} ${s.nexusBtnGhost}`} onClick={onClose}>Cancel</button>
              <button className={`${s.nexusBtn} ${s.nexusBtnPrimary}`} onClick={parse} disabled={busy || !text.trim()}>
                {busy ? 'Parsing…' : 'Parse'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={s.nexusModalPreview}>
              Found {preview.found} prospects. {preview.duplicates} already in list (skipped).<br />
              {preview.readyToAdd} ready to add.
            </div>
            <div className={s.nexusModalActions}>
              <button className={`${s.nexusBtn} ${s.nexusBtnGhost}`} onClick={onClose}>Cancel</button>
              <button className={`${s.nexusBtn} ${s.nexusBtnPrimary}`} onClick={confirm} disabled={busy || preview.readyToAdd === 0}>
                {busy ? 'Adding…' : 'Confirm & add'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function WashModal({ onClose, onDone, showToast }: { onClose: () => void; onDone: () => void; showToast: (t: string) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ candidates: WashUpdateCandidate[]; found: number; matched: number; unmatched: number; green: number; red: number; dnc: number } | null>(null)

  async function parse() {
    if (!text.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/nexus/parse-wash', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      })
      setPreview(await res.json())
    } finally { setBusy(false) }
  }

  async function confirm() {
    if (!preview) return
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/nexus/parse-wash', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, candidates: preview.candidates }),
      })
      const data = await res.json() as { updated: number; green: number; red: number; dnc: number }
      showToast(`Updated ${data.updated} wash results: ${data.green} → Green · ${data.red} → Red · ${data.dnc} → Do Not Contact`)
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div className={s.nexusModalOverlay} onClick={onClose}>
      <div className={s.nexusModal} onClick={e => e.stopPropagation()}>
        <div className={s.nexusModalTitle}>Paste wash results</div>
        {!preview ? (
          <>
            <textarea
              className={s.nexusTextarea}
              placeholder="Paste the daily wash overview here…"
              value={text}
              onChange={e => setText(e.target.value)}
              autoFocus
            />
            <div className={s.nexusModalActions}>
              <button className={`${s.nexusBtn} ${s.nexusBtnGhost}`} onClick={onClose}>Cancel</button>
              <button className={`${s.nexusBtn} ${s.nexusBtnPrimary}`} onClick={parse} disabled={busy || !text.trim()}>
                {busy ? 'Parsing…' : 'Parse'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={s.nexusModalPreview}>
              Updated {preview.matched} wash results:<br />
              {preview.green} → Green · {preview.red} → Red · {preview.dnc} → Do Not Contact
            </div>
            <div className={s.nexusModalActions}>
              <button className={`${s.nexusBtn} ${s.nexusBtnGhost}`} onClick={onClose}>Cancel</button>
              <button className={`${s.nexusBtn} ${s.nexusBtnPrimary}`} onClick={confirm} disabled={busy || preview.matched === 0}>
                {busy ? 'Updating…' : 'Confirm'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
