'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import s from '../dashboard.module.css'

const ALLOWED_EXTENSIONS = ['mp3', 'mp4', 'm4a', 'wav', 'ogg', 'webm']
const MAX_SIZE_BYTES = 200 * 1024 * 1024 // 200MB

type ProcessingState =
  | 'idle' | 'uploading' | 'transcribing' | 'complete'
  | 'analysing' | 'generating' | 'done' | 'error'

interface TranscribeResponse {
  callId: string
  transcript: string
  duration: number | null
}

interface ApolloIntelligence {
  prospect_name: string | null
  [key: string]: unknown
}

// ── Editable transcript turns ────────────────────────────────────────────────
// Each turn is one speaker's block: "[MM:SS] Archie: text" or, for turns created
// by splitting/merging in the editor, "Archie: text" with no timestamp.

type Speaker = 'Archie' | 'Prospect'

interface Turn {
  id: string
  speaker: Speaker
  time: string | null
  text: string
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

interface RecentCall {
  id: string
  call_date: string
  prospect_name: string | null
  created_at: number
}

interface FullCall {
  id: string
  call_date: string
  prospect_name: string | null
  transcript: string | null
  intelligence: ApolloIntelligence | null
  advisorBrief: string | null
  clientEmail: string | null
  museSaved: boolean
}

function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<TranscribeResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let body: { error?: string } & Partial<TranscribeResponse> = {}
      try { body = JSON.parse(xhr.responseText) } catch { /* fall through to status check */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.callId && body.transcript !== undefined) {
        resolve(body as TranscribeResponse)
      } else {
        reject(new Error(body.error ?? 'Transcription failed'))
      }
    }
    xhr.onerror = () => reject(new Error('Network error — check your connection'))
    xhr.send(formData)
  })
}

