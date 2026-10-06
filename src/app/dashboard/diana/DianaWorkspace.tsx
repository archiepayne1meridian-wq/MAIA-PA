'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import s from '../dashboard.module.css'

type Difficulty = 'warm' | 'neutral' | 'tough'
type Phase = 'idle' | 'active' | 'ended'
type VoiceInputMode = 'text' | 'voice'
type SpeakState = 'idle' | 'speaking' | 'listening'
type Tone = 'red' | 'amber' | 'green'

interface Message {
  role: 'user' | 'diana'
  text: string
}

interface ProfileInfo {
  key: string
  name: string
  company: string
  location: string
  background: string
  todayAngle: string | null
}

interface StageScore {
  stage: string
  label: string
  points: number
  maxPoints: number
  notes: string
}

interface Deduction {
  type: string
  label: string
  points: number
}

interface KnowledgeEvent {
  type: 'correct' | 'wrong'
  topic: string
  points: number
}

interface CallScore {
  stages: StageScore[]
  deductions: Deduction[]
  knowledgeEvents: KnowledgeEvent[]
  total: number
  maxTotal: number
  summary: string
}

interface SessionReview {
  whatWorked: string[]
  whatToImprove: string[]
  focusNext: string
}

interface ObjStat {
  label: string
  count: number
  completedCount: number
  completionPct: number
}

interface SessionRecord {
  id: string
  scenario: string
  company: string | null
  score: number | null
  difficulty: string
  status: string
  date: string
  completed: boolean
}

interface PracticeContext {
  weakPoints: { label: string; tone: Tone }[]
  sessionsThisWeek: { day: string; done: boolean }[]
  streak: { current: number; best: number }
  lastSession: { stageReached: string; role: string; company: string; timeInSwitzerland: string } | null
}

interface FocusData {
  focus: string | null
  weakStageLabel: string | null
  hasData: boolean
}

const DIFF_COLORS: Record<Difficulty, string> = {
  warm: 'var(--online)',
  neutral: 'var(--accent)',
  tough: 'var(--alert)',
}

const TONE_COLORS: Record<Tone, string> = {
  red: 'var(--alert)',
  amber: 'var(--idle)',
  green: 'var(--online)',
}
const TONE_DOT: Record<Tone, string> = { red: '🔴', amber: '🟡', green: '🟢' }

// ── Audio queue: plays blobs sequentially, never overlaps ────────────────────
class AudioQueue {
  private queue: ArrayBuffer[] = []
  private playing = false
  private onStateChange: (state: SpeakState) => void

  constructor(onStateChange: (state: SpeakState) => void) {
    this.onStateChange = onStateChange
  }

  enqueue(buf: ArrayBuffer, onDone?: () => void) {
    this.queue.push(buf)
    if (!this.playing) this.playNext(onDone)
  }

