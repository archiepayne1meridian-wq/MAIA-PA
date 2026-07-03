'use client'

import { useEffect, useRef, useState } from 'react'
import s from '../dashboard.module.css'

type Difficulty = 'warm' | 'neutral' | 'tough'
type Phase = 'idle' | 'active' | 'ended'

interface DianaObjection {
  id: string
  label: string
  intent: string
  approach: string
  pivot: string
  principles: string
}

interface Message {
  role: 'user' | 'diana'
  text: string
}

export default function DianaWorkspace() {
  const [objections, setObjections] = useState<DianaObjection[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [messages, setMessages] = useState<Message[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty>('neutral')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load objections + check for an active web session on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/diana/objections').then(r => r.json() as Promise<{ objections: DianaObjection[] }>),
      fetch('/api/dashboard/diana/session').then(r => r.json() as Promise<{ session: { id: string; transcript: Message[]; difficulty: string } | null }>),
    ])
      .then(([objData, sessData]) => {
        setObjections(objData.objections ?? [])
        if (sessData.session) {
          // Restore active session that was already in progress
          setPhase('active')
          setMessages(sessData.session.transcript ?? [])
          setDifficulty((sessData.session.difficulty as Difficulty) || 'neutral')
        }
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function startSession() {
    setError(null)
    const res = await fetch('/api/dashboard/diana/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty }),
    })
    const data = await res.json() as { session?: { transcript: Message[] } }
    if (data.session) {
      setMessages(data.session.transcript ?? [])
      setFeedback(null)
      setPhase('active')
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
        body: JSON.stringify({ text }),
      })
      const data = await res.json() as { reply?: string; error?: string }
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'diana', text: data.reply! }])
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
      const data = await res.json() as { feedback?: string; error?: string }
      if (data.feedback) {
        setFeedback(data.feedback)
        setPhase('ended')
      } else if (data.error) {
        setError(data.error)
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
    setFeedback(null)
    setError(null)
  }

  function newSession() {
    setPhase('idle')
    setMessages([])
    setFeedback(null)
    setError(null)
  }

  if (loading) {
    return (
      <div className={s.interactiveSlot}>
        <span className={s.eyebrow}>Diana workspace</span>
        <p className={s.interactiveSlotText}>Loading…</p>
      </div>
    )
  }

  return (
    <div className={s.dianaWs}>

      {/* ── Objection library ─────────────────────────────────────────────── */}
      <div className={s.dianaWsSection}>
        <div className={s.dianaWsSectionHead}>
          <span className={s.eyebrow}>Objection library</span>
        </div>
        {objections.length === 0 ? (
          <p className={s.interactiveSlotText}>No objections found in context/diana.md.</p>
        ) : (
          <div className={s.dianaObjGrid}>
            {objections.map(obj => (
              <div key={obj.id} className={s.dianaObjItem}>
                <button
                  className={`${s.dianaObjToggle} ${expandedId === obj.id ? s.dianaObjToggleOpen : ''}`}
                  onClick={() => setExpandedId(expandedId === obj.id ? null : obj.id)}
                >
                  <span className={s.dianaObjLabel}>{obj.label}</span>
                  <span className={s.dianaObjChevron}>{expandedId === obj.id ? '▲' : '▼'}</span>
                </button>
                {expandedId === obj.id && (
                  <div className={s.dianaObjBody}>
                    <div className={s.dianaObjField}>
                      <span className={s.eyebrow}>What they mean</span>
                      <p className={s.dianaObjFieldText}>{obj.intent}</p>
                    </div>
                    <div className={s.dianaObjField}>
                      <span className={s.eyebrow}>Try</span>
                      <p className={s.dianaObjTry}>&ldquo;{obj.approach}&rdquo;</p>
                    </div>
                    <div className={s.dianaObjField}>
                      <span className={s.eyebrow}>Pivot</span>
                      <p className={s.dianaObjFieldText}>{obj.pivot}</p>
                    </div>
                    <div className={s.dianaObjField}>
                      <span className={s.eyebrow}>Why it works</span>
                      <p className={s.dianaObjFieldText}>{obj.principles}</p>
                    </div>
                    <p className={s.dianaObjDisclaimer}>
                      Scripts are practice scaffolding — firm-approved material governs real calls.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Live roleplay ─────────────────────────────────────────────────── */}
      <div className={s.dianaWsSection}>
        <div className={s.dianaWsSectionHead}>
          <span className={s.eyebrow}>Live roleplay</span>
        </div>

        {error && (
          <p className={s.dianaErrorMsg}>{error}</p>
        )}

        {/* IDLE — start controls */}
        {phase === 'idle' && (
          <div className={s.dianaRpControls}>
            <span className={s.dianaDiffLabel}>Difficulty</span>
            <div className={s.dianaDiffBtns}>
              {(['warm', 'neutral', 'tough'] as Difficulty[]).map(d => (
                <button
                  key={d}
                  className={`${s.dianaDiffBtn} ${difficulty === d ? s.dianaDiffBtnActive : ''}`}
                  onClick={() => setDifficulty(d)}
                >
                  {d}
                </button>
              ))}
            </div>
            <button className={s.dianaStartBtn} onClick={() => void startSession()}>
              Start roleplay
            </button>
          </div>
        )}

        {/* ACTIVE — chat surface */}
        {phase === 'active' && (
          <>
            <div className={s.dianaMessages}>
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
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void sendMessage()
                  }
                }}
                placeholder="Your response…"
                disabled={sending}
                autoFocus
              />
              <button
                className={s.dianaSendBtn}
                onClick={() => void sendMessage()}
                disabled={sending || !input.trim()}
              >
                Send
              </button>
            </div>
            <div className={s.dianaSessionBtns}>
              <button className={s.dianaExitBtn} onClick={() => void exitSession()} disabled={sending}>
                Exit — get feedback
              </button>
              <button className={s.dianaResetBtn} onClick={() => void resetSession()} disabled={sending}>
                Reset
              </button>
            </div>
          </>
        )}

        {/* ENDED — show messages + feedback */}
        {phase === 'ended' && (
          <>
            {messages.length > 0 && (
              <div className={`${s.dianaMessages} ${s.dianaMessagesEnded}`}>
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
            {feedback && (
              <div className={s.dianaFeedbackBlock}>
                <span className={s.eyebrow} style={{ marginBottom: 10, display: 'block' }}>
                  Session feedback
                </span>
                <p className={s.dianaFeedbackText}>{feedback}</p>
              </div>
            )}
            <div className={s.dianaSessionBtns}>
              <button className={s.dianaNewSessionBtn} onClick={newSession}>
                New session
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
