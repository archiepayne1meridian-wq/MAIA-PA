'use client'

import { useEffect, useState, useCallback } from 'react'
import s from '../dashboard.module.css'

interface Preference {
  id: string
  category: string
  rule_type: string
  rule_key: string
  rule_value: string
  confirmed: number
  source: string
  times_applied: number
  created_at: number
  updated_at: number
}

interface Proposal {
  id: string
  rule_key: string
  rule_value: string
  category: string
  reason: string | null
  rejection_count: number
  status: string
  created_at: number
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  cassandra: { label: 'CASSANDRA', color: 'var(--cassandra-sector)' },
  iris: { label: 'IRIS', color: 'var(--accent)' },
  diana: { label: 'DIANA', color: 'var(--online)' },
  hermes: { label: 'HERMES', color: 'var(--idle)' },
  general: { label: 'General (all agents)', color: 'var(--text-dim)' },
  all: { label: 'All agents', color: 'var(--text-dim)' },
}
const CATEGORY_ORDER = ['cassandra', 'iris', 'diana', 'hermes', 'general', 'all']
const RULE_TYPES = ['exclude', 'include', 'style', 'behaviour'] as const

function categoryMeta(cat: string) {
  return CATEGORY_META[cat] ?? { label: cat, color: 'var(--text-dim)' }
}

export default function PreferencesWorkspace() {
  const [grouped, setGrouped] = useState<Record<string, Preference[]>>({})
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [formCategory, setFormCategory] = useState('cassandra')
  const [formRuleType, setFormRuleType] = useState<typeof RULE_TYPES[number]>('exclude')
  const [formValue, setFormValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/preferences')
      const data = await res.json() as { grouped?: Record<string, Preference[]>; proposals?: Proposal[] }
      setGrouped(data.grouped ?? {})
      setProposals(data.proposals ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function flash(text: string) {
    setMsg(text)
    setTimeout(() => setMsg(null), 3000)
  }

  async function startEdit(pref: Preference) {
    setEditingId(pref.id)
    setEditValue(pref.rule_value)
  }

  async function saveEdit(id: string) {
    if (!editValue.trim()) return
    await fetch(`/api/dashboard/preferences/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_value: editValue.trim() }),
    })
    setEditingId(null)
    flash('Saved.')
    void load()
  }

  async function removePreference(id: string) {
    await fetch(`/api/dashboard/preferences/${id}`, { method: 'DELETE' })
    flash('Deleted.')
    void load()
  }

  function openAddForm(category: string) {
    setFormCategory(category)
    setFormOpen(true)
  }

  async function submitAdd() {
    if (!formValue.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/dashboard/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: formCategory, rule_type: formRuleType, rule_value: formValue.trim() }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setFormValue('')
      setFormOpen(false)
      flash('Preference added.')
      void load()
    } catch (e) {
      flash(e instanceof Error ? `Error: ${e.message}` : 'Add failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmProposal(id: string) {
    await fetch('/api/dashboard/preferences/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId: id }),
    })
    flash('Confirmed — now applied permanently.')
    void load()
  }

  async function declineProposal(id: string) {
    await fetch('/api/dashboard/preferences/decline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId: id }),
    })
    flash('Declined.')
    void load()
  }

  const categories = CATEGORY_ORDER.filter(c => (grouped[c]?.length ?? 0) > 0 || c !== 'all')

  return (
    <div className={s.fullPage}>
      <div className={s.fullPageTopbar}>
        <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
        <span className={s.fpPageTitle}>Preferences</span>
        <span className={s.fpPageSubtitle}>My Preferences</span>
      </div>

      <div className={s.prefsScroll}>
        <div className={s.prefsHead}>
          <h1 className={s.prefsTitle}>My Preferences</h1>
          <p className={s.prefsSubtitle}>These rules apply across every agent — confirmed once, remembered forever</p>
        </div>

        {msg && <div className={s.prefsFlash}>{msg}</div>}

        {proposals.length > 0 && (
          <div className={s.prefsProposalsSection}>
            <div className={s.prefsSectionLabel}>MAIA has noticed a pattern — confirm to apply permanently</div>
            {proposals.map(p => (
              <div key={p.id} className={s.prefsProposalCard}>
                <p className={s.prefsProposalText}>
                  You&apos;ve rejected <strong>{p.rule_key.replace(/_/g, ' ')}</strong> content {p.rejection_count} times in {categoryMeta(p.category).label}.
                  <br />Should I exclude it permanently?
                </p>
                <div className={s.prefsProposalActions}>
                  <button className={s.prefsProposalYes} onClick={() => void confirmProposal(p.id)}>✅ Yes, always exclude</button>
                  <button className={s.prefsProposalNo} onClick={() => void declineProposal(p.id)}>❌ No, keep showing</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading && <p className={s.prefsEmpty}>Loading…</p>}

        {!loading && categories.length === 0 && (
          <p className={s.prefsEmpty}>No preferences yet — add one below.</p>
        )}

        {!loading && categories.map(cat => {
          const prefs = grouped[cat] ?? []
          const meta = categoryMeta(cat)
          return (
            <div key={cat} className={s.prefsSection}>
              <div className={s.prefsSectionHead}>
                <span className={s.prefsColorChip} style={{ background: meta.color }} />
                <span className={s.prefsSectionTitle}>{meta.label}</span>
                <span className={s.prefsSectionCount}>{prefs.length}</span>
              </div>

              {prefs.map(pref => (
                <div key={pref.id} className={s.prefsCard}>
                  <span className={s.prefsCardType}>{pref.rule_type}</span>
                  {editingId === pref.id ? (
                    <textarea
                      className={s.prefsCardEdit}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <p className={s.prefsCardText} onClick={() => void startEdit(pref)}>{pref.rule_value}</p>
                  )}
                  <div className={s.prefsCardActions}>
                    {editingId === pref.id ? (
                      <>
                        <button className={s.prefsCardBtn} onClick={() => void saveEdit(pref.id)}>Save</button>
                        <button className={s.prefsCardBtn} onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className={s.prefsCardBtn} onClick={() => void startEdit(pref)}>Edit</button>
                        <button className={s.prefsCardBtnDelete} onClick={() => void removePreference(pref.id)}>Delete</button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              <button className={s.prefsAddBtn} onClick={() => openAddForm(cat === 'all' ? 'general' : cat)}>+ Add preference</button>
            </div>
          )
        })}

        <div className={s.prefsFormSection}>
          {!formOpen ? (
            <button className={s.prefsAddBtn} onClick={() => openAddForm('cassandra')}>+ Add a new preference</button>
          ) : (
            <div className={s.prefsForm}>
              <div className={s.prefsFormRow}>
                <select className={s.prefsSelect} value={formCategory} onChange={e => setFormCategory(e.target.value)}>
                  {['cassandra', 'iris', 'diana', 'hermes', 'general'].map(c => (
                    <option key={c} value={c}>{categoryMeta(c).label}</option>
                  ))}
                </select>
                <select className={s.prefsSelect} value={formRuleType} onChange={e => setFormRuleType(e.target.value as typeof formRuleType)}>
                  {RULE_TYPES.map(t => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <textarea
                className={s.prefsFormTextarea}
                placeholder="Describe the rule…"
                value={formValue}
                onChange={e => setFormValue(e.target.value)}
              />
              <div className={s.prefsFormRow}>
                <button className={s.prefsAddBtn} onClick={() => void submitAdd()} disabled={submitting || !formValue.trim()}>
                  {submitting ? 'Saving…' : 'Save preference'}
                </button>
                <button className={s.prefsCardBtn} onClick={() => { setFormOpen(false); setFormValue('') }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