  private playNext(onDone?: () => void) {
    const buf = this.queue.shift()
    if (!buf) {
      this.playing = false
      this.onStateChange('idle')
      onDone?.()
      return
    }
    this.playing = true
    this.onStateChange('speaking')

    const blob = new Blob([buf], { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = () => {
      URL.revokeObjectURL(url)
      this.playNext(onDone)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      this.playNext(onDone)
    }
    void audio.play().catch(() => {
      URL.revokeObjectURL(url)
      this.playNext(onDone)
    })
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export default function DianaWorkspace() {
  // ── Live session state ────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle')
  const [messages, setMessages] = useState<Message[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty>('neutral')
  const [profile, setProfile] = useState<ProfileInfo | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [score, setScore] = useState<CallScore | null>(null)
  const [review, setReview] = useState<SessionReview | null>(null)
  const [outcome, setOutcome] = useState<'completed' | 'lost' | null>(null)
  const [stageReached, setStageReached] = useState<string | null>(null)
  const [scoreNote, setScoreNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [startingCall, setStartingCall] = useState(false)
  const [showDetailedScore, setShowDetailedScore] = useState(false)

  // ── Focus + context state ─────────────────────────────────────────────────
  const [focusData, setFocusData] = useState<FocusData | null>(null)
  const [context, setContext] = useState<PracticeContext | null>(null)

  // ── Performance column state (session history) ────────────────────────────
  const [objStats, setObjStats] = useState<ObjStat[]>([])
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [expandedSessId, setExpandedSessId] = useState<string | null>(null)
  const [perfLoading, setPerfLoading] = useState(true)

  // ── Voice state — voice is the default mode (CHANGE 2) ───────────────────
  const [voiceMode, setVoiceMode] = useState<VoiceInputMode>('voice')
  const [speakState, setSpeakState] = useState<SpeakState>('idle')
  const [listenStatus, setListenStatus] = useState<string | null>(null)
  const [voiceUnavailable, setVoiceUnavailable] = useState(false)
  const [meetingBooked, setMeetingBooked] = useState(false)
  const audioQueueRef = useRef<AudioQueue | null>(null)
  const sendMessageRef = useRef<(text: string) => void>(() => {})

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    audioQueueRef.current = new AudioQueue(setSpeakState)
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/diana/session').then(r => r.json() as Promise<{ session: { id: string; transcript: Message[]; difficulty: string; profile?: ProfileInfo | null } | null }>),
      fetch('/api/dashboard/diana/performance').then(r => r.json() as Promise<{ objectionStats: ObjStat[]; sessions: SessionRecord[] }>),
      fetch('/api/dashboard/diana/focus').then(r => r.json() as Promise<FocusData>),
      fetch('/api/dashboard/diana/context').then(r => r.json() as Promise<PracticeContext>),
    ])
      .then(([sessData, perfData, focus, ctx]) => {
        if (sessData.session) {
          setPhase('active')
          setMessages(sessData.session.transcript ?? [])
          setDifficulty((sessData.session.difficulty as Difficulty) || 'neutral')
          setProfile(sessData.session.profile ?? null)
        }
        setObjStats(perfData.objectionStats ?? [])
        setSessions(perfData.sessions ?? [])
        setFocusData(focus)
        setContext(ctx)
      })
      .catch(e => setError(String(e)))
      .finally(() => { setLoading(false); setPerfLoading(false) })
    setVoiceUnavailable(!hasSpeechRecognition())
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  function hasSpeechRecognition(): boolean {
    type AnyWindow = Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
    const w = window as AnyWindow
    return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition)
  }

  // ── TTS: play base64 audio already returned alongside text, then optionally start mic ──
  const playAudio = useCallback((base64: string | null, afterDone?: () => void) => {
    if (voiceMode !== 'voice' || !base64) { afterDone?.(); return }
    setListenStatus('Prospect is speaking…')
    try {
      const buf = base64ToArrayBuffer(base64)
      audioQueueRef.current?.enqueue(buf, () => {
        setListenStatus(null)
        afterDone?.()
      })
    } catch (err) {
      console.error('[diana] audio decode error', err)
      setListenStatus(null)
      afterDone?.()
    }
  }, [voiceMode])

  // ── Start mic via Web Speech API — auto-sends on result (CHANGE 2) ───────
  const startMic = useCallback(() => {
    type AnyWindow = Window & {
      SpeechRecognition?: new () => SpeechRecognitionInstance
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance
    }
    type SpeechRecognitionInstance = {
      lang: string; continuous: boolean; interimResults: boolean
      start: () => void
      onresult: ((e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void) | null
      onerror: (() => void) | null
      onend: (() => void) | null
    }
    const w = window as AnyWindow
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) {
      setVoiceUnavailable(true)
      setVoiceMode('text')
      return
    }
    const recognition = new SR()
    recognition.lang = 'en-GB'
    recognition.continuous = false
    recognition.interimResults = false
    setListenStatus('Listening…')
    setSpeakState('listening')

    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      setListenStatus(null)
      setSpeakState('idle')
      if (transcript.trim()) {
        setInput('')
        sendMessageRef.current(transcript.trim())
      }
    }
    recognition.onerror = () => {
      setListenStatus(null)
      setSpeakState('idle')
    }
    recognition.onend = () => {
      setListenStatus(null)
    }
    recognition.start()
  }, [])

  async function startSession() {
    setError(null)
    setMeetingBooked(false)
    setStartingCall(true)
    try {
      const res = await fetch('/api/dashboard/diana/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty }),
      })
      const data = await res.json() as {
        session?: { profile?: ProfileInfo | null }
        openingLine?: string
        audio?: string | null
        error?: string
      }
      if (data.error || !data.session) {
        setError(data.error ?? 'Could not start session')
        return
      }
      setProfile(data.session.profile ?? null)
      setMessages(data.openingLine ? [{ role: 'diana', text: data.openingLine }] : [])
      setScore(null)
      setReview(null)
      setOutcome(null)
      setStageReached(null)
      setScoreNote(null)
      setShowDetailedScore(false)
      setPhase('active')

      // "Starting your call — mic is active" → Simon plays "Hello?" → mic activates.
      if (voiceMode === 'voice') {
        playAudio(data.audio ?? null, startMic)
      }
    } finally {
      setStartingCall(false)
    }
  }

  async function endCall() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/diana/end', { method: 'POST' })
      const data = await res.json() as {
        score?: CallScore | null
        review?: SessionReview | null
        stageReached?: string
        outcome?: 'completed' | 'lost'
        note?: string
        audio?: string | null
        error?: string
      }
      if (data.error) {
        setError(data.error)
        return
      }
      setScore(data.score ?? null)
      setReview(data.review ?? null)
      setOutcome(data.outcome ?? null)
      setStageReached(data.stageReached ?? null)
      setScoreNote(data.note ?? null)
      setPhase('ended')

      // Ava reads the scorecard aloud.
      if (voiceMode === 'voice' && data.audio) playAudio(data.audio)

      void Promise.all([
        fetch('/api/dashboard/diana/performance').then(r => r.json() as Promise<{ objectionStats: ObjStat[]; sessions: SessionRecord[] }>),
        fetch('/api/dashboard/diana/focus').then(r => r.json() as Promise<FocusData>),
        fetch('/api/dashboard/diana/context').then(r => r.json() as Promise<PracticeContext>),
      ]).then(([perfData, focus, ctx]) => {
        setObjStats(perfData.objectionStats ?? [])
        setSessions(perfData.sessions ?? [])
        setFocusData(focus)
        setContext(ctx)
      })
    } catch (e) {
      setError(String(e))
    } finally {
      setSending(false)
    }
  }

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || sending) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/diana/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, mode: voiceMode }),
      })
      const data = await res.json() as { text?: string; audio?: string | null; session_ended?: boolean; error?: string }
      if (data.text) {
        setMessages(prev => [...prev, { role: 'diana', text: data.text! }])
        if (detectMeetingBookedClient(data.text)) setMeetingBooked(true)

        if (data.session_ended) {
          // Prospect/Archie said goodbye — end the call automatically rather
          // than waiting for a button press.
          if (voiceMode === 'voice') {
            playAudio(data.audio ?? null, () => void endCall())
          } else {
            void endCall()
          }
        } else if (voiceMode === 'voice') {
          playAudio(data.audio ?? null, startMic)
        }
      } else if (data.error) {
        setError(data.error)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSending(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, sending, voiceMode, playAudio, startMic])

  useEffect(() => { sendMessageRef.current = sendMessage }, [sendMessage])

  async function resetSession() {
    await fetch('/api/dashboard/diana/session', { method: 'DELETE' })
    setPhase('idle')
    setMessages([])
    setScore(null)
    setReview(null)
    setOutcome(null)
    setStageReached(null)
    setScoreNote(null)
    setProfile(null)
    setError(null)
    setMeetingBooked(false)
    setSpeakState('idle')
    setListenStatus(null)
  }

  function newSession() {
    setPhase('idle')
    setMessages([])
    setScore(null)
    setReview(null)
    setOutcome(null)
    setStageReached(null)
    setScoreNote(null)
    setProfile(null)
    setError(null)
    setMeetingBooked(false)
    setSpeakState('idle')
    setListenStatus(null)
  }

  // ── Chart data: session count per day (last 10 days) ─────────────────────
  const trendData = (() => {
    const map = new Map<string, number>()
    for (const sess of sessions) map.set(sess.date, (map.get(sess.date) ?? 0) + 1)
    return Array.from(map.entries()).slice(-10).map(([date, count]) => ({ date, count }))
  })()

  const weakestObjection = objStats.length >= 3 ? objStats[0] : null
  const totalSessions = sessions.length
  const completedSessions = sessions.filter(sess => sess.completed).length

  const isSpeaking = speakState === 'speaking'
  const isListening = speakState === 'listening'
  const inputBlocked = sending || isSpeaking
  const effectiveVoiceMode = voiceMode === 'voice' && phase === 'active'

  if (loading) {
    return (
      <div className={s.fullPage}>
        <div className={s.fullPageTopbar}>
          <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
          <span className={s.fpPageTitle}>DIANA</span>
        </div>
        <div style={{ padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className={s.fullPage}>
      <div className={s.fullPageTopbar}>
        <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
        <span className={s.fpPageTitle}>DIANA</span>
        <span className={s.fpPageSubtitle}>Full Cold Call Practice</span>
        {totalSessions > 0 && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
            {completedSessions}/{totalSessions} sessions completed
          </span>
        )}
      </div>

      <div className={s.fullPageCols}>

        {/* ── Column 1: Live Session (60%) ────────────────────────────────── */}
        <div className={s.fpCol} style={{ flex: 6 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>Live Session</div>

            {(phase === 'active' || phase === 'idle') && !voiceUnavailable && (
              <div className={s.dianaVoiceToggleWrap}>
                <div className={s.dianaVoiceToggle}>
                  <button
                    className={`${s.dianaVoicePill} ${voiceMode === 'text' ? s.dianaVoicePillActive : ''}`}
                    onClick={() => setVoiceMode('text')}
                  >Text</button>
                  <button
                    className={`${s.dianaVoicePill} ${voiceMode === 'voice' ? s.dianaVoicePillActive : ''}`}
                    onClick={() => setVoiceMode('voice')}
                  >Voice</button>
                </div>
                {voiceMode === 'voice' && (
                  <span className={s.dianaVoiceHint}>Voice first — mic activates automatically</span>
                )}
              </div>
            )}
          </div>

          {voiceUnavailable && (
            <p style={{ fontSize: 11, color: 'var(--alert)', marginBottom: 8 }}>
              Voice input unavailable in this browser — using text mode.
            </p>
          )}

          {error && <p style={{ fontSize: 12, color: 'var(--alert)', marginBottom: 8 }}>{error}</p>}

          {/* IDLE — today's focus card + start controls */}
          {phase === 'idle' && (
            <div className={s.dianaStartBlock}>
              <div className={s.dianaFocusCard}>
                <div className={s.fpSectionLabel}>🎯 TODAY&apos;S FOCUS</div>
                <p className={s.dianaFocusText}>
                  {focusData?.hasData && focusData.focus
                    ? focusData.focus
                    : 'No call data yet — generic focus: nail the opener. Get past "who is this?" calmly before anything else.'}
                </p>
                {focusData?.weakStageLabel && (
                  <p className={s.dianaFocusSub}>Weakest stage last time: {focusData.weakStageLabel}</p>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {(['warm', 'neutral', 'tough'] as Difficulty[]).map(d => (
                  <button
                    key={d}
                    className={`${s.dianaDiffBtn} ${difficulty === d ? s.dianaDiffBtnActive : ''}`}
                    onClick={() => setDifficulty(d)}
                    style={difficulty === d ? { borderColor: DIFF_COLORS[d], color: DIFF_COLORS[d] } : undefined}
                  >{d}</button>
                ))}
              </div>
              <button className={s.dianaStartFullBtn} onClick={() => void startSession()} disabled={startingCall}>
                {startingCall ? 'Starting your call — mic is active' : 'Start session →'}
              </button>
              <p className={s.dianaAutonomousNote}>
                You&apos;ll be matched with one of many random prospects — pick up the phone and open the call.
              </p>
            </div>
          )}

          {/* ACTIVE — call transcript */}
          {phase === 'active' && (
            <div className={s.dianaChatArea}>
              {profile && (
                <div className={s.dianaProfileLine}>
                  <div className={s.dianaProfileDesc}>Call in progress — {profile.location}</div>
                </div>
              )}

              <div className={s.dianaChatSessionHeader}>
                <button
                  className={s.dianaEndBtn}
                  onClick={() => void endCall()}
                  disabled={sending || isSpeaking}
                  style={{ marginLeft: 'auto' }}
                >
                  End Call — get feedback
                </button>
              </div>

              {meetingBooked && (
                <div className={s.dianaMeetingBooked}>
                  Meeting Booked ✓
                </div>
              )}

              {effectiveVoiceMode && isSpeaking && (
                <div className={s.dianaOrbRow}>
                  <div className={`${s.orbWrap} ${s.isSpeaking}`} style={{ width: 40, height: 40 }}>
                    <div className={s.pulse} />
                    <div className={s.pulse} />
                    <div className={s.orb} />
                  </div>
                  <span className={s.dianaSpeakingLabel}>Prospect is speaking…</span>
                </div>
              )}

              {/* Call transcript — prospect left/grey, Archie right/orange (CHANGE 2) */}
              <div className={s.dianaChatMessages}>
                {messages.length === 0 && !sending && (
                  <p style={{ fontSize: 11.5, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                    The prospect has picked up — you open the call.
                  </p>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={msg.role === 'user' ? s.dianaMsgUser : s.dianaMsgDiana}>
                    <span className={s.dianaMsgLabel}>{msg.role === 'diana' ? 'PROSPECT' : 'ARCHIE'}</span>
                    <div className={msg.role === 'user' ? s.dianaMsgBubbleUser : s.dianaMsgBubbleDiana}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {sending && <p className={s.dianaSending}>Prospect is responding…</p>}
                <div ref={messagesEndRef} />
              </div>

              <div className={s.dianaInputRow}>
                <input
                  className={s.dianaInput}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
                  }}
                  placeholder={
                    isSpeaking
                      ? 'Prospect is speaking…'
                      : isListening
                        ? 'Listening…'
                        : 'Your response… (fallback if mic not working)'
                  }
                  disabled={inputBlocked}
                  autoFocus={voiceMode === 'text'}
                />

                {effectiveVoiceMode && !input.trim() && !inputBlocked ? (
                  <button
                    className={s.dianaMicBtn}
                    onClick={startMic}
                    disabled={isListening}
                    title="Start listening"
                  >
                    {isListening ? '…' : '🎙'}
                  </button>
                ) : (
                  <button
                    className={s.dianaSendBtn}
                    onClick={() => void sendMessage()}
                    disabled={inputBlocked || !input.trim()}
                  >Send</button>
                )}
              </div>

              {effectiveVoiceMode && listenStatus && (
                <p className={s.dianaVoiceStatus}>{listenStatus}</p>
              )}

              <div className={s.dianaSessionBtns}>
                <button className={s.dianaResetBtn} onClick={() => void resetSession()} disabled={sending}>
                  Reset
                </button>
              </div>
            </div>
          )}

          {/* ENDED — session review (CHANGE 6) */}
          {phase === 'ended' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {meetingBooked && (
                <div className={s.dianaMeetingBooked}>
                  Meeting Booked ✓
                </div>
              )}

              {messages.length > 0 && (
                <div className={`${s.dianaMessages} ${s.dianaMessagesEnded}`} style={{ maxHeight: 200 }}>
                  {messages.map((msg, i) => (
                    <div key={i} className={msg.role === 'user' ? s.dianaMsgUser : s.dianaMsgDiana}>
                      <span className={s.dianaMsgLabel}>{msg.role === 'diana' ? 'PROSPECT' : 'ARCHIE'}</span>
                      <div className={msg.role === 'user' ? s.dianaMsgBubbleUser : s.dianaMsgBubbleDiana}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {scoreNote && !score && (
                <div className={s.dianaChatFeedback}>
                  <span className={s.eyebrow} style={{ display: 'block', marginBottom: 10 }}>Session feedback</span>
                  <p className={s.dianaChatFeedbackText}>{scoreNote}</p>
                </div>
              )}

              {review && (
                <div className={s.dianaChatFeedback}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span className={s.eyebrow}>📊 Session Review</span>
                    {score && <span className={s.dianaScoreTotal}>{score.total} / {score.maxTotal}</span>}
                  </div>

                  {stageReached && (
                    <p className={s.dianaChatFeedbackText} style={{ marginBottom: 10 }}>
                      Stage reached: <strong>{stageReached}</strong>
                      {outcome === 'completed' ? ' — Meeting booked ✓' : ''}
                    </p>
                  )}

                  {review.whatWorked.length > 0 && (
                    <div className={s.dianaAngleSection} style={{ borderLeftColor: 'var(--online)' }}>
                      <div className={s.dianaBlockLabel}>✅ WHAT WORKED</div>
                      {review.whatWorked.map((w, i) => <p key={i} className={s.dianaChatFeedbackText}>• {w}</p>)}
                    </div>
                  )}

                  {review.whatToImprove.length > 0 && (
                    <div className={s.dianaAngleSection} style={{ borderLeftColor: 'var(--alert)', marginTop: 10 }}>
                      <div className={s.dianaBlockLabel}>❌ WHAT TO IMPROVE</div>
                      {review.whatToImprove.map((w, i) => <p key={i} className={s.dianaChatFeedbackText}>• {w}</p>)}
                    </div>
                  )}

                  <div className={s.dianaAngleSection} style={{ borderLeftColor: 'var(--accent)', marginTop: 10 }}>
                    <div className={s.dianaBlockLabel}>🎯 FOCUS NEXT SESSION</div>
                    <p className={s.dianaChatFeedbackText}>{review.focusNext}</p>
                  </div>

                  {score && (
                    <button
                      className={`${s.hBtn ?? ''} ${s.dianaResetBtn}`}
                      style={{ marginTop: 12 }}
                      onClick={() => setShowDetailedScore(v => !v)}
                    >
                      {showDetailedScore ? 'Hide' : 'Show'} detailed rubric score
                    </button>
                  )}

                  {score && showDetailedScore && (
                    <div style={{ marginTop: 12 }}>
                      <div className={s.dianaStageScoreList}>
                        {score.stages.map(st => (
                          <div key={st.stage} className={s.dianaStageScoreRow}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span className={s.dianaStageScoreLabel}>{st.label}</span>
                              <span className={s.dianaStageScorePoints}>{st.points} / {st.maxPoints}</span>
                            </div>
                            {st.notes && <p className={s.dianaStageScoreNotes}>{st.notes}</p>}
                          </div>
                        ))}
                      </div>

                      {score.deductions.length > 0 && (
                        <div className={s.dianaDeductionList}>
                          <span className={s.fpSectionLabel} style={{ display: 'block', marginBottom: 6 }}>Deductions</span>
                          {score.deductions.map(d => (
                            <div key={d.type} className={s.dianaDeductionRow}>
                              <span>{d.label}</span>
                              <span className={s.dianaDeductionPoints}>{d.points}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {score.knowledgeEvents.length > 0 && (
                        <div className={s.dianaKnowledgeList}>
                          <span className={s.fpSectionLabel} style={{ display: 'block', marginBottom: 6 }}>Knowledge accuracy</span>
                          {score.knowledgeEvents.map((k, i) => (
                            <div key={i} className={s.dianaKnowledgeRow}>
                              <span>{k.type === 'correct' ? 'Correct claim' : 'Wrong claim'} — {k.topic}</span>
                              <span
                                className={s.dianaKnowledgePoints}
                                style={{ color: k.points > 0 ? 'var(--online)' : 'var(--alert)' }}
                              >
                                {k.points > 0 ? `+${k.points}` : k.points}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {score.summary && (
                        <p className={s.dianaChatFeedbackText} style={{ marginTop: 12 }}>{score.summary}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button className={s.dianaNewSessionBtn} onClick={newSession}>Start another session</button>
            </div>
          )}
        </div>

        {/* ── Column 2: Performance Intelligence (40%) ─────────────────────── */}
        <div className={s.fpCol} style={{ flex: 4 }}>
          <div className={s.fpColHead}>
            <div className={s.fpColTitle}>Performance Intelligence</div>
            <div className={s.fpColSub}>Based on {totalSessions} session{totalSessions !== 1 ? 's' : ''}.</div>
          </div>

          {perfLoading && <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</p>}

          {/* CHANGE 7 — weak points, sessions this week, streak, last session */}
          {context && (
            <>
              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>WEAK POINTS</span>
                {context.weakPoints.length === 0 ? (
                  <p className={s.dianaWeakCardNote}>Not tracked yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                    {context.weakPoints.map((w, i) => (
                      <div key={i} style={{ fontSize: 12, color: TONE_COLORS[w.tone] }}>
                        {TONE_DOT[w.tone]} {w.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>SESSIONS THIS WEEK</span>
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  {context.sessionsThisWeek.map(d => (
                    <span key={d.day} style={{ fontSize: 11, color: 'var(--text-mid)' }}>
                      {d.day} {d.done ? '✅' : '□'}
                    </span>
                  ))}
                </div>
              </div>

              <div className={s.fpSection}>
                <span className={s.fpSectionLabel}>STREAK</span>
                <p className={s.dianaChatFeedbackText} style={{ marginTop: 4 }}>
                  {context.streak.current} day{context.streak.current !== 1 ? 's' : ''} practiced
                </p>
                <p className={s.dianaWeakCardNote}>Best: {context.streak.best} days</p>
              </div>

              {context.lastSession && (
                <div className={s.fpSection}>
                  <span className={s.fpSectionLabel}>LAST SESSION</span>
                  <p className={s.dianaChatFeedbackText} style={{ marginTop: 4 }}>
                    Stage reached: {context.lastSession.stageReached}
                  </p>
                  <p className={s.dianaWeakCardNote}>
                    {context.lastSession.role} — {context.lastSession.company}
                    {context.lastSession.timeInSwitzerland ? ` · ${context.lastSession.timeInSwitzerland}` : ''}
                  </p>
                </div>
              )}
            </>
          )}

          {weakestObjection && (
            <div className={s.dianaWeakCard}>
              <div className={s.fpSectionLabel} style={{ marginBottom: 6 }}>Needs most work</div>
              <div className={s.dianaWeakCardTitle}>{weakestObjection.label}</div>
              <div className={s.dianaWeakCardNote}>
                {weakestObjection.completedCount}/{weakestObjection.count} sessions completed
                ({weakestObjection.completionPct}% completion rate)
              </div>
            </div>
          )}

          {objStats.length > 0 && (
            <div className={s.fpSection}>
              <span className={s.fpSectionLabel}>Objection breakdown</span>
              <div className={s.dianaObjStatList}>
                {objStats.map(stat => (
                  <div key={stat.label} className={s.dianaObjStatRow}>
                    <span className={s.dianaObjStatName}>{stat.label}</span>
                    <div className={s.dianaObjStatBarWrap}>
                      <div className={s.dianaObjStatBarFill} style={{ width: `${stat.completionPct}%` }} />
                    </div>
                    <span className={s.dianaObjStatCount}>{stat.completedCount}/{stat.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {trendData.length > 1 && (
            <div className={s.fpSection}>
              <span className={s.fpSectionLabel}>Session activity</span>
              <div style={{ height: 80 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-dim)' }} tickLine={false} axisLine={false} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                      formatter={(v) => [Number(v), 'Sessions']}
                    />
                    <Line type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {sessions.length > 0 && (
            <div className={s.fpSection}>
              <span className={s.fpSectionLabel}>Session history</span>
              <div className={s.dianaSessHistoryList}>
                {sessions.slice(0, 10).map(sess => (
                  <div key={sess.id}>
                    <div
                      className={s.dianaSessHistRow}
                      onClick={() => setExpandedSessId(expandedSessId === sess.id ? null : sess.id)}
                    >
                      <span className={s.dianaSessDate}>{sess.date}</span>
                      <span className={s.dianaSessScenario}>
                        {sess.scenario}{sess.company ? ` — ${sess.company}` : ''}
                      </span>
                      {sess.score !== null && (
                        <span className={s.dianaSessScore}>{sess.score}/100</span>
                      )}
                      <span className={`${s.dianaSessStatusChip} ${sess.completed ? s.dianaSessStatusEnded : ''}`}>
                        {sess.completed ? 'done' : sess.status}
                      </span>
                    </div>
                    {expandedSessId === sess.id && (
                      <div style={{ padding: '6px 0 6px 64px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 6 }}>
                          {sess.difficulty}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!perfLoading && sessions.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              No sessions yet. Start a session to build your performance history.
            </p>
          )}
        </div>

      </div>
    </div>
  )
}

// Best-effort heuristic on the prospect's reply text — just drives the
// "Meeting Booked ✓" banner; the server independently tracks outcome for scoring.
const MEETING_BOOKED_PHRASES = [
  'works for me', 'wednesday works', 'friday works', 'that works',
  'sounds good', 'ok, book', 'okay, book', "yeah, let's do", "let's do that",
  "i'll do wednesday", "i'll do friday", 'put me down', "that's fine, book",
]

function detectMeetingBookedClient(text: string): boolean {
  const lower = text.toLowerCase()
  return MEETING_BOOKED_PHRASES.some(p => lower.includes(p))
}
