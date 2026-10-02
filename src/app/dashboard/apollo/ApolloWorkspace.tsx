'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import s from '../dashboard.module.css'
import a from './apollo.module.css'

const ALLOWED_EXTENSIONS = ['mp3', 'mp4', 'm4a', 'wav', 'ogg', 'webm']
const MAX_SIZE_BYTES = 200 * 1024 * 1024

type Outcome = 'booked' | 'follow_up' | 'drop'
type Speaker = 'Archie' | 'Prospect'
type SessionStage = 'idle' | 'upload' | 'uploading' | 'transcribing' | 'confirm' | 'analysing'

interface Turn {
  id: string
  speaker: Speaker
  time: string | null
  text: string
}

interface ApolloCallSummary {
  id: string
  call_date: string
  prospect_name: string | null
  created_at: number
  outcome: Outcome | null
  stageReached: string | null
  coachingInsight: string | null
  fillerWords: Record<string, number> | null
  winningPhrases: string[]
  savedPhraseIndices: number[]
  crmNotes: string | null
  confirmationEmail: string | null
  emailSent: boolean
  followUpNotes: string | null
  followUpDate: string | null
  dropReason: string | null
  dropped: boolean
  prospectQuality: string | null
  callSummary: string | null
  reminderSet: boolean
  reminderType: string | null
  reminderDate: string | null
}

function normaliseSpeaker(raw: string): Speaker {
  return /archie/i.test(raw) ? 'Archie' : 'Prospect'
}

function parseTranscriptToTurns(transcript: string, makeId: () => string): Turn[] {
  return transcript
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => {
      const withTime = line.match(/^\[(\d{1,2}:\d{2})\]\s*([^:]+):\s*(.*)$/)
      if (withTime) {
        const [, time, speakerRaw, text] = withTime
        return { id: makeId(), speaker: normaliseSpeaker(speakerRaw), time, text }
      }
      const noTime = line.match(/^([^:]+):\s*(.*)$/)
      if (noTime) {
        const [, speakerRaw, text] = noTime
        return { id: makeId(), speaker: normaliseSpeaker(speakerRaw), time: null, text }
      }
      return { id: makeId(), speaker: 'Archie' as const, time: null, text: line }
    })
}

function serialiseTurns(turns: Turn[]): string {
  return turns.map(t => (t.time ? `[${t.time}] ${t.speaker}: ${t.text}` : `${t.speaker}: ${t.text}`)).join('\n')
}

function uploadWithProgress(url: string, formData: FormData): Promise<{ callId: string; transcript: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.onload = () => {
      let body: { error?: string; callId?: string; transcript?: string } = {}
      try { body = JSON.parse(xhr.responseText) } catch { /* fall through */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.callId && body.transcript !== undefined) {
        resolve({ callId: body.callId, transcript: body.transcript })
      } else {
        reject(new Error(body.error ?? 'Transcription failed'))
      }
    }
    xhr.onerror = () => reject(new Error('Network error — check your connection'))
    xhr.send(formData)
  })
}

const FILLER_LABELS: Record<string, string> = {
  you_know: '"you know"', sort_of: '"sort of"', basically: '"basically"',
  kind_of: '"kind of"', obviously: '"obviously"',
}
const STAGE_LABELS: Record<string, string> = {
  opener: 'Opener', fact_find: 'Fact find', enlarge: 'Enlarge', disturb: 'Disturb', close: 'Close', completed: 'Completed',
}

function relDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function ApolloWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const idCounterRef = useRef(0)
  const makeId = useCallback(() => `turn-${idCounterRef.current++}`, [])

  const [calls, setCalls] = useState<ApolloCallSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [sessionStage, setSessionStage] = useState<SessionStage>('idle')
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [callId, setCallId] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [prospectName, setProspectName] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const [chatInput, setChatInput] = useState('')
  const [savingPhrase, setSavingPhrase] = useState<string | null>(null)
  const [actingOn, setActingOn] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    fetch('/api/dashboard/apollo')
      .then(r => r.ok ? r.json() as Promise<{ calls: ApolloCallSummary[] }> : Promise.reject(new Error(`${r.status}`)))
      .then(d => setCalls(d.calls))
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => { load() }, [load])

  function resetSession() {
    setSessionStage('idle')
    setSessionError(null)
    setCallId(null)
    setTurns([])
    setProspectName('')
    setOutcome(null)
    setUploadProgress(0)
  }

  function startNewCall() {
    setSessionStage('upload')
    setSessionError(null)
  }

  function validateFile(file: File): string | null {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.includes(ext)) return 'Unsupported format — use .mp3, .m4a, .wav, .mp4, .ogg, or .webm'
    if (file.size > MAX_SIZE_BYTES) return 'File too large — max 200MB'
    return null
  }

  async function handleFile(file: File) {
    const validationError = validateFile(file)
    if (validationError) { setSessionError(validationError); return }

    setSessionError(null)
    setSessionStage('uploading')
    const formData = new FormData()
    formData.append('audio', file)

    try {
      setSessionStage('transcribing')
      const result = await uploadWithProgress('/api/dashboard/apollo/transcribe', formData)
      setCallId(result.callId)
      setTurns(parseTranscriptToTurns(result.transcript, makeId))
      setSessionStage('confirm')
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Transcription failed')
      setSessionStage('upload')
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }
  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
    e.target.value = ''
  }

  function toggleTurnSpeaker(turnId: string) {
    setTurns(prev => prev.map(t => (t.id === turnId ? { ...t, speaker: t.speaker === 'Archie' ? 'Prospect' : 'Archie' } : t)))
  }
  function commitTurnText(turnId: string, text: string) {
    setTurns(prev => prev.map(t => (t.id === turnId ? { ...t, text } : t)))
  }

  async function handleAnalyse() {
    if (!callId || !outcome) return
    setSessionStage('analysing')
    setSessionError(null)
    try {
      const res = await fetch('/api/dashboard/apollo/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, transcript: serialiseTurns(turns), prospectName: prospectName.trim() || null, outcome }),
      })
      const body = await res.json() as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Analysis failed')
      resetSession()
      load()
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Analysis failed')
      setSessionStage('confirm')
    }
  }

  function handleChatSend() {
    const text = chatInput.trim()
    setChatInput('')
    if (/new call/i.test(text) || text === '') startNewCall()
  }

  async function savePhraseToMuse(callSummary: ApolloCallSummary, idx: number, phrase: string) {
    setSavingPhrase(`${callSummary.id}-${idx}`)
    try {
      await fetch('/api/dashboard/apollo/save-phrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: callSummary.id, phraseIndex: idx, phrase }),
      })
      load()
    } finally {
      setSavingPhrase(null)
    }
  }

  async function handleConfirmDrop(id: string) {
    setActingOn(id)
    try {
      await fetch('/api/dashboard/apollo/confirm-drop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: id }),
      })
      load()
    } finally { setActingOn(null) }
  }

  async function handleSetReminder(id: string, type: 'show_up' | 'follow_up', date: string | null) {
    setActingOn(id)
    try {
      await fetch('/api/dashboard/apollo/set-reminder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: id, type, date }),
      })
      load()
    } finally { setActingOn(null) }
  }

  async function handleMarkSent(id: string) {
    setActingOn(id)
    try {
      await fetch('/api/dashboard/apollo/mark-sent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: id }),
      })
      load()
    } finally { setActingOn(null) }
  }

  async function copyToClipboard(text: string) {
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
  }

  const isBusy = sessionStage === 'uploading' || sessionStage === 'transcribing' || sessionStage === 'analysing'

  return (
    <div className={a.page}>
      <button className={a.newCallBtn} onClick={startNewCall} disabled={sessionStage !== 'idle'}>+ New call</button>

      <div className={a.thread}>
        {error && <p className={a.errorText}>{error}</p>}

        {/* In-progress session */}
        {sessionStage !== 'idle' && (
          <div className={a.uploadCard}>
            <div className={a.cardHeader}><span className={a.cardTitle}>📞 NEW CALL</span></div>

            {(sessionStage === 'upload' || sessionStage === 'uploading' || sessionStage === 'transcribing') && (
              <>
                <div
                  className={`${a.dropZone} ${dragOver ? a.dropZoneActive : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => !isBusy && fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept=".mp3,.mp4,.m4a,.wav,.ogg,.webm" style={{ display: 'none' }} onChange={handleFilePick} />
                  {sessionStage === 'upload' && (
                    <>
                      <div className={a.dropZoneIcon}>🎙</div>
                      <p>Drop your 8x8 recording here or click</p>
                      <p className={a.dropZoneHint}>Accepts: .mp3 .mp4 .m4a .wav .ogg .webm — max 200MB</p>
                    </>
                  )}
                  {(sessionStage === 'uploading' || sessionStage === 'transcribing') && (
                    <>
                      <div className={a.spinner} />
                      <p>APOLLO is transcribing your call...</p>
                      <p className={a.dropZoneHint}>This takes about 30 seconds.</p>
                    </>
                  )}
                </div>
                {sessionError && <p className={a.errorText}>{sessionError}</p>}
              </>
            )}

            {(sessionStage === 'confirm' || sessionStage === 'analysing') && (
              <>
                <p className={a.transcriptHint}>TRANSCRIPT — confirm before analysis</p>
                <div className={a.turns}>
                  {turns.map(turn => (
                    <div key={turn.id} className={a.turn}>
                      <span
                        className={`${a.turnSpeaker} ${turn.speaker === 'Archie' ? a.turnSpeakerArchie : a.turnSpeakerProspect}`}
                        onClick={() => toggleTurnSpeaker(turn.id)}
                        title="Click to swap speaker"
                      >
                        {turn.speaker}
                      </span>
                      <div
                        className={a.turnText}
                        contentEditable={sessionStage === 'confirm'}
                        suppressContentEditableWarning
                        onBlur={e => commitTurnText(turn.id, e.currentTarget.innerText)}
                      >
                        {turn.text}
                      </div>
                    </div>
                  ))}
                </div>
                <p className={a.transcriptHint} style={{ paddingBottom: 8 }}>
                  Click any speaker label to swap between Archie / Prospect · Click any line to edit text
                </p>

                <div className={a.confirmFields}>
                  <div>
                    <span className={a.fieldLabel}>Prospect name (first name + initial)</span>
                    <input
                      className={a.nameInput}
                      placeholder="e.g. John S."
                      value={prospectName}
                      onChange={e => setProspectName(e.target.value)}
                      disabled={sessionStage === 'analysing'}
                    />
                  </div>
                  <div>
                    <span className={a.fieldLabel}>Outcome</span>
                    <div className={a.outcomeRow}>
                      <button className={`${a.outcomeBtn} ${outcome === 'booked' ? a.outcomeBtnActive : ''}`} onClick={() => setOutcome('booked')} disabled={sessionStage === 'analysing'}>📅 Meeting booked</button>
                      <button className={`${a.outcomeBtn} ${outcome === 'follow_up' ? a.outcomeBtnActive : ''}`} onClick={() => setOutcome('follow_up')} disabled={sessionStage === 'analysing'}>🔄 Follow up — keep</button>
                      <button className={`${a.outcomeBtn} ${outcome === 'drop' ? a.outcomeBtnActive : ''}`} onClick={() => setOutcome('drop')} disabled={sessionStage === 'analysing'}>🗑 Drop from CRM</button>
                    </div>
                  </div>
                  {sessionError && <p className={a.errorText} style={{ padding: 0 }}>{sessionError}</p>}
                  <button className={a.analyseBtn} onClick={() => void handleAnalyse()} disabled={!outcome || sessionStage === 'analysing'}>
                    {sessionStage === 'analysing' ? 'Analysing…' : 'Analyse →'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Completed calls — most recent first */}
        {calls === null ? (
          <p className={a.emptyThread}>Loading…</p>
        ) : calls.length === 0 && sessionStage === 'idle' ? (
          <p className={a.emptyThread}>No calls yet. Click &quot;+ New call&quot; to upload your first recording.</p>
        ) : (
          calls.map(call => (
            <div key={call.id} className={a.callGroup}>
              <div className={a.callGroupDivider}><span>{call.prospect_name ?? 'Unnamed prospect'} · {relDate(call.created_at)}</span></div>

              {/* Coaching card — always */}
              <div className={a.card}>
                <div className={a.cardHeader}><span className={a.cardTitle}>🎯 COACHING INSIGHT</span></div>
                <div className={a.cardBody}>
                  {call.coachingInsight}
                  <div className={a.coachingStage}>Stage reached: {call.stageReached ? STAGE_LABELS[call.stageReached] ?? call.stageReached : '—'}</div>
                  {call.fillerWords && Object.keys(call.fillerWords).length > 0 && (
                    <div className={a.fillerRow}>
                      {Object.entries(call.fillerWords).filter(([, n]) => n > 0).map(([key, n]) => (
                        <span key={key}>{FILLER_LABELS[key] ?? key} ×{n}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Winning phrases */}
              {call.winningPhrases.length > 0 && (
                <div className={a.card}>
                  <div className={a.cardHeader}><span className={a.cardTitle}>✨ PHRASES THAT LANDED</span></div>
                  {call.winningPhrases.map((phrase, idx) => {
                    const saved = call.savedPhraseIndices.includes(idx)
                    return (
                      <div key={idx} className={a.phraseRow}>
                        <span className={a.phraseText}>&quot;{phrase}&quot;</span>
                        {saved ? (
                          <span className={a.savedTag}>Saved to MUSE ✓</span>
                        ) : (
                          <button
                            style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-mid)', cursor: 'pointer' }}
                            onClick={() => void savePhraseToMuse(call, idx, phrase)}
                            disabled={savingPhrase === `${call.id}-${idx}`}
                          >
                            {savingPhrase === `${call.id}-${idx}` ? 'Saving…' : 'Save to MUSE'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Booked outcome */}
              {call.outcome === 'booked' && (
                <>
                  {call.crmNotes && (
                    <div className={a.card}>
                      <div className={a.cardHeader}><span className={a.cardTitle}>📋 CRM NOTES — {call.prospect_name ?? 'Unnamed'}</span></div>
                      <div className={a.cardBody}>{call.crmNotes}</div>
                      <div className={a.cardActions}>
                        <button className={a.outcomeBtn} onClick={() => void copyToClipboard(call.crmNotes!)}>📋 Copy to clipboard</button>
                      </div>
                    </div>
                  )}
                  {call.confirmationEmail && (
                    <div className={a.card}>
                      <div className={a.cardHeader}><span className={a.cardTitle}>✉️ CONFIRMATION EMAIL</span></div>
                      <div className={a.cardBody}>{call.confirmationEmail}</div>
                      <div className={a.cardActions}>
                        <button className={a.outcomeBtn} onClick={() => void copyToClipboard(call.confirmationEmail!)}>📋 Copy</button>
                        <button
                          className={`${a.outcomeBtn} ${call.emailSent ? a.outcomeBtnActive : ''}`}
                          onClick={() => void handleMarkSent(call.id)}
                          disabled={call.emailSent || actingOn === call.id}
                        >
                          {call.emailSent ? '✓ Sent' : 'Mark sent'}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className={a.card}>
                    <div className={a.cardHeader}><span className={a.cardTitle}>🔔 SHOW-UP CALL</span></div>
                    <div className={a.cardBody}>
                      Call {call.prospect_name ?? 'the prospect'} the day before their meeting to confirm they&apos;re coming.
                    </div>
                    <div className={a.cardActions}>
                      <button
                        className={`${a.outcomeBtn} ${call.reminderSet && call.reminderType === 'show_up' ? a.outcomeBtnActive : ''}`}
                        onClick={() => void handleSetReminder(call.id, 'show_up', null)}
                        disabled={(call.reminderSet && call.reminderType === 'show_up') || actingOn === call.id}
                      >
                        {call.reminderSet && call.reminderType === 'show_up' ? '✓ Reminder set' : 'Set reminder'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Follow-up outcome */}
              {call.outcome === 'follow_up' && (
                <div className={a.card}>
                  <div className={a.cardHeader}><span className={a.cardTitle}>🔄 FOLLOW UP</span></div>
                  <div className={a.cardBody}>
                    {call.followUpNotes}
                    <div className={a.coachingStage}>Call back: {call.followUpDate ?? 'no timeframe given'}</div>
                  </div>
                  <div className={a.cardActions}>
                    <button
                      className={`${a.outcomeBtn} ${call.reminderSet && call.reminderType === 'follow_up' ? a.outcomeBtnActive : ''}`}
                      onClick={() => void handleSetReminder(call.id, 'follow_up', call.followUpDate)}
                      disabled={(call.reminderSet && call.reminderType === 'follow_up') || actingOn === call.id}
                    >
                      {call.reminderSet && call.reminderType === 'follow_up' ? '✓ Reminder set' : 'Set reminder'}
                    </button>
                  </div>
                </div>
              )}

              {/* Drop outcome */}
              {call.outcome === 'drop' && (
                <div className={a.card}>
                  <div className={a.cardHeader}><span className={a.cardTitle}>🗑 DROP FROM CRM</span></div>
                  <div className={a.cardBody}>
                    {call.dropReason}
                    <div className={a.coachingStage}>This frees up one of your 750 CRM spots.</div>
                  </div>
                  <div className={a.cardActions}>
                    {call.dropped ? (
                      <span className={a.savedTag}>Dropped ✓</span>
                    ) : (
                      <>
                        <button className={a.analyseBtn} onClick={() => void handleConfirmDrop(call.id)} disabled={actingOn === call.id}>Confirm drop</button>
                        <button className={a.outcomeBtn} disabled>Keep anyway</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className={s.irisChatInputRow}>
        <input
          className={s.irisChatTextarea}
          style={{ resize: 'none' }}
          placeholder='Type "new call" or click + New call above…'
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleChatSend() }}
        />
        <button className={s.irisChatSendBtn} onClick={handleChatSend}>Send</button>
      </div>
    </div>
  )
}
