'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import s from '../dashboard.module.css'
import m from './map.module.css'
import type { MapCompanyWithStats, CompanyProspect, OverviewStats } from '../../../../tools/map-db'

// Leaflet touches window/document at mount — never server-rendered.
const MapCanvas = dynamic(() => import('./MapCanvas'), { ssr: false })

const NATIONALITY_FLAGS: Record<string, string> = {
  British: '🇬🇧', Australian: '🇦🇺', 'South African': '🇿🇦', Norwegian: '🇳🇴',
  American: '🇺🇸', French: '🇫🇷', German: '🇩🇪', Swiss: '🇨🇭', Irish: '🇮🇪',
  'New Zealand': '🇳🇿', Canadian: '🇨🇦', Dutch: '🇳🇱', Swedish: '🇸🇪', Danish: '🇩🇰',
}

// Same priority order as MapCanvas.tsx's getPinColor — the panel's status
// pill and the marker on the map must always agree.
function statusOf(c: MapCompanyWithStats): { label: string; colour: string } {
  if (c.prospect_priority === 'avoid') return { label: '🔴 Avoid', colour: '#e74c3c' }
  if (c.prospect_priority === 'high' && c.total_booked === 0 && c.total_washed === 0) return { label: '🟣 Priority target', colour: '#9b59b6' }
  if (c.total_booked >= 3) return { label: '🟠 Hot', colour: '#e8621a' }
  if (c.total_booked > 0) return { label: '🟡 Warm', colour: '#f39c12' }
  if (c.total_washed > 0) return { label: '🔵 Cold — being worked', colour: '#3498db' }
  return { label: '⚫ Untouched', colour: '#666666' }
}

interface CompanySummary { what_they_do: string; who_is_there: string; office_type: string }

function parseSummary(raw: string | null): CompanySummary | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<CompanySummary>
    if (parsed.what_they_do && parsed.who_is_there && parsed.office_type) return parsed as CompanySummary
    return null
  } catch {
    return null
  }
}

const PROSPECT_DOT: Record<CompanyProspect['status'], string> = {
  active: '#22c55e', pool_conflict: '#dc2626', dnc: '#6b7280', others_client: '#8b5cf6', unwashed: '#444',
}

