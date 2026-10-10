'use client'

// The upload → transcribe → confirm → analyse session, extracted out of
// ApolloWorkspace so the exact same real pipeline (Whisper transcription,
// speaker-swap editing, outcome selection, /analyse) can also be mounted
// inline in the hub's Calls conversation panel — rather than duplicating
// the logic, or leaving the hub panel's "New call" button pointing at a
// page that would re-upload (and re-pay for) a file already transcribed
// from the hub.

import { useState, useRef, useCallback, useEffect } from 'react'
import a from './apollo.module.css'
import FileDropZone from '../components/FileDropZone'

const ALLOWED_EXTENSIONS = ['mp3', 'mp4', 'm4a', 'wav', 'ogg']
const MAX_SIZE_BYTES = 200 * 1024 * 1024

export type Speaker = 'Archie' | 'Prospect'
export type SessionStage = 'upload' | 'uploading' | 'transcribing' | 'confirm' | 'analysing'
type Outcome = 'booked' | 'follow_up' | 'drop'

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

function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<{ callId: string; transcript: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
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

interface Props {
  onComplete?: () => void
  onStageChange?: (stage: SessionStage) => void
}

export default function CallUploadFlow({ onComplete, onStageChange }: Props) {
  const idCounterRef = useRef(0)
  const makeId = useCallback(() => `turn-${idCounterRef.current++}`, [])

  const [sessionStage, setSessionStage] = useState<SessionStage>('upload')
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [callId, setCallId] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [prospectName, setProspectName] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  useEffect(() => { onStageChange?.(sessionStage) }, [sessionStage, onStageChange])

  function resetSession() {
    setSessionStage('upload')
    setSessionError(null)
    setCallId(null)
    setTurns([])
    setProspectName('')
    setOutcome(null)
    setUploadProgress(0)
    setSelectedFile(null)
  }

  function validateFile(file: File): string | null {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.includes(ext)) return 'Unsupported format — use .mp3, .m4a, .wav, .mp4, or .ogg'
    if (file.size > MAX_SIZE_BYTES) return 'File too large — max 200MB'
    return null
  }

  async function handleFile(file: File) {
    const validationError = validateFile(file)
    if (validationError) { setSessionError(validationError); return }

    setSessionError(null)
    setSelectedFile(file)
    setSessionStage('uploading')
    setUploadProgress(0)
    const formData = new FormData()
    formData.append('audio', file)

    try {
      const result = await uploadWithProgress('/api/dashboard/apollo/transcribe', formData, pct => {
        setUploadProgress(pct)
        if (pct >= 100) setSessionStage('transcribing')
      })
      setCallId(result.callId)
      setTurns(parseTranscriptToTurns(result.transcript, makeId))
      setSessionStage('confirm')
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Transcription failed')
      setSessionStage('upload')
    }
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
      onComplete?.()
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Analysis failed')
      setSessionStage('confirm')
    }
  }

  return (
    <div className={a.uploadCard}>
      <div className={a.cardHeader}><span className={a.cardTitle}>📞 NEW CALL</span></div>

      {sessionStage === 'upload' && (
        <div style={{ margin: '12px 14px 14px' }}>
          <FileDropZone
            accept={ALLOWED_EXTENSIONS}
            onFile={file => void handleFile(file)}
            icon="🎙"
            label="Drop your 8x8 recording here or click"
            hint="Accepts: .mp3 .mp4 .m4a .wav .ogg — max 200MB"
          />
          {sessionError && <p className={a.errorText} style={{ padding: '8px 0 0' }}>{sessionError}</p>}
        </div>
      )}

      {(sessionStage === 'uploading' || sessionStage === 'transcribing') && (
        <div className={a.dropZone} style={{ cursor: 'default' }}>
          {selectedFile && (
            <p className={a.dropZoneHint} style={{ color: 'var(--text)', fontSize: 11, marginBottom: 8 }}>
              {selectedFile.name} · {selectedFile.size < 1024 * 1024 ? `${Math.max(1, Math.round(selectedFile.size / 1024))} KB` : `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`}
            </p>
          )}
          {sessionStage === 'uploading' ? (
            <>
              <p>Uploading… {uploadProgress}%</p>
              <div className={a.uploadProgressBar}><div className={a.uploadProgressFill} style={{ width: `${uploadProgress}%` }} /></div>
            </>
          ) : (
            <>
              <div className={a.spinner} />
              <p>APOLLO is transcribing your call...</p>
              <p className={a.dropZoneHint}>This takes about 30 seconds.</p>
            </>
          )}
        </div>
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
  )
}
