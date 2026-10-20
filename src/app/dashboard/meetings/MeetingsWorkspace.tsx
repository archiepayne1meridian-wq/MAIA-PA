'use client'

// MEETINGS — post-meeting debrief voice notes. Mirrors the Calls (Apollo)
// agent's shape (file drop -> transcribe -> structured output -> chat) but
// simpler: no manual transcript-confirm/outcome-select gate — transcription
// and Claude structuring both run automatically on upload — and no DB
// persistence until Archie explicitly saves (see src/lib/meetings.ts).

import { useState } from 'react'
import s from './meetings.module.css'
import FileDropZone from '../components/FileDropZone'
import ChatInput from '@/components/ChatInput'
import type { MeetingNotes, RefineTurn } from '@/lib/meetings'

const ALLOWED_EXTENSIONS = ['mp3', 'm4a', 'wav', 'ogg']
const MAX_SIZE_BYTES = 200 * 1024 * 1024

type Stage = 'upload' | 'uploading' | 'transcribing' | 'structuring' | 'ready'

interface ChatMessage { role: 'user' | 'assistant'; content: string }
interface ProspectCandidate { id: string; name: string; company: string | null }

function uploadWithProgress(url: string, formData: FormData, onProgress: (pct: number) => void): Promise<{ transcript: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      let body: { error?: string; transcript?: string } = {}
      try { body = JSON.parse(xhr.responseText) } catch { /* fall through */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.transcript !== undefined) resolve({ transcript: body.transcript })
      else reject(new Error(body.error ?? 'Transcription failed'))
    }
    xhr.onerror = () => reject(new Error('Network error — check your connection'))
    xhr.send(formData)
  })
}

