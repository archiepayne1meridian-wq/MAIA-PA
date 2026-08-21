'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import s from '../dashboard.module.css'

type Difficulty = 'warm' | 'neutral' | 'tough'
type Phase = 'idle' | 'active' | 'ended'
type VoiceInputMode = 'text' | 'voice'
type SpeakState = 'idle' | 'speaking' | 'listening'
type CallStage = 'introduction' | 'factFind' | 'enlarge' | 'disturb' | 'close' | 'softLanding'

interface Message {
  role: 'user' | 'diana'
  text: string
}

interface ProfileInfo {
  key: string
  name: string
  company: string
  location: string
  background: string  // work history only — no assets, no target product
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

const STAGE_ORDER: { key: CallStage; label: string }[] = [
  { key: 'introduction', label: 'Introduction' },
  { key: 'factFind', label: 'Fact Find' },
  { key: 'enlarge', label: 'Enlarge' },
  { key: 'disturb', label: 'Disturb' },
  { key: 'close', label: 'Close' },
  { key: 'softLanding', label: 'Soft Landing' },
]

// Simple, deterministic heuristic — keyword + turn-count based. Not a Claude
// call: this just drives a lightweight progress indicator, updated locally
// after every turn as `messages` changes. Checked most-advanced-stage-first so
// a later signal always wins once the call has moved on.
function inferCallStage(messages: Message[]): CallStage {
  const adviserTurns = messages.filter(m => m.role === 'user').length
  if (adviserTurns === 0) return 'introduction'

  const allText = messages.map(m => m.text.toLowerCase()).join(' \n ')

  if (/\b(before we wrap up|finalise a few details|precise information|as valuable as possible)\b/.test(allText)) {
    return 'softLanding'
  }
  if (/\b(stephen smith|senior consultant|this week or next week|wednesday or friday|when works best|looking at his calendar|beginning or end of|morning or afternoon)\b/.test(allText)) {
    return 'close'
  }
  if (/\b(is it safe to say|two most important things|hard to maintain|maintain your current lifestyle|underperforming)\b/.test(allText)) {
    return 'disturb'
  }
  if (/\b(last time your (pension )?provider|risk level|tax implications|scale of 1|1-10|1 to 10|kept you with|manage.{0,10}yourself|platform or structure|regular savings account|interest rate|inflation rate)\b/.test(allText)) {
    return 'enlarge'
  }
  if (adviserTurns <= 1) return 'introduction'
  return 'factFind'
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
  difficulty: string
  status: string
  date: string
  completed: boolean
}

const DIFF_COLORS: Record<Difficulty, string> = {
  warm: 'var(--online)',
  neutral: 'var(--accent)',
  tough: 'var(--alert)',
}

// Best-effort heuristic on DIANA's (the prospect's) own reply — just drives the
// "Meeting Booked ✓" banner, nothing auto-ends the call on a match any more (the
// call continues into Soft Landing after a yes; Archie ends it manually).
const MEETING_BOOKED_PHRASES = [
  'works for me', 'wednesday works', 'friday works', 'that works',
  'sounds good', 'ok, book', 'okay, book', 'yeah, let\'s do', 'let\'s do that',
  'i\'ll do wednesday', 'i\'ll do friday', 'put me down', 'that\'s fine, book',
]

function detectMeetingBooked(text: string): boolean {
  const lower = text.toLowerCase()
  return MEETING_BOOKED_PHRASES.some(p => lower.includes(p))
}

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

export default function DianaWorkspace() {
  // ── Live session state ────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle')
  const [messages, setMessages] = useState<Message[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty>('neutral')
  const [currentScenario, setCurrentScenario] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileInfo | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [score, setScore] = useState<CallScore | null>(null)
  const [scoreNote, setScoreNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Performance column state ──────────────────────────────────────────────
  const [objStats, setObjStats] = useState<ObjStat[]>([])
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [expandedSessId, setExpandedSessId] = useState<string | null>(null)
  const [perfLoading, setPerfLoading] = useState(true)

  // ── Voice state ───────────────────────────────────────────────────────────
  const [voiceMode, setVoiceMode] = useState<VoiceInputMode>('text')
  const [speakState, setSpeakState] = useState<SpeakState>('idle')
  const [listenStatus, setListenStatus] = useState<string | null>(null) // 'Listening…' | 'DIANA is speaking…' | null
  const [voiceUnavailable, setVoiceUnavailable] = useState(false)
  const [meetingBooked, setMeetingBooked] = useState(false)
  const audioQueueRef = useRef<AudioQueue | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialise audio queue once
  useEffect(() => {
    audioQueueRef.current = new AudioQueue(setSpeakState)
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/diana/session').then(r => r.json() as Promise<{ session: { id: string; transcript: Message[]; difficulty: string; scenario?: string; profile?: ProfileInfo | null } | null }>),
      fetch('/api/dashboard/diana/performance').then(r => r.json() as Promise<{ objectionStats: ObjStat[]; sessions: SessionRecord[] }>),
    ])
      .then(([sessData, perfData]) => {
        if (sessData.session) {
          setPhase('active')
          setMessages(sessData.session.transcript ?? [])
          setDifficulty((sessData.session.difficulty as Difficulty) || 'neutral')
          setCurrentScenario(sessData.session.scenario ?? null)
          setProfile(sessData.session.profile ?? null)
        }
        setObjStats(perfData.objectionStats ?? [])
        setSessions(perfData.sessions ?? [])
      })
      .catch(e => setError(String(e)))
      .finally(() => { setLoading(false); setPerfLoading(false) })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  // ── TTS: speak a text string, then optionally start mic ──────────────────
  const speakText = useCallback((text: string, afterDone?: () => void) => {
    if (voiceMode !== 'voice') return
    setListenStatus('DIANA is speaking…')
    fetch('/api/dashboard/diana/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then(res => {
        if (!res.ok) throw new Error('TTS unavailable')
        return res.arrayBuffer()
      })
      .then(buf => {
        audioQueueRef.current?.enqueue(buf, () => {
          setListenStatus(null)
          afterDone?.()
        })
      })
      .catch(err => {
        console.error('[diana] TTS error', err)
        setListenStatus(null)
        afterDone?.()
      })
  }, [voiceMode])

  // ── Start mic via Web Speech API ─────────────────────────────────────────
  const startMic = useCallback(() => {
    // Web Speech API is not in standard TS lib — use window cast
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
      setInput(transcript)
      setListenStatus(null)
      setSpeakState('idle')
    }
    recognition.onerror = () => {
      setListenStatus(null)
      setSpeakState('idle')
    }
    recognition.onend = () => {
      setListenStatus(null)
      if (speakState === 'listening') setSpeakState('idle')
    }
    recognition.start()
  }, [speakState])

  async function startSession() {
    setError(null)
    setMeetingBooked(false)
    const res = await fetch('/api/dashboard/diana/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty, mode: voiceMode }),
    })
    const data = await res.json() as { session?: { transcript: Message[]; scenario?: string; profile?: ProfileInfo | null } }
    if (data.session) {
      // DIANA never speaks first — transcript starts empty. Archie opens the call.
      setMessages(data.session.transcript ?? [])
      setCurrentScenario(data.session.scenario ?? null)
      setProfile(data.session.profile ?? null)
      setScore(null)
      setScoreNote(null)
      setPhase('active')

      // In voice mode there's nothing for DIANA to say yet — go straight to
      // listening so Archie can open the call by speaking.
      if (voiceMode === 'voice') startMic()
    }
  }