export default function ApolloWorkspace() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [state, setState] = useState<ProcessingState>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const [callId, setCallId] = useState<string | null>(null)
  const [originalTranscript, setOriginalTranscript] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [copied, setCopied] = useState(false)

  const [intelligence, setIntelligence] = useState<ApolloIntelligence | null>(null)
  const [advisorBrief, setAdvisorBrief] = useState<string | null>(null)
  const [clientEmail, setClientEmail] = useState<string | null>(null)
  const [coachingInsight, setCoachingInsight] = useState<string | null>(null)
  const [museSaved, setMuseSaved] = useState(false)
  const [briefCopied, setBriefCopied] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)

  // Live mirror of `turns` for handlers that need the current array without
  // waiting on a re-render (split/merge caret math, Analyse Call submission).
  const turnsRef = useRef<Turn[]>([])
  useEffect(() => { turnsRef.current = turns }, [turns])

  const idCounterRef = useRef(0)
  const makeId = useCallback(() => `turn-${idCounterRef.current++}`, [])

  const turnRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [focusTarget, setFocusTarget] = useState<{ id: string; caret: number } | null>(null)

  // Places the caret inside a turn's text div after a structural edit
  // (split/merge) — contenteditable doesn't preserve cursor position across a
  // React re-render on its own.
  useEffect(() => {
    if (!focusTarget) return
    const el = turnRefs.current[focusTarget.id]
    if (el) {
      el.focus()
      const textNode = el.firstChild
      const range = document.createRange()
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const offset = Math.min(focusTarget.caret, (textNode.textContent ?? '').length)
        range.setStart(textNode, offset)
        range.setEnd(textNode, offset)
      } else {
        range.selectNodeContents(el)
        range.collapse(true)
      }
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    setFocusTarget(null)
  }, [turns, focusTarget])

  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([])
  const [viewLoadingId, setViewLoadingId] = useState<string | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)

  function refetchRecentCalls() {
    fetch('/api/dashboard/apollo')
      .then(r => r.ok ? r.json() as Promise<{ calls: RecentCall[] }> : { calls: [] })
      .then(d => setRecentCalls(d.calls ?? []))
      .catch(() => { /* non-fatal — history is a convenience, not critical path */ })
  }

  useEffect(() => { refetchRecentCalls() }, [])

  function validateFile(file: File): string | null {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return 'Unsupported format — use .mp3, .m4a, .wav, .mp4, .ogg, or .webm'
    }
    if (file.size > MAX_SIZE_BYTES) {
      return 'File too large — max 200MB'
    }
    return null
  }

  async function handleFile(file: File) {
    const validationError = validateFile(file)
    if (validationError) {
      setErrorMsg(validationError)
      setState('error')
      return
    }

    setErrorMsg(null)
    setOriginalTranscript(null)
    setTurns([])
    setCallId(null)
    setIntelligence(null)
    setAdvisorBrief(null)
    setClientEmail(null)
    setCoachingInsight(null)
    setMuseSaved(false)
    setState('uploading')
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('audio', file)

    try {
      const result = await uploadWithProgress(
        '/api/dashboard/apollo/transcribe',
        formData,
        (pct) => {
          setUploadProgress(pct)
          if (pct >= 100) setState('transcribing')
        },
      )
      setCallId(result.callId)
      setOriginalTranscript(result.transcript)
      setTurns(parseTranscriptToTurns(result.transcript, makeId))
      setState('complete')
      refetchRecentCalls()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Transcription failed')
      setState('error')
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
    e.target.value = ''
  }

  function handleCopy() {
    if (turns.length === 0) return
    void navigator.clipboard.writeText(serialiseTurns(turns))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Reads any in-progress (not-yet-blurred) edit straight out of the DOM and
  // folds it into the turns array, without waiting on React state timing —
  // needed because a click on "Analyse Call" can fire before the contenteditable
  // div's onBlur has committed.
  function commitActiveTurnEdit(): Turn[] {
    const active = document.activeElement as HTMLElement | null
    const activeTurnId = active?.getAttribute?.('data-turn-id')
    if (!activeTurnId) return turnsRef.current
    const updated = turnsRef.current.map(t => (t.id === activeTurnId ? { ...t, text: active!.innerText } : t))
    turnsRef.current = updated
    setTurns(updated)
    return updated
  }

  async function handleAnalyse() {
    if (!callId) return
    setErrorMsg(null)

    const finalTurns = commitActiveTurnEdit()
    const editedTranscript = serialiseTurns(finalTurns)

    setState('analysing')

    try {
      const analyseRes = await fetch('/api/dashboard/apollo/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, transcript: editedTranscript }),
      })
      const analyseBody = await analyseRes.json() as { intelligence?: ApolloIntelligence; error?: string }
      if (!analyseRes.ok) throw new Error(analyseBody.error ?? 'Analysis failed')
      setIntelligence(analyseBody.intelligence ?? null)

      setState('generating')
      const generateRes = await fetch('/api/dashboard/apollo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      })
      const generateBody = await generateRes.json() as { advisorBrief?: string; clientEmail?: string; coaching_insight?: string; error?: string }
      if (!generateRes.ok) throw new Error(generateBody.error ?? 'Output generation failed')
      setAdvisorBrief(generateBody.advisorBrief ?? null)
      setClientEmail(generateBody.clientEmail ?? null)
      setCoachingInsight(generateBody.coaching_insight ?? null)
      setState('done')
      // MUSE auto-save is fire-and-forget server-side; give it a moment then
      // show the confirmation badge (matches the design — save never blocks
      // output display, but the badge should appear shortly after).
      setTimeout(() => { setMuseSaved(true); refetchRecentCalls() }, 1500)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Analysis failed')
      setState('error')
    }
  }

  async function handleViewCall(id: string) {
    setViewLoadingId(id)
    setViewError(null)
    try {
      const res = await fetch(`/api/dashboard/apollo/${id}`)
      const body = await res.json() as { call?: FullCall; error?: string }
      if (!res.ok || !body.call) throw new Error(body.error ?? 'Could not load call')

      const call = body.call
      setCallId(call.id)
      setOriginalTranscript(call.transcript)
      setTurns(call.transcript ? parseTranscriptToTurns(call.transcript, makeId) : [])
      setIntelligence(call.intelligence)
      setAdvisorBrief(call.advisorBrief)
      setClientEmail(call.clientEmail)
      setCoachingInsight(null)  // not persisted — only available fresh after re-running Analyse Call
      setMuseSaved(call.museSaved)
      setErrorMsg(null)
      setState(call.advisorBrief ? 'done' : call.transcript ? 'complete' : 'idle')
    } catch (err) {
      setViewError(err instanceof Error ? err.message : 'Could not load call')
    } finally {
      setViewLoadingId(null)
    }
  }

  function handleSwapSpeakers() {
    setTurns(prev => prev.map(t => ({ ...t, speaker: t.speaker === 'Archie' ? 'Prospect' : 'Archie' })))
  }

  function handleResetTranscript() {
    if (!originalTranscript) return
    setTurns(parseTranscriptToTurns(originalTranscript, makeId))
  }

  function toggleTurnSpeaker(turnId: string) {
    setTurns(prev => prev.map(t => (t.id === turnId ? { ...t, speaker: t.speaker === 'Archie' ? 'Prospect' : 'Archie' } : t)))
  }

  function commitTurnText(turnId: string, text: string) {
    setTurns(prev => prev.map(t => (t.id === turnId ? { ...t, text } : t)))
  }

  function splitTurn(turnId: string, caret: number) {
    const newId = makeId()
    setTurns(prev => {
      const idx = prev.findIndex(t => t.id === turnId)
      if (idx === -1) return prev
      const turn = prev[idx]
      const before = turn.text.slice(0, caret)
      const after = turn.text.slice(caret)
      const otherSpeaker: Speaker = turn.speaker === 'Archie' ? 'Prospect' : 'Archie'
      const updated = [...prev]
      updated[idx] = { ...turn, text: before }
      updated.splice(idx + 1, 0, { id: newId, speaker: otherSpeaker, time: null, text: after })
      return updated
    })
    setFocusTarget({ id: newId, caret: 0 })
  }

  function mergeWithPrevious(turnId: string) {
    const idx = turnsRef.current.findIndex(t => t.id === turnId)
    if (idx <= 0) return
    const previous = turnsRef.current[idx - 1]
    const caret = previous.text.length
    setTurns(prev => {
      const i = prev.findIndex(t => t.id === turnId)
      if (i <= 0) return prev
      const current = prev[i]
      const prevTurn = prev[i - 1]
      const updated = [...prev]
      updated[i - 1] = { ...prevTurn, text: prevTurn.text + current.text }
      updated.splice(i, 1)
      return updated
    })
    setFocusTarget({ id: previous.id, caret })
  }

  function handleTurnKeyDown(e: React.KeyboardEvent<HTMLDivElement>, turnId: string) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const el = e.currentTarget
      let caret = el.innerText.length
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        if (el.contains(range.startContainer)) {
          const preRange = range.cloneRange()
          preRange.selectNodeContents(el)
          preRange.setEnd(range.startContainer, range.startOffset)
          caret = preRange.toString().length
        }
      }
      splitTurn(turnId, caret)
      return
    }
    if (e.key === 'Backspace') {
      const el = e.currentTarget
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        const atStart = range.collapsed
          && range.startOffset === 0
          && (range.startContainer === el || range.startContainer === el.firstChild)
        if (atStart) {
          e.preventDefault()
          mergeWithPrevious(turnId)
        }
      }
    }
  }

  function handleCopyOutput(text: string | null, which: 'brief' | 'email') {
    if (!text) return
    void navigator.clipboard.writeText(text)
    if (which === 'brief') { setBriefCopied(true); setTimeout(() => setBriefCopied(false), 2000) }
    else { setEmailCopied(true); setTimeout(() => setEmailCopied(false), 2000) }
  }

  const isBusy = state === 'uploading' || state === 'transcribing' || state === 'analysing' || state === 'generating'

  return (
    <div className={s.fullPage} style={{ overflow: 'hidden' }}>
      <div className={s.fullPageTopbar}>
        <a href="/dashboard" className={s.fpBack} onClick={(e) => { e.preventDefault(); router.push('/dashboard') }}>← Dashboard</a>
        <span className={s.fpPageTitle}>APOLLO</span>
        <span className={s.fpPageSubtitle}>Call Intelligence</span>
      </div>

      <div className={s.fullPageCols} style={{ overflow: 'hidden' }}>

        {/* Left — Upload */}
        <div className={s.fpCol} style={{ width: '25%', flexShrink: 0 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>Upload</div>
          </div>

          <div
            className={s.apolloDropZone}
            style={dragOver ? { borderColor: 'var(--accent-deep)', color: 'var(--accent)' } : undefined}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !isBusy && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.mp4,.m4a,.wav,.ogg,.webm"
              style={{ display: 'none' }}
              onChange={handleFilePick}
            />
            {state === 'idle' && (
              <>
                <div className={s.apolloDropIcon}>🎙</div>
                <p>Drop your 8x8 recording here</p>
                <p className={s.apolloDropHint}>.mp3 .mp4 .m4a .wav .ogg .webm — max 200MB</p>
              </>
            )}
            {state === 'uploading' && (
              <>
                <p>Uploading… {uploadProgress}%</p>
                <div className={s.apolloProgressBar}>
                  <div className={s.apolloProgressFill} style={{ width: `${uploadProgress}%` }} />
                </div>
              </>
            )}
            {state === 'transcribing' && (
              <>
                <div className={s.apolloSpinner} />
                <p>Transcribing audio…</p>
                <p className={s.apolloDropHint}>Can take 30–60s for longer calls</p>
              </>
            )}
            {state === 'complete' && (
              <>
                <div className={s.apolloDropIcon}>✓</div>
                <p>Transcript ready</p>
                <p className={s.apolloDropHint}>Drop another file to replace</p>
              </>
            )}
            {state === 'analysing' && (
              <>
                <div className={s.apolloSpinner} />
                <p>Extracting intelligence…</p>
              </>
            )}
            {state === 'generating' && (
              <>
                <div className={s.apolloSpinner} />
                <p>Generating outputs…</p>
              </>
            )}
            {state === 'done' && (
              <>
                <div className={s.apolloDropIcon}>✓</div>
                <p>Brief + email ready</p>
                <p className={s.apolloDropHint}>Drop another file to replace</p>
              </>
            )}
            {state === 'error' && (
              <>
                <div className={s.apolloDropIcon}>⚠</div>
                <p style={{ color: 'var(--alert)' }}>{errorMsg}</p>
                <p className={s.apolloDropHint}>Drop a file to try again</p>
              </>
            )}
          </div>

          {(state === 'complete' || state === 'error') && callId && turns.length > 0 && !advisorBrief && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <button className={s.apolloAnalyseBtn} style={{ flex: 1 }} onClick={() => void handleAnalyse()}>
                Analyse Call
              </button>
              <button className={s.apolloResetTranscriptBtn} onClick={handleResetTranscript} title="Restores the original Whisper output">
                Reset transcript
              </button>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <span className={s.eyebrow} style={{ display: 'block', marginBottom: 8, marginTop: 20 }}>Recent Calls</span>
            {viewError && <p style={{ fontSize: 11, color: 'var(--alert)', marginBottom: 8 }}>{viewError}</p>}
            {recentCalls.length === 0 ? (
              <p className={s.musePanelEmpty} style={{ padding: 0 }}>No calls yet</p>
            ) : (
              recentCalls.map(c => (
                <div key={c.id} className={s.apolloCallRow}>
                  <span className={s.apolloCallName}>{c.prospect_name ?? 'Unnamed prospect'}</span>
                  <span className={s.apolloCallDate}>{c.call_date}</span>
                  <button
                    className={s.apolloCallViewBtn}
                    disabled={viewLoadingId === c.id}
                    onClick={() => void handleViewCall(c.id)}
                  >
                    {viewLoadingId === c.id ? '…' : 'View'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Centre — Transcript */}
        <div className={s.fpCol} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className={s.fpColHead} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div className={s.fpColTitle}>Transcript</div>
            {turns.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={s.apolloCopyBtn} onClick={handleSwapSpeakers} title="Flips Archie/Prospect labels across the whole transcript">
                  ⇄ Swap speakers
                </button>
                <button className={s.apolloCopyBtn} onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy full transcript'}
                </button>
              </div>
            )}
          </div>

          {turns.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-dim)', paddingTop: 12 }}>
              Upload a call recording to see the transcript
            </p>
          ) : (
            <>
              <p className={s.apolloEditHint}>Click any line to edit · Enter to split · Click speaker label to swap</p>
              <div className={s.apolloTranscriptTurns}>
                {turns.map(turn => (
                  <div key={turn.id} className={s.apolloTurn}>
                    <span
                      className={turn.speaker === 'Archie' ? s.apolloTurnSpeakerArchie : s.apolloTurnSpeakerProspect}
                      onClick={() => toggleTurnSpeaker(turn.id)}
                      title="Click to swap speaker"
                    >
                      [{turn.speaker}]
                    </span>
                    <div
                      ref={el => { turnRefs.current[turn.id] = el }}
                      className={s.apolloTurnText}
                      contentEditable
                      suppressContentEditableWarning
                      data-turn-id={turn.id}
                      onKeyDown={e => handleTurnKeyDown(e, turn.id)}
                      onBlur={e => commitTurnText(turn.id, e.currentTarget.innerText)}
                    >
                      {turn.text}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right — Outputs */}
        <div className={s.fpCol} style={{ width: '25%', flexShrink: 0 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>Outputs</div>
          </div>

          {coachingInsight && (
            <div className={s.apolloCoachingCard}>
              <span className={s.apolloCoachingLabel}>Today&apos;s coaching point:</span>
              <p className={s.apolloCoachingText}>{coachingInsight}</p>
            </div>
          )}

          <div className={s.apolloOutputCard} style={{ overflowY: 'auto', maxHeight: '48%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className={s.eyebrow}>Advisor Brief</span>
              {advisorBrief && (
                <button className={s.apolloCopyBtn} onClick={() => handleCopyOutput(advisorBrief, 'brief')}>
                  {briefCopied ? 'Copied!' : 'Copy'}
                </button>
              )}
            </div>
            {!advisorBrief ? (
              <p className={s.apolloOutputEmpty}>
                {state === 'error' && errorMsg ? <span style={{ color: 'var(--alert)' }}>{errorMsg}</span> : 'Generate after transcription'}
              </p>
            ) : (
              <>
                <pre className={s.apolloOutputTextMono}>{advisorBrief}</pre>
                {museSaved && <span className={s.apolloSavedBadge}>Saved to MUSE ✓</span>}
              </>
            )}
          </div>

          <div className={s.apolloOutputCard} style={{ overflowY: 'auto', maxHeight: '48%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className={s.eyebrow}>Client Email</span>
              {clientEmail && (
                <button className={s.apolloCopyBtn} onClick={() => handleCopyOutput(clientEmail, 'email')}>
                  {emailCopied ? 'Copied!' : 'Copy'}
                </button>
              )}
            </div>
            {!clientEmail ? (
              <p className={s.apolloOutputEmpty}>
                {state === 'error' && errorMsg ? <span style={{ color: 'var(--alert)' }}>{errorMsg}</span> : 'Generate after transcription'}
              </p>
            ) : (
              <>
                <p className={s.apolloOutputText}>{clientEmail}</p>
                {museSaved && <span className={s.apolloSavedBadge}>Saved to MUSE ✓</span>}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
