'use client'

// Upload -> transcribe -> analyse, fully automatic — no manual transcript
// confirm step, no outcome buttons. Claude now self-classifies outcome,
// extracts the prospect name, and labels speakers as part of the pipeline
// (see transcribe/route.ts and analyse/route.ts) — a finished call just
// appears at the bottom of the stack. Correcting a transcript/speaker label
// after the fact happens inline in the call card itself (ApolloWorkspace.tsx).
//
// Pinned at the very bottom of the page, below the global chat bar.

import { useState } from 'react'
import a from './apollo.module.css'
import FileDropZone from '../components/FileDropZone'

const ALLOWED_EXTENSIONS = ['mp3', 'mp4', 'm4a', 'wav', 'ogg']
const MAX_SIZE_BYTES = 200 * 1024 * 1024

export type SessionStage = 'upload' | 'uploading' | 'transcribing' | 'analysing'

function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<{ callId: string; transcript: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
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
}

export default function CallUploadFlow({ onComplete }: Props) {
  const [stage, setStage] = useState<SessionStage>('upload')
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.includes(ext)) { setError('Unsupported format — use .mp3, .m4a, .wav, .mp4, or .ogg'); return }
    if (file.size > MAX_SIZE_BYTES) { setError('File too large — max 200MB'); return }

    setError(null)
    setSelectedFile(file)
    setStage('uploading')
    setUploadProgress(0)
    const formData = new FormData()
    formData.append('audio', file)

    try {
      const { callId } = await uploadWithProgress('/api/dashboard/apollo/transcribe', formData, pct => {
        setUploadProgress(pct)
        if (pct >= 100) setStage('transcribing')
      })

      setStage('analysing')
      const res = await fetch('/api/dashboard/apollo/analyse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId }),
      })
      const body = await res.json() as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Analysis failed')

      setStage('upload')
      setSelectedFile(null)
      onComplete?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStage('upload')
    }
  }

  return (
    <div className={a.uploadCardCompact}>
      {stage === 'upload' && (
        <>
          <FileDropZone
            accept={ALLOWED_EXTENSIONS}
            onFile={file => void handleFile(file)}
            icon="🎙"
            label="Drop your 8x8 recording here or click"
            hint="Accepts: .mp3 .mp4 .m4a .wav .ogg — max 200MB"
          />
          {error && <p className={a.errorText}>{error}</p>}
        </>
      )}

      {stage !== 'upload' && (
        <div className={a.uploadStatusRow}>
          {selectedFile && <span className={a.uploadFileName}>{selectedFile.name}</span>}
          {stage === 'uploading' && (
            <>
              <div className={a.uploadProgressBar}><div className={a.uploadProgressFill} style={{ width: `${uploadProgress}%` }} /></div>
              <span>Uploading… {uploadProgress}%</span>
            </>
          )}
          {stage === 'transcribing' && <><div className={a.spinnerSmall} /><span>Transcribing…</span></>}
          {stage === 'analysing' && <><div className={a.spinnerSmall} /><span>Analysing…</span></>}
        </div>
      )}
    </div>
  )
}