  async function sendMessage() {
    if (!input.trim() || sending) return
    const text = input.trim()
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
      const data = await res.json() as { reply?: string; error?: string }
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'diana', text: data.reply! }])
        // Just a milestone banner now — the call continues into Soft Landing
        // after a yes, Archie ends it manually with "End Call — get feedback".
        if (detectMeetingBooked(data.reply)) setMeetingBooked(true)

        if (voiceMode === 'voice') {
          speakText(data.reply, startMic)
        }
      } else if (data.error) {
        setError(data.error)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSending(false)
    }
  }

  async function exitSession() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/diana/exit', { method: 'POST' })
      const data = await res.json() as { score?: CallScore | null; note?: string; error?: string }
      if (data.error) {
        setError(data.error)
      } else {
        setScore(data.score ?? null)
        setScoreNote(data.note ?? null)
        setPhase('ended')
        void fetch('/api/dashboard/diana/performance')
          .then(r => r.json() as Promise<{ objectionStats: ObjStat[]; sessions: SessionRecord[] }>)
          .then(d => { setObjStats(d.objectionStats ?? []); setSessions(d.sessions ?? []) })
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSending(false)
    }
  }

  async function resetSession() {
    await fetch('/api/dashboard/diana/session', { method: 'DELETE' })
    setPhase('idle')
    setMessages([])
    setScore(null)
    setScoreNote(null)
    setCurrentScenario(null)
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
    setScoreNote(null)
    setCurrentScenario(null)
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
        <span className={s.fpPageSubtitle}>Objection Roleplay Coach</span>
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

            {/* Voice toggle — only shown when session is active */}
            {phase === 'active' && !voiceUnavailable && (
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
                  <span className={s.dianaVoiceHint}>Voice mode uses ElevenLabs + your microphone</span>
                )}
              </div>
            )}
            {/* Voice toggle on idle screen too */}
            {phase === 'idle' && !voiceUnavailable && (
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
                  <span className={s.dianaVoiceHint}>Voice mode uses ElevenLabs + your microphone</span>
                )}
              </div>
            )}
          </div>

          {voiceUnavailable && (
            <p style={{ fontSize: 11, color: 'var(--alert)', marginBottom: 8 }}>
              Voice input unavailable in this browser — use text mode.
            </p>
          )}

          {error && <p style={{ fontSize: 12, color: 'var(--alert)', marginBottom: 8 }}>{error}</p>}

          {/* IDLE — start controls */}
          {phase === 'idle' && (
            <div className={s.dianaStartBlock}>
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
              <button className={s.dianaStartFullBtn} onClick={() => void startSession()}>
                Start Session
              </button>
              <p className={s.dianaAutonomousNote}>
                You'll be matched with one of four random prospects — pick up the phone and open the call.
              </p>
            </div>
          )}

          {/* ACTIVE — chat surface */}
          {phase === 'active' && (
            <div className={s.dianaChatArea}>
              {profile && (
                <div className={s.dianaProfileLine}>
                  <div>
                    <span className={s.dianaProfileName}>Prospect: {profile.name}</span>
                    <span className={s.dianaProfileDesc}> — {profile.company}, {profile.location}</span>
                  </div>
                  <div className={s.dianaProfileDesc}>Background: {profile.background}</div>
                </div>
              )}

              <div className={s.dianaStageBar}>
                {STAGE_ORDER.map((st, i) => {
                  const current = inferCallStage(messages)
                  const currentIdx = STAGE_ORDER.findIndex(s2 => s2.key === current)
                  const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'upcoming'
                  return (
                    <span key={st.key} className={`${s.dianaStageStep} ${s[`dianaStage_${state}`]}`}>
                      {st.label}
                      {i < STAGE_ORDER.length - 1 && <span className={s.dianaStageArrow}>→</span>}
                    </span>
                  )
                })}
              </div>

              <div className={s.dianaChatSessionHeader}>
                {currentScenario && (
                  <span className={s.dianaScenarioBadge}>{currentScenario}</span>
                )}
                <button
                  className={s.dianaEndBtn}
                  onClick={() => void exitSession()}
                  disabled={sending || isSpeaking}
                  style={{ marginLeft: currentScenario ? 'auto' : undefined }}
                >
                  End Call — get feedback
                </button>
              </div>

              {/* Meeting booked banner */}
              {meetingBooked && (
                <div className={s.dianaMeetingBooked}>
                  Meeting Booked ✓
                </div>
              )}

              {/* Voice speaking indicator */}
              {effectiveVoiceMode && isSpeaking && (
                <div className={s.dianaOrbRow}>
                  <div className={`${s.orbWrap} ${s.isSpeaking}`} style={{ width: 40, height: 40 }}>
                    <div className={s.pulse} />
                    <div className={s.pulse} />
                    <div className={s.orb} />
                  </div>
                  <span className={s.dianaSpeakingLabel}>DIANA is speaking…</span>
                </div>
              )}

              <div className={s.dianaChatMessages}>
                {messages.length === 0 && !sending && (
                  <p style={{ fontSize: 11.5, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                    The prospect has picked up — you open the call.
                  </p>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={msg.role === 'user' ? s.dianaMsgUser : s.dianaMsgDiana}>
                    <span className={s.dianaMsgLabel}>{msg.role === 'diana' ? 'PROSPECT' : 'YOU'}</span>
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
                      ? 'DIANA is speaking…'
                      : isListening
                        ? 'Listening…'
                        : 'Your response…'
                  }
                  disabled={inputBlocked}
                  autoFocus={voiceMode === 'text'}
                />

                {/* In voice mode: mic button replaces Send when idle, Send when transcript ready */}
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

              {/* Voice status label */}
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

          {/* ENDED — feedback */}
          {phase === 'ended' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {meetingBooked && (
                <div className={s.dianaMeetingBooked}>
                  Meeting Booked ✓
                </div>
              )}

              {messages.length > 0 && (
                <div className={`${s.dianaMessages} ${s.dianaMessagesEnded}`} style={{ maxHeight: 240 }}>
                  {messages.map((msg, i) => (
                    <div key={i} className={msg.role === 'user' ? s.dianaMsgUser : s.dianaMsgDiana}>
                      <span className={s.dianaMsgLabel}>{msg.role === 'diana' ? 'PROSPECT' : 'YOU'}</span>
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

              {score && (
                <div className={s.dianaChatFeedback}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span className={s.eyebrow}>Call scorecard</span>
                    <span className={s.dianaScoreTotal}>{score.total} / {score.maxTotal}</span>
                  </div>

                  {profile && (
                    <div style={{ marginBottom: 12 }}>
                      <p className={s.dianaChatFeedbackText}>
                        Prospect: {profile.name} — {profile.company}, {profile.location}
                      </p>
                      <p className={s.dianaChatFeedbackText}>Background: {profile.background}</p>
                    </div>
                  )}

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

              <button className={s.dianaNewSessionBtn} onClick={newSession}>New session</button>
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

          {/* Weakest objection alert */}
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

          {/* Per-objection scorecard */}
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

          {/* Session trend chart */}
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

          {/* Session history */}
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
                      <span className={s.dianaSessScenario}>{sess.scenario}</span>
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
