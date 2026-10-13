'use client'

// Shared input bar for every chat-based agent (Iris, Mercury's two tabs,
// Apollo debrief, Cassandra) — mic + text + send, identical everywhere.
// Voice: tap mic -> records (max 60s, auto-stops) -> tap again (or auto-stop)
// -> POSTs the clip to /api/dashboard/transcribe-voice -> transcribed text
// drops into the input for Archie to review and send manually, same as
// typing. Controlled value/onChange so each caller keeps its own existing
// input-state and send() logic — this just replaces the rendered input row.

import { forwardRef, useRef, useState } from 'react'
import s from './ChatInput.module.css'

const MAX_RECORDING_MS = 60_000

export interface ChatInputProps {
  value: string
  onChange: (text: string) => void
  onSend: () => void
  sending?: boolean
  placeholder?: string
}

const ChatInput = forwardRef<HTMLInputElement, ChatInputProps>(function ChatInput(
  { value, onChange, onSend, sending, placeholder },
  ref,
) {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function transcribe(blob: Blob) {
    if (blob.size === 0) return
    setTranscribing(true)
    try {
      const formData = new FormData()
      const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'
      formData.append('audio', blob, `voice.${ext}`)
      const res = await fetch('/api/dashboard/transcribe-voice', { method: 'POST', body: formData })
      const data = await res.json() as { text?: string; error?: string }
      if (!res.ok || typeof data.text !== 'string') throw new Error(data.error ?? 'Transcription failed')
      if (data.text.trim()) onChange(value.trim() ? `${value.trim()} ${data.text.trim()}` : data.text.trim())
    } catch (err) {
      setMicError(err instanceof Error ? err.message : 'Transcription failed')
    } finally {
      setTranscribing(false)
    }
  }

  function clearStopTimer() {
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null }
  }

  function stopRecording() {
    clearStopTimer()
    recorderRef.current?.stop()
    setRecording(false)
  }

  async function startRecording() {
    setMicError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        void transcribe(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
      stopTimerRef.current = setTimeout(stopRecording, MAX_RECORDING_MS)
    } catch {
      setMicError('Microphone unavailable — check browser permissions')
    }
  }

  function toggleMic() {
    if (sending || transcribing) return
    if (recording) stopRecording()
    else void startRecording()
  }

  function handleSend() {
    if (sending || !value.trim()) return
    onSend()
  }

  return (
    <div className={s.bar}>
      <button
        type="button"
        className={`${s.micBtn} ${recording ? s.micBtnActive : ''}`}
        onClick={toggleMic}
        disabled={sending || transcribing}
        aria-label={recording ? 'Stop recording' : 'Start voice input'}
        title={micError ?? (recording ? 'Stop recording' : 'Voice input')}
      >
        {recording && <span className={s.pulseRing} />}
        <span className={s.micIcon}>🎤</span>
      </button>
      <input
        ref={ref}
        className={s.input}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
        placeholder={transcribing ? 'Transcribing…' : recording ? 'Listening…' : placeholder ?? 'Type a message...'}
        disabled={sending || recording}
      />
      <button type="button" className={s.sendBtn} onClick={handleSend} disabled={sending || !value.trim()} aria-label="Send">
        ➤
      </button>
    </div>
  )
})

export default ChatInput
