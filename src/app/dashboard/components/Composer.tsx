'use client'

import { useState, useRef } from 'react'
import type { OrbState } from '../types'
import s from '../dashboard.module.css'

interface Props {
  orbState: OrbState
  onOrbChange: (state: OrbState) => void
  onRoute: (input: string) => Promise<void>
}

// Web Speech API types (not in default TS DOM lib without strictLib config)
type AnyWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionInstance
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechResultEvent) => void) | null
  onerror: ((e: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
}
interface SpeechResultEvent {
  results: { [i: number]: { [j: number]: { transcript: string } } }
}
interface SpeechErrorEvent {
  error: string
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  const win = window as AnyWindow
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
}

export default function Composer({ orbState, onOrbChange, onRoute }: Props) {
  const [value, setValue] = useState('')
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const recogRef = useRef<SpeechRecognitionInstance | null>(null)

  const isBusy = orbState === 'thinking' || orbState === 'speaking'
  const micActive = orbState === 'listening'

  async function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    setValue('')
    await onRoute(trimmed)
  }

  function handleMic() {
    if (isBusy) return

    if (micActive) {
      recogRef.current?.abort()
      recogRef.current = null
      onOrbChange('idle')
      return
    }

    const SR = getSpeechRecognition()
    if (!SR) {
      setVoiceError('Voice unavailable — type instead')
      return
    }

    setVoiceError(null)
    onOrbChange('listening')

    const recog = new SR()
    recog.lang = 'en-GB'
    recog.interimResults = false
    recog.maxAlternatives = 1
    recogRef.current = recog

    let resultReceived = false

    recog.onresult = (e) => {
      resultReceived = true
      const transcript = e.results[0][0].transcript
      recogRef.current = null
      submit(transcript)
    }

    recog.onerror = (e) => {
      console.warn('[composer] speech error', e.error)
      recogRef.current = null
      onOrbChange('idle')
      if (e.error === 'not-allowed') {
        setVoiceError('Mic permission denied — type instead')
      }
    }

    recog.onend = () => {
      recogRef.current = null
      if (!resultReceived) onOrbChange('idle')
    }

    recog.start()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !isBusy) {
      submit(value)
    }
  }

  return (
    <div className={s.composer}>
      <div className={s.composerInner}>
        <input
          className={s.composerInput}
          placeholder="Ask MAIA, or tap the mic…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isBusy}
        />
        <button
          className={`${s.mic} ${micActive ? s.active : ''}`}
          onClick={handleMic}
          disabled={isBusy}
          aria-label={micActive ? 'Stop listening' : 'Voice input'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3" />
          </svg>
        </button>
      </div>
      {voiceError && <div className={s.maiaVoiceError}>{voiceError}</div>}
    </div>
  )
}