export default function MapWorkspace() {
  const [companies, setCompanies] = useState<MapCompanyWithStats[] | null>(null)
  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [prospects, setProspects] = useState<CompanyProspect[] | null>(null)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const loadCompanies = useCallback(() => {
    fetch('/api/dashboard/map/companies')
      .then(r => r.json() as Promise<{ companies: MapCompanyWithStats[] }>)
      .then(d => setCompanies(d.companies ?? []))
      .catch(err => { console.error('[map] companies load failed:', err); setCompanies([]) })
  }, [])

  const loadOverview = useCallback(() => {
    fetch('/api/dashboard/map/overview')
      .then(r => r.json() as Promise<OverviewStats>)
      .then(setOverview)
      .catch(err => { console.error('[map] overview load failed:', err); setOverview(null) })
  }, [])

  useEffect(() => { loadCompanies(); loadOverview() }, [loadCompanies, loadOverview])

  const selected = useMemo(() => companies?.find(c => c.id === selectedId) ?? null, [companies, selectedId])

  useEffect(() => {
    if (!selected) { setProspects(null); return }
    setProspects(null)
    setNoteDraft(selected.notes ?? '')
    fetch(`/api/dashboard/map/company-prospects?companyId=${selected.id}`)
      .then(r => r.json() as Promise<{ prospects: CompanyProspect[] }>)
      .then(d => setProspects(d.prospects ?? []))
      .catch(() => setProspects([]))
  }, [selected])

  // Generate an AI summary exactly once per company, ever — only when
  // nothing's cached yet. Never auto-regenerates; a stored summary is
  // permanent until the user explicitly hits "Refresh intel".
  useEffect(() => {
    if (!selected || selected.ai_summary || generatingSummary) return
    void generateSummary(selected, false)
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  async function generateSummary(c: MapCompanyWithStats, force: boolean) {
    setGeneratingSummary(true)
    try {
      await fetch('/api/dashboard/map/company-summary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: c.id, name: c.name, type: c.type, sector: c.sector, area: c.area, force }),
      })
      loadCompanies()
    } catch (err) {
      console.error('[map] summary generation failed:', err)
    } finally {
      setGeneratingSummary(false)
    }
  }

  async function setPriority(id: number, priority: 'high' | 'normal' | 'low' | 'avoid') {
    await fetch(`/api/dashboard/map/companies/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prospect_priority: priority }),
    })
    loadCompanies()
  }

  async function saveNote(id: number) {
    setSavingNote(true)
    try {
      await fetch(`/api/dashboard/map/companies/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: noteDraft }),
      })
      loadCompanies()
    } finally {
      setSavingNote(false)
    }
  }

  return (
    <div className={s.fullPage}>
      <div className={s.fullPageTopbar}>
        <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
        <span className={s.fpPageTitle}>MAP</span>
        <span className={s.fpPageSubtitle}>ATLAS · Territory Intelligence</span>
      </div>

      <div className={m.cols}>
        <div className={m.canvasCol}>
          {companies && (
            <MapCanvas companies={companies} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>

        <div className={m.panelCol}>
          {!selected ? (
            <OverviewPanel overview={overview} />
          ) : (
            <CompanyPanel
              company={selected}
              prospects={prospects}
              generatingSummary={generatingSummary}
              noteDraft={noteDraft}
              savingNote={savingNote}
              onBack={() => setSelectedId(null)}
              onRegenerateSummary={() => void generateSummary(selected, true)}
              onSetPriority={priority => void setPriority(selected.id, priority)}
              onNoteChange={setNoteDraft}
              onSaveNote={() => void saveNote(selected.id)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function OverviewPanel({ overview }: { overview: OverviewStats | null }) {
  if (!overview) return <p className={m.empty}>Loading…</p>

  const maxNationality = Math.max(1, ...overview.nationalities.map(n => n.count))
  const maxCompany = Math.max(1, ...overview.topCompanies.map(c => c.booked))
  const maxSource = Math.max(1, ...overview.sources.map(s2 => s2.count))

  return (
    <>
      <div>
        <div className={m.sectionTitle}>TERRITORY OVERVIEW</div>
        <div className={m.statRow2}>
          <div className={m.statTile}><div className={m.statTileVal}>{overview.companiesMapped}</div><div className={m.statTileLabel}>Companies mapped</div></div>
          <div className={m.statTile}><div className={m.statTileVal}>{overview.totalWashed}</div><div className={m.statTileLabel}>Prospects washed</div></div>
          <div className={m.statTile}><div className={m.statTileVal}>{overview.totalBooked}</div><div className={m.statTileLabel}>Meetings booked</div></div>
          <div className={m.statTile}><div className={m.statTileVal}>{overview.untouchedCount}</div><div className={m.statTileLabel}>Untouched companies</div></div>
        </div>
      </div>

      <div>
        <div className={m.sectionTitle}>BOOKINGS BY NATIONALITY</div>
        {overview.nationalities.length === 0 ? <p className={m.empty}>None yet.</p> : overview.nationalities.map(n => (
          <div key={n.nationality} className={m.barRow}>
            <span className={m.barLabel}>{NATIONALITY_FLAGS[n.nationality] ?? ''} {n.nationality}</span>
            <div className={m.barTrack}><div className={m.barFill} style={{ width: `${(n.count / maxNationality) * 100}%` }} /></div>
            <span className={m.barValue}>{n.count}</span>
          </div>
        ))}
      </div>

      <div>
        <div className={m.sectionTitle}>TOP PERFORMING COMPANIES</div>
        {overview.topCompanies.length === 0 ? <p className={m.empty}>None yet.</p> : overview.topCompanies.map(c => (
          <div key={c.name} className={m.barRow}>
            <span className={m.barLabel}>{c.name}</span>
            <div className={m.barTrack}><div className={m.barFill} style={{ width: `${(c.booked / maxCompany) * 100}%` }} /></div>
            <span className={m.barValue}>{c.booked}</span>
          </div>
        ))}
      </div>

      <div>
        <div className={m.sectionTitle}>LEAD SOURCES (BOOKINGS)</div>
        {overview.sources.length === 0 ? <p className={m.empty}>None yet.</p> : overview.sources.map(src => (
          <div key={src.source} className={m.barRow}>
            <span className={m.barLabel}>{src.source}</span>
            <div className={m.barTrack}><div className={m.barFill} style={{ width: `${(src.count / maxSource) * 100}%` }} /></div>
            <span className={m.barValue}>{src.count}</span>
          </div>
        ))}
      </div>

      <div>
        <div className={m.sectionTitle}>UNTOUCHED — HIGH PRIORITY</div>
        {overview.untouched.length === 0 ? <p className={m.empty}>Nothing untouched.</p> : overview.untouched.map(u => (
          <div key={u.name} className={m.untouchedRow}>
            <span className={m.untouchedName}>{u.name}</span>
            <span className={m.untouchedMeta}>{u.employeesEst ? `${u.employeesEst.toLocaleString()} staff` : u.sector ?? ''}</span>
          </div>
        ))}
      </div>

      <div>
        <div className={m.sectionTitle}>LEGEND</div>
        <div className={m.legendRow}><span className={m.legendDot} style={{ background: '#e8621a' }} /> Hot (3+ booked)</div>
        <div className={m.legendRow}><span className={m.legendDot} style={{ background: '#f39c12' }} /> Warm (1-2 booked)</div>
        <div className={m.legendRow}><span className={m.legendDot} style={{ background: '#3498db' }} /> Cold (being worked)</div>
        <div className={m.legendRow}><span className={m.legendDot} style={{ background: '#666' }} /> Untouched</div>
        <div className={m.legendRow}><span className={m.legendDot} style={{ background: '#9b59b6' }} /> Priority target</div>
        <div className={m.legendRow}><span className={m.legendDot} style={{ background: '#e74c3c' }} /> Avoid</div>
      </div>
    </>
  )
}

function CompanyPanel({
  company, prospects, generatingSummary, noteDraft, savingNote,
  onBack, onRegenerateSummary, onSetPriority, onNoteChange, onSaveNote,
}: {
  company: MapCompanyWithStats
  prospects: CompanyProspect[] | null
  generatingSummary: boolean
  noteDraft: string
  savingNote: boolean
  onBack: () => void
  onRegenerateSummary: () => void
  onSetPriority: (p: 'high' | 'normal' | 'low' | 'avoid') => void
  onNoteChange: (v: string) => void
  onSaveNote: () => void
}) {
  const status = statusOf(company)

  return (
    <>
      <button className={m.backBtn} onClick={onBack}>← Back to overview</button>

      <div>
        <div className={m.tagRow}>
          {company.sector && <span className={m.tag}>{company.sector}</span>}
          {company.area && <span className={m.tag}>{company.area}</span>}
        </div>
        <div className={m.companyName}>{company.name}</div>
        <div className={m.companyMeta}>
          {company.sector ?? 'Company'} · {company.area ?? 'Geneva'}{company.employees_est ? ` · ${company.employees_est.toLocaleString()} staff` : ''}
        </div>
        <span className={m.statusPill} style={{ background: `${status.colour}22`, color: status.colour }}>{status.label}</span>
        {company.prospect_priority === 'avoid' && company.avoid_reason && (
          <div className={m.companyMeta} style={{ marginTop: 6 }}>⚠️ {company.avoid_reason}</div>
        )}
      </div>

      <div className={m.statRow4}>
        <div className={m.statTile}><div className={m.statTileVal}>{company.total_washed}</div><div className={m.statTileLabel}>Washed</div></div>
        <div className={m.statTile}><div className={m.statTileVal}>{company.green_prospects}</div><div className={m.statTileLabel}>Green</div></div>
        <div className={m.statTile}><div className={m.statTileVal}>{company.total_booked}</div><div className={m.statTileLabel}>Meetings booked</div></div>
        <div className={m.statTile}><div className={m.statTileVal}>{company.meetings_sat}</div><div className={m.statTileLabel}>Meetings sat</div></div>
      </div>

      {Object.keys(company.nationalities).length > 0 && (
        <div>
          <div className={m.sectionTitle}>NATIONALITIES BOOKED HERE</div>
          {Object.entries(company.nationalities).map(([nat, count]) => (
            <div key={nat} className={m.barRow}>
              <span className={m.barLabel}>{NATIONALITY_FLAGS[nat] ?? ''} {nat}</span>
              <div className={m.barTrack}><div className={m.barFill} style={{ width: `${Math.min(100, count * 25)}%` }} /></div>
              <span className={m.barValue}>{count}</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className={m.sectionTitle}>COMPANY INTEL</div>
        {generatingSummary ? (
          <p className={m.empty}>Generating…</p>
        ) : company.ai_summary ? (
          <>
            {(() => {
              const parsed = parseSummary(company.ai_summary)
              return parsed ? (
                <div className={m.intelFields}>
                  <div><span className={m.intelLabel}>What they do</span><p className={m.summaryText}>{parsed.what_they_do}</p></div>
                  <div><span className={m.intelLabel}>Who's there</span><p className={m.summaryText}>{parsed.who_is_there}</p></div>
                  <div><span className={m.intelLabel}>Office type</span><p className={m.summaryText}>{parsed.office_type}</p></div>
                </div>
              ) : (
                <p className={m.summaryText}>{company.ai_summary}</p>
              )
            })()}
            <button className={m.refreshBtn} onClick={onRegenerateSummary} disabled={generatingSummary}>↻ Refresh intel</button>
          </>
        ) : (
          <p className={m.empty}>No intel yet.</p>
        )}
      </div>

      <div>
        <div className={m.sectionTitle}>OFFICE INFO</div>
        {company.hq_location && <div className={m.officeRow}><span className={m.officeLabel}>HQ</span><span>{company.hq_location}</span></div>}
        <div className={m.officeRow}><span className={m.officeLabel}>This office</span><span>{company.office_type === 'hq' ? 'Global HQ' : company.office_type === 'regional' ? 'Regional office' : company.office_type}</span></div>
        {company.swiss_offices.length > 0 && (
          <div className={m.officeRow}><span className={m.officeLabel}>Other Swiss</span><span>{company.swiss_offices.join(', ')}</span></div>
        )}
      </div>

      {company.cassandra_notes && (
        <div>
          <div className={m.sectionTitle}>CASSANDRA ALERTS</div>
          <div className={m.alertBox}>{company.cassandra_notes}</div>
        </div>
      )}

      <div>
        <div className={m.sectionTitle}>PROSPECTS HERE</div>
        {prospects === null ? (
          <p className={m.empty}>Loading…</p>
        ) : prospects.length === 0 ? (
          <p className={m.empty}>None washed yet.</p>
        ) : prospects.map(p => (
          <div key={p.id} className={m.prospectRow}>
            <span className={m.prospectDot} style={{ background: PROSPECT_DOT[p.status] }} />
            <span>{p.first_name} {p.last_name}</span>
          </div>
        ))}
      </div>

      <div>
        <div className={m.sectionTitle}>COMPANY NOTE</div>
        <textarea className={m.noteInput} value={noteDraft} onChange={e => onNoteChange(e.target.value)} placeholder="Add a note about this company…" />
        <div className={m.actionRow}>
          <button className={m.actionBtn} onClick={onSaveNote} disabled={savingNote}>{savingNote ? 'Saving…' : 'Save note'}</button>
        </div>
      </div>

      <div className={m.actionRow}>
        <button className={`${m.actionBtn} ${company.prospect_priority === 'high' ? m.actionBtnActive : ''}`} onClick={() => onSetPriority(company.prospect_priority === 'high' ? 'normal' : 'high')}>
          {company.prospect_priority === 'high' ? '✓ Priority target' : 'Mark as priority'}
        </button>
        <button className={`${m.actionBtn} ${company.prospect_priority === 'avoid' ? m.actionBtnActive : ''}`} onClick={() => onSetPriority(company.prospect_priority === 'avoid' ? 'normal' : 'avoid')}>
          {company.prospect_priority === 'avoid' ? '✓ Avoid' : 'Mark as avoid'}
        </button>
      </div>
    </>
  )
}
