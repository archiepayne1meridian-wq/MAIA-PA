'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import s from '../dashboard.module.css'
import { ROUTABLE_AGENTS, routeSlugFor } from '../DashboardClient'

// Web Speech API types — same minimal shim as Composer.tsx (no shared hook
// exists yet; this mirrors that file rather than introducing one).
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
interface SpeechResultEvent { results: { [i: number]: { [j: number]: { transcript: string } } } }
interface SpeechErrorEvent { error: string }

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  const win = window as AnyWindow
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
}

interface ChatAction {
  type: 'navigate' | 'search' | 'generate' | 'oracle' | 'nexus' | null
  payload: Record<string, unknown>
}
interface ChatResponse {
  intent: string
  message: string
  action: ChatAction
}

const AUTO_DISMISS_MS = 8000
const LONG_MESSAGE_CHARS = 220
const VOICE_PREF_KEY = 'maia_chatbar_voice_on'

// GENERATE intent's payload.type -> route slug. Extends the spec's own
// agentMap with mercury, which the spec's GENERATE rules list ("email/template
// -> MERCURY template") but its sample client code omitted.
const GENERATE_AGENT_MAP: Record<string, string> = { iris: 'iris', hermes: 'hermes', diana: 'diana', mercury: 'mercury' }

export default function MaiaChatBar() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const recogRef = useRef<SpeechRecognitionInstance | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [response, setResponse] = useState<ChatResponse | null>(null)
  const [voiceOn, setVoiceOn] = useState(false)

  useEffect(() => {
    try {
      setVoiceOn(localStorage.getItem(VOICE_PREF_KEY) === '1')
    } catch { /* localStorage unavailable — leave default off */ }
  }, [])

  function toggleVoice() {
    setVoiceOn(prev => {
      const next = !prev
      try { localStorage.setItem(VOICE_PREF_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  // Cmd+K (or Ctrl+K) focuses the bar from anywhere on the dashboard.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) { clearTimeout(dismissTimerRef.current); dismissTimerRef.current = null }
    setResponse(null)
  }, [])

  const speak = useCallback(async (text: string) => {
    try {
      const res = await fetch('/api/dashboard/maia/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) return
      const buffer = await res.arrayBuffer()
      const blob = new Blob([buffer], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      audioRef.current?.pause()
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play().catch(() => { /* autoplay blocked — silent skip */ })
    } catch (err) {
      console.error('[maia-chatbar] speak error', err)
    }
  }, [])

  function runAction(action: ChatAction) {
    const payload = action.payload ?? {}
    switch (action.type) {
      case 'navigate': {
        const agentId = String(payload.agent ?? '').toUpperCase()
        if (ROUTABLE_AGENTS.has(agentId)) router.push(`/dashboard/${routeSlugFor(agentId)}`)
        break
      }
      case 'search': {
        const query = String(payload.query ?? '').trim()
        if (query) router.push(`/dashboard/muse?search=${encodeURIComponent(query)}`)
        break
      }
      case 'oracle': {
        const linkedinText = String(payload.linkedinText ?? '')
        try { sessionStorage.setItem('oracle_pending', linkedinText) } catch { /* ignore */ }
        router.push('/dashboard/oracle')
        break
      }
      case 'generate': {
        const type = String(payload.type ?? '')
        const slug = GENERATE_AGENT_MAP[type]
        if (slug) router.push(`/dashboard/${slug}`)
        break
      }
      case 'nexus':
      default:
        // NEXUS isn't built — nothing to navigate to. The response card carries
        // the explanation; leave it on screen for the user to read.
        break
    }
  }

  async function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setValue('')
    setSending(true)
    dismiss()
    try {
      const res = await fetch('/api/dashboard/maia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })
      if (!res.ok) {
        setResponse({ intent: 'error', message: 'MAIA is unavailable right now — try again in a moment.', action: { type: null, payload: {} } })
        return
      }
      const data = await res.json() as ChatResponse
      setResponse(data)
      if (voiceOn) void speak(data.message)
      runAction(data.action)
      if (data.message.length <= LONG_MESSAGE_CHARS) {
        dismissTimerRef.current = setTimeout(() => setResponse(null), AUTO_DISMISS_MS)
      }
    } catch (err) {
      console.error('[maia-chatbar] submit error', err)
      setResponse({ intent: 'error', message: "Couldn't reach MAIA — check your connection.", action: { type: null, payload: {} } })
    } finally {
      setSending(false)
    }
  }

  function handleMic() {
    if (sending) return
    if (listening) {
      recogRef.current?.abort()
      recogRef.current = null
      setListening(false)
      return
    }
    const SR = getSpeechRecognition()
    if (!SR) {
      setVoiceError('Voice unavailable — type instead')
      return
    }
    setVoiceError(null)
    setListening(true)

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
      setListening(false)
      void submit(transcript)
    }
    recog.onerror = (e) => {
      console.warn('[maia-chatbar] speech error', e.error)
      recogRef.current = null
      setListening(false)
      if (e.error === 'not-allowed') setVoiceError('Mic permission denied — type instead')
    }
    recog.onend = () => {
      recogRef.current = null
      if (!resultReceived) setListening(false)
    }
    recog.start()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !sending) void submit(value)
    if (e.key === 'Escape') dismiss()
  }

  function copyResponse() {
    if (!response) return
    navigator.clipboard?.writeText(response.message).catch(() => { /* ignore */ })
  }

  return (
    <div className={s.maiaChatBarWrap}>
      {response && (
        <div className={s.maiaChatCard} onClick={dismiss}>
          <div className={s.maiaChatCardBody} onClick={(e) => e.stopPropagation()}>
            <p className={s.maiaChatCardText}>{response.message}</p>
            <div className={s.maiaChatCardActions}>
              <button className={s.maiaChatCardBtn} onClick={copyResponse}>Copy</button>
              <button className={s.maiaChatCardBtn} onClick={dismiss}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

      <div className={s.maiaChatBar}>
        <button
          className={`${s.maiaChatMic} ${listening ? s.maiaChatMicActive : ''}`}
          onClick={handleMic}
          disabled={sending}
          aria-label={listening ? 'Stop listening' : 'Voice input'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3" />
          </svg>
        </button>

        <input
          ref={inputRef}
          className={s.maiaChatInput}
          placeholder="Type a command, paste a LinkedIn profile, ask anything…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />

        <button
          className={`${s.maiaChatVoiceToggle} ${voiceOn ? s.maiaChatVoiceToggleOn : ''}`}
          onClick={toggleVoice}
          aria-label={voiceOn ? 'Voice responses on' : 'Voice responses off'}
          title={voiceOn ? 'Voice responses on' : 'Voice responses off'}
        >
          {voiceOn ? '🔊' : '🔇'}
        </button>

        <button className={s.maiaChatSend} onClick={() => void submit(value)} disabled={sending || !value.trim()}>
          {sending ? '…' : 'Send'}
        </button>
      </div>
      <div className={s.maiaChatHint}>
        {voiceError ? <span className={s.maiaVoiceError}>{voiceError}</span> : <>⌘K — focus chat</>}
      </div>
    </div>
  )
}