export default function MeetingsWorkspace() {
  const [sessionKey, setSessionKey] = useState(0)
  const [stage, setStage] = useState<Stage>('upload')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const [notes, setNotes] = useState<MeetingNotes | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saveOutcome, setSaveOutcome] = useState<
    | { kind: 'saved'; prospectName: string | null }
    | { kind: 'disambiguate'; candidates: ProspectCandidate[] }
    | { kind: 'error'; message: string }
    | null
  >(null)
  const [disambiguateChoice, setDisambiguateChoice] = useState('')

  const [followUpBooked, setFollowUpBooked] = useState(false)
  const [bookingFollowUp, setBookingFollowUp] = useState(false)

  const [companyUnknown, setCompanyUnknown] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [qaSector, setQaSector] = useState('')
  const [qaArea, setQaArea] = useState('')
  const [qaSaving, setQaSaving] = useState(false)
  const [qaSaved, setQaSaved] = useState(false)

  function resetSession() {
    setSessionKey(k => k + 1)
    setStage('upload')
    setUploadProgress(0)
    setSelectedFile(null)
    setSessionError(null)
    setNotes(null)
    setChatMessages([])
    setChatInput('')
    setSaveOutcome(null)
    setDisambiguateChoice('')
    setFollowUpBooked(false)
    setCompanyUnknown(false)
    setShowQuickAdd(false)
    setQaSector('')
    setQaArea('')
    setQaSaved(false)
  }

  async function checkCompanyKnown(name: string) {
    try {
      const res = await fetch(`/api/dashboard/meetings/quick-add-company?name=${encodeURIComponent(name)}`)
      const data = await res.json() as { exists?: boolean }
      setCompanyUnknown(data.exists === false)
    } catch { /* non-critical — leave the nudge unshown rather than guess */ }
  }

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setSessionError('Unsupported format — use .mp3, .m4a, .wav, or .ogg')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setSessionError('File too large — max 200MB')
      return
    }

    setSessionError(null)
    setSelectedFile(file)
    setStage('uploading')
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('audio', file)

    try {
      const { transcript } = await uploadWithProgress('/api/dashboard/meetings/transcribe', formData, pct => {
        setUploadProgress(pct)
        if (pct >= 100) setStage('transcribing')
      })

      setStage('structuring')
      const res = await fetch('/api/dashboard/meetings/structure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript }),
      })
      const data = await res.json() as { notes?: MeetingNotes; error?: string }
      if (!res.ok || !data.notes) throw new Error(data.error ?? 'Structuring failed')

      setNotes(data.notes)
      setStage('ready')
      if (data.notes.employerMentioned) void checkCompanyKnown(data.notes.employerMentioned)
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Something went wrong')
      setStage('upload')
    }
  }

  async function sendChat() {
    const text = chatInput.trim()
    if (!text || chatSending || !notes) return
    setChatInput('')
    setChatSending(true)
    const history: ChatMessage[] = [...chatMessages, { role: 'user', content: text }]
    setChatMessages(history)

    try {
      const refineHistory: RefineTurn[] = chatMessages.map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/dashboard/meetings/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, history: refineHistory, message: text }),
      })
      const data = await res.json() as { reply?: string; notes?: MeetingNotes; error?: string }
      if (!res.ok || !data.notes) throw new Error(data.error ?? 'Refinement failed')

      setNotes(data.notes)
      setChatMessages([...history, { role: 'assistant', content: data.reply ?? 'Updated.' }])
      if (data.notes.employerMentioned && data.notes.employerMentioned !== notes.employerMentioned) {
        void checkCompanyKnown(data.notes.employerMentioned)
      }
    } catch (err) {
      setChatMessages(prev => prev.slice(0, -1))
      setChatInput(text)
      setChatMessages(prev => [...prev, { role: 'assistant', content: err instanceof Error ? err.message : 'That tweak failed — try again.' }])
    } finally {
      setChatSending(false)
    }
  }

  async function saveToCrm(prospectId?: string) {
    if (!notes) return
    setSaving(true)
    setSaveOutcome(null)
    try {
      const res = await fetch('/api/dashboard/meetings/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, prospectId }),
      })
      const data = await res.json() as {
        saved?: boolean; prospectName?: string | null; noMatch?: boolean
        needsDisambiguation?: boolean; candidates?: ProspectCandidate[]; error?: string
      }
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      if (data.noMatch) {
        setSaveOutcome({ kind: 'error', message: "No prospect in the CRM matches this name — check the spelling, or add them to Prospects first." })
      } else if (data.needsDisambiguation) {
        setSaveOutcome({ kind: 'disambiguate', candidates: data.candidates ?? [] })
      } else {
        setSaveOutcome({ kind: 'saved', prospectName: data.prospectName ?? null })
      }
    } catch (err) {
      setSaveOutcome({ kind: 'error', message: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  async function bookFollowUp() {
    if (!notes?.followUpDate) return
    setBookingFollowUp(true)
    try {
      await fetch('/api/dashboard/meetings/book-followup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectName: notes.prospectName, date: notes.followUpDate, type: notes.followUpType, companyName: notes.employerMentioned,
        }),
      })
      setFollowUpBooked(true)
    } catch (err) {
      console.error('[meetings] book follow-up failed:', err)
    } finally {
      setBookingFollowUp(false)
    }
  }

  async function quickAddCompany() {
    if (!notes?.employerMentioned) return
    setQaSaving(true)
    try {
      await fetch('/api/dashboard/meetings/quick-add-company', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: notes.employerMentioned, sector: qaSector || null, area: qaArea || null }),
      })
      setQaSaved(true)
      setCompanyUnknown(false)
      setShowQuickAdd(false)
    } catch (err) {
      console.error('[meetings] quick-add company failed:', err)
    } finally {
      setQaSaving(false)
    }
  }

  function updateNotesField<K extends keyof MeetingNotes>(field: K, value: MeetingNotes[K]) {
    setNotes(prev => prev ? { ...prev, [field]: value } : prev)
  }

  function updateAction(list: 'actionsMine' | 'actionsSteve', index: number, text: string) {
    setNotes(prev => {
      if (!prev) return prev
      const next = [...prev[list]]
      next[index] = text
      return { ...prev, [list]: next }
    })
  }

  function removeAction(list: 'actionsMine' | 'actionsSteve', index: number) {
    setNotes(prev => prev ? { ...prev, [list]: prev[list].filter((_, i) => i !== index) } : prev)
  }

  function addAction(list: 'actionsMine' | 'actionsSteve') {
    setNotes(prev => prev ? { ...prev, [list]: [...prev[list], ''] } : prev)
  }

  return (
    <div className={s.shell} key={sessionKey}>
      <div className={s.header}>
        <span className={s.headerTitle}>🗓 MEETINGS</span>
        {stage === 'ready' && <button className={s.newBtn} onClick={resetSession}>+ New debrief</button>}
      </div>

      {stage === 'upload' && (
        <div className={s.uploadWrap}>
          <FileDropZone
            accept={ALLOWED_EXTENSIONS}
            onFile={file => void handleFile(file)}
            icon="🎙"
            label="Drop Steve's debrief voice note here or click"
            hint="Accepts: .mp3 .m4a .wav .ogg — max 200MB"
          />
          {sessionError && <p className={s.errorText}>{sessionError}</p>}
        </div>
      )}

      {(stage === 'uploading' || stage === 'transcribing' || stage === 'structuring') && (
        <div className={s.statusCard}>
          {selectedFile && (
            <p className={s.fileLabel}>
              {selectedFile.name} · {selectedFile.size < 1024 * 1024 ? `${Math.max(1, Math.round(selectedFile.size / 1024))} KB` : `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`}
            </p>
          )}
          {stage === 'uploading' && (
            <>
              <p>Uploading… {uploadProgress}%</p>
              <div className={s.progressBar}><div className={s.progressFill} style={{ width: `${uploadProgress}%` }} /></div>
            </>
          )}
          {stage === 'transcribing' && (
            <>
              <div className={s.spinner} />
              <p>Transcribing the voice note…</p>
            </>
          )}
          {stage === 'structuring' && (
            <>
              <div className={s.spinner} />
              <p>Structuring the debrief — Prospect Snapshot, Meeting Notes, Actions…</p>
            </>
          )}
        </div>
      )}

      {stage === 'ready' && notes && (
        <div className={s.readyWrap}>
          <div className={s.section}>
            <div className={s.sectionLabel}>PROSPECT SNAPSHOT</div>
            <textarea
              className={s.sectionTextarea}
              value={notes.prospectSnapshot}
              onChange={e => updateNotesField('prospectSnapshot', e.target.value)}
              rows={4}
            />
          </div>

          <div className={s.section}>
            <div className={s.sectionLabel}>MEETING NOTES</div>
            <textarea
              className={s.sectionTextarea}
              value={notes.meetingNotes}
              onChange={e => updateNotesField('meetingNotes', e.target.value)}
              rows={7}
            />
          </div>

          <div className={s.actionsRow}>
            <div className={s.section}>
              <div className={s.sectionLabel}>ACTIONS — MINE</div>
              {notes.actionsMine.map((a, i) => (
                <div key={i} className={s.actionRow}>
                  <input type="checkbox" className={s.actionCheck} />
                  <input className={s.actionInput} value={a} onChange={e => updateAction('actionsMine', i, e.target.value)} />
                  <button className={s.actionRemove} onClick={() => removeAction('actionsMine', i)} aria-label="Remove">×</button>
                </div>
              ))}
              <button className={s.addActionBtn} onClick={() => addAction('actionsMine')}>+ add</button>
            </div>

            <div className={s.section}>
              <div className={s.sectionLabel}>ACTIONS — STEVE&apos;S</div>
              {notes.actionsSteve.map((a, i) => (
                <div key={i} className={s.actionRow}>
                  <input type="checkbox" className={s.actionCheck} />
                  <input className={s.actionInput} value={a} onChange={e => updateAction('actionsSteve', i, e.target.value)} />
                  <button className={s.actionRemove} onClick={() => removeAction('actionsSteve', i)} aria-label="Remove">×</button>
                </div>
              ))}
              <button className={s.addActionBtn} onClick={() => addAction('actionsSteve')}>+ add</button>
            </div>
          </div>

          {notes.followUpDate && (
            <div className={s.nudge}>
              📅 Follow-up extracted: <strong>{notes.followUpDate}</strong>{notes.followUpType ? ` — ${notes.followUpType}` : ''}
              <button className={s.nudgeBtn} onClick={() => void bookFollowUp()} disabled={bookingFollowUp || followUpBooked}>
                {followUpBooked ? '✓ Booked' : bookingFollowUp ? 'Booking…' : 'Book this as a follow-up call?'}
              </button>
            </div>
          )}

          {companyUnknown && notes.employerMentioned && !qaSaved && (
            <div className={s.nudge}>
              🗺 <strong>{notes.employerMentioned}</strong> isn&apos;t on the map yet — add it?
              {!showQuickAdd ? (
                <button className={s.nudgeBtn} onClick={() => setShowQuickAdd(true)}>Add to map</button>
              ) : (
                <div className={s.quickAddForm}>
                  <input className={s.quickAddInput} placeholder="Sector (optional)" value={qaSector} onChange={e => setQaSector(e.target.value)} />
                  <input className={s.quickAddInput} placeholder="Area (optional)" value={qaArea} onChange={e => setQaArea(e.target.value)} />
                  <button className={s.nudgeBtn} onClick={() => void quickAddCompany()} disabled={qaSaving}>{qaSaving ? 'Adding…' : 'Save'}</button>
                </div>
              )}
            </div>
          )}

          <div className={s.chatSection}>
            <div className={s.sectionLabel}>REFINE</div>
            <div className={s.chatMessages}>
              {chatMessages.length === 0 ? (
                <p className={s.chatEmpty}>Tell MAIA what to change — &quot;change permit type to G permit&quot;, &quot;add that he mentioned his brother works at UBS&quot;.</p>
              ) : (
                chatMessages.map((m, i) => (
                  <div key={i} className={`${s.chatMsg} ${m.role === 'user' ? s.chatMsgUser : s.chatMsgAssistant}`}>{m.content}</div>
                ))
              )}
            </div>
            <ChatInput value={chatInput} onChange={setChatInput} onSend={() => void sendChat()} sending={chatSending} placeholder="Tweak the notes…" />
          </div>

          <div className={s.saveBar}>
            {saveOutcome?.kind === 'saved' && (
              <span className={s.saveSuccess}>✓ Saved to {saveOutcome.prospectName ?? "the prospect's"} CRM record</span>
            )}
            {saveOutcome?.kind === 'error' && <span className={s.errorText}>{saveOutcome.message}</span>}
            {saveOutcome?.kind === 'disambiguate' && (
              <div className={s.disambiguate}>
                <span>Couldn&apos;t confidently match a prospect — pick one:</span>
                <select className={s.disambiguateSelect} value={disambiguateChoice} onChange={e => setDisambiguateChoice(e.target.value)}>
                  <option value="">— select —</option>
                  {saveOutcome.candidates.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>
                  ))}
                </select>
                <button className={s.saveBtn} onClick={() => disambiguateChoice && void saveToCrm(disambiguateChoice)} disabled={!disambiguateChoice || saving}>
                  Confirm
                </button>
              </div>
            )}
            {saveOutcome?.kind !== 'saved' && (
              <button className={s.saveBtn} onClick={() => void saveToCrm()} disabled={saving || saveOutcome?.kind === 'disambiguate'}>
                {saving ? 'Saving…' : 'Save to CRM'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
