'use client'

import { useState, useRef, useEffect } from 'react'
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
  const [transcript, setTranscript] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [intelligence, setIntelligence] = useState<ApolloIntelligence | null>(null)
  const [advisorBrief, setAdvisorBrief] = useState<string | null>(null)
  const [clientEmail, setClientEmail] = useState<string | null>(null)
  const [museSaved, setMuseSaved] = useState(false)
  const [briefCopied, setBriefCopied] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)

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
    setTranscript(null)
    setCallId(null)
    setIntelligence(null)
    setAdvisorBrief(null)
    setClientEmail(null)
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
      setTranscript(result.transcript)
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
    if (!transcript) return
    void navigator.clipboard.writeText(transcript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleAnalyse() {
    if (!callId) return
    setErrorMsg(null)
    setState('analysing')

    try {
      const analyseRes = await fetch('/api/dashboard/apollo/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
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
      const generateBody = await generateRes.json() as { advisorBrief?: string; clientEmail?: string; error?: string }
      if (!generateRes.ok) throw new Error(generateBody.error ?? 'Output generation failed')
      setAdvisorBrief(generateBody.advisorBrief ?? null)
      setClientEmail(generateBody.clientEmail ?? null)
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
      setTranscript(call.transcript)
      setIntelligence(call.intelligence)
      setAdvisorBrief(call.advisorBrief)
      setClientEmail(call.clientEmail)
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
    setTranscript(prev => {
      if (!prev) return prev
      const PLACEHOLDER = 'APOLLO_SWAP_MARKER'
      return prev
        .split('Archie:').join(PLACEHOLDER)
        .split('Prospect:').join('Archie:')
        .split(PLACEHOLDER).join('Prospect:')
    })
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

          {(state === 'complete' || state === 'error') && callId && transcript && !advisorBrief && (
            <button className={s.apolloAnalyseBtn} onClick={() => void handleAnalyse()}>
              Analyse Call
            </button>
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
            {transcript && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={s.apolloCopyBtn} onClick={handleSwapSpeakers} title="Flips Archie/Prospect labels across the transcript">
                  ⇄ Swap speakers
                </button>
                <button className={s.apolloCopyBtn} onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy full transcript'}
                </button>
              </div>
            )}
          </div>

          {!transcript ? (
            <p style={{ fontSize: 13, color: 'var(--text-dim)', paddingTop: 12 }}>
              Upload a call recording to see the transcript
            </p>
          ) : (
            <pre className={s.apolloTranscript}>{transcript}</pre>
          )}
        </div>

        {/* Right — Outputs */}
        <div className={s.fpCol} style={{ width: '25%', flexShrink: 0 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>Outputs</div>
          </div>

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
