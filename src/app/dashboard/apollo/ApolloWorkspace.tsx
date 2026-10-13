'use client'

import { useState, useEffect, useCallback } from 'react'
import s from '../dashboard.module.css'
import a from './apollo.module.css'
import CallUploadFlow, { type SessionStage } from './CallUploadFlow'
import ChatInput from '@/components/ChatInput'

type Outcome = 'booked' | 'follow_up' | 'drop'

interface ApolloCallSummary {
  id: string
  call_date: string
  prospect_name: string | null
  created_at: number
  outcome: Outcome | null
  stageReached: string | null
  coachingInsight: string | null
  fillerWords: Record<string, number> | null
  winningPhrases: string[]
  savedPhraseIndices: number[]
  crmNotes: string | null
  confirmationEmail: string | null
  emailSent: boolean
  followUpNotes: string | null
  followUpDate: string | null
  dropReason: string | null
  dropped: boolean
  prospectQuality: string | null
  callSummary: string | null
  reminderSet: boolean
  reminderType: string | null
  reminderDate: string | null
  objectionsRaised: string[]
  toneNotes: string | null
  whatResonated: string | null
}

interface DebriefChatMessage { role: 'user' | 'assistant'; content: string }

const FILLER_LABELS: Record<string, string> = {
  you_know: '"you know"', sort_of: '"sort of"', basically: '"basically"',
  kind_of: '"kind of"', obviously: '"obviously"',
}
const STAGE_LABELS: Record<string, string> = {
  opener: 'Opener', fact_find: 'Fact find', enlarge: 'Enlarge', disturb: 'Disturb', close: 'Close', completed: 'Completed',
}

function relDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Debrief chat, scoped to one call — its own message history and input,
// independent of every other call's debrief and of the page-level "+ New
// call" input above. Loads/saves via /api/dashboard/apollo/chat?callId=...
function DebriefChat({ callId }: { callId: string }) {
  const [messages, setMessages] = useState<DebriefChatMessage[] | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/dashboard/apollo/chat?callId=${callId}`)
      .then(r => r.json() as Promise<{ messages?: DebriefChatMessage[] }>)
      .then(d => setMessages(d.messages ?? []))
      .catch(() => setMessages([]))
  }, [callId])

  useEffect(() => { load() }, [load])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    setMessages(prev => [...(prev ?? []), { role: 'user', content: text }])
    try {
      const res = await fetch('/api/dashboard/apollo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, message: text }),
      })
      const data = await res.json() as { reply?: string; error?: string }
      if (!res.ok || !data.reply) throw new Error(data.error ?? 'Debrief failed')
      setMessages(prev => [...(prev ?? []), { role: 'assistant', content: data.reply! }])
    } catch {
      setMessages(prev => (prev ?? []).slice(0, -1))
      setInput(text)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={a.card}>
      <div className={a.cardHeader}><span className={a.cardTitle}>💬 DEBRIEF</span></div>
      <div className={a.debriefMessages}>
        {messages === null ? (
          <p className={a.debriefEmpty}>Loading…</p>
        ) : messages.length === 0 ? (
          <p className={a.debriefEmpty}>Tell Apollo what you think went wrong, or ask what he spotted.</p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`${a.debriefMsg} ${m.role === 'user' ? a.debriefMsgUser : ''}`}>
              <div className={`${a.debriefBubble} ${m.role === 'user' ? a.debriefBubbleUser : a.debriefBubbleAssistant}`}>
                {m.content}
              </div>
            </div>
          ))
        )}
      </div>
      <ChatInput
        value={input}
        onChange={setInput}
        onSend={() => void send()}
        sending={sending}
        placeholder="What do you think went wrong?"
      />
    </div>
  )
}

export default function ApolloWorkspace() {
  const [calls, setCalls] = useState<ApolloCallSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Starts on 'upload', not 'idle' — the drop card must be there waiting the
  // moment the thread loads, not gated behind a click or typed command. This
  // also matters functionally: FileDropZone's window-level drag guard only
  // exists while it's mounted, so if the card isn't showing yet, a drag
  // anywhere on the page has no guard at all and the browser just navigates
  // away with the file instead of accepting it.
  const [sessionStage, setSessionStage] = useState<SessionStage>('upload')
  // Bumped on every "+ New call" click to force CallUploadFlow to remount
  // fresh — discarding any in-progress (unanalysed) transcript, same as the
  // old inline resetSession() did.
  const [uploadKey, setUploadKey] = useState(0)

  const [chatInput, setChatInput] = useState('')
  const [savingPhrase, setSavingPhrase] = useState<string | null>(null)
  const [actingOn, setActingOn] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    fetch('/api/dashboard/apollo')
      .then(r => r.ok ? r.json() as Promise<{ calls: ApolloCallSummary[] }> : Promise.reject(new Error(`${r.status}`)))
      .then(d => setCalls(d.calls))
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => { load() }, [load])

  function startNewCall() {
    setUploadKey(k => k + 1)
  }

  function handleChatSend() {
    const text = chatInput.trim()
    setChatInput('')
    if (/new call/i.test(text) || text === '') startNewCall()
  }

  async function savePhraseToMuse(callSummary: ApolloCallSummary, idx: number, phrase: string) {
    setSavingPhrase(`${callSummary.id}-${idx}`)
    try {
      await fetch('/api/dashboard/apollo/save-phrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: callSummary.id, phraseIndex: idx, phrase }),
      })
      load()
    } finally {
      setSavingPhrase(null)
    }
  }

  async function handleConfirmDrop(id: string) {
    setActingOn(id)
    try {
      await fetch('/api/dashboard/apollo/confirm-drop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: id }),
      })
      load()
    } finally { setActingOn(null) }
  }

  async function handleSetReminder(id: string, type: 'show_up' | 'follow_up', date: string | null) {
    setActingOn(id)
    try {
      await fetch('/api/dashboard/apollo/set-reminder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: id, type, date }),
      })
      load()
    } finally { setActingOn(null) }
  }

  async function handleMarkSent(id: string) {
    setActingOn(id)
    try {
      await fetch('/api/dashboard/apollo/mark-sent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: id }),
      })
      load()
    } finally { setActingOn(null) }
  }

  async function copyToClipboard(text: string) {
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
  }

  return (
    <div className={a.page}>
      <button
        className={a.newCallBtn}
        onClick={startNewCall}
        disabled={sessionStage === 'uploading' || sessionStage === 'transcribing' || sessionStage === 'analysing'}
      >+ New call</button>

      <div className={a.thread}>
        {error && <p className={a.errorText}>{error}</p>}

        {/* Upload card — always present; never gated behind a click or typed command */}
        <CallUploadFlow key={uploadKey} onComplete={load} onStageChange={setSessionStage} />

        {/* Completed calls — most recent first */}
        {calls === null ? (
          <p className={a.emptyThread}>Loading…</p>
        ) : (
          calls.map(call => (
            <div key={call.id} className={a.callGroup}>
              <div className={a.callGroupDivider}><span>{call.prospect_name ?? 'Unnamed prospect'} · {relDate(call.created_at)}</span></div>

              {/* Coaching card — always */}
              <div className={a.card}>
                <div className={a.cardHeader}><span className={a.cardTitle}>🎯 COACHING INSIGHT</span></div>
                <div className={a.cardBody}>
                  {call.coachingInsight}
                  <div className={a.coachingStage}>Stage reached: {call.stageReached ? STAGE_LABELS[call.stageReached] ?? call.stageReached : '—'}</div>
                  {call.fillerWords && Object.keys(call.fillerWords).length > 0 && (
                    <div className={a.fillerRow}>
                      {Object.entries(call.fillerWords).filter(([, n]) => n > 0).map(([key, n]) => (
                        <span key={key}>{FILLER_LABELS[key] ?? key} ×{n}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Winning phrases */}
              {call.winningPhrases.length > 0 && (
                <div className={a.card}>
                  <div className={a.cardHeader}><span className={a.cardTitle}>✨ PHRASES THAT LANDED</span></div>
                  {call.winningPhrases.map((phrase, idx) => {
                    const saved = call.savedPhraseIndices.includes(idx)
                    return (
                      <div key={idx} className={a.phraseRow}>
                        <span className={a.phraseText}>&quot;{phrase}&quot;</span>
                        {saved ? (
                          <span className={a.savedTag}>Saved to MUSE ✓</span>
                        ) : (
                          <button
                            style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-mid)', cursor: 'pointer' }}
                            onClick={() => void savePhraseToMuse(call, idx, phrase)}
                            disabled={savingPhrase === `${call.id}-${idx}`}
                          >
                            {savingPhrase === `${call.id}-${idx}` ? 'Saving…' : 'Save to MUSE'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Booked outcome */}
              {call.outcome === 'booked' && (
                <>
                  {call.crmNotes && (
                    <div className={a.card}>
                      <div className={a.cardHeader}><span className={a.cardTitle}>📋 CRM NOTES — {call.prospect_name ?? 'Unnamed'}</span></div>
                      <div className={a.cardBody}>{call.crmNotes}</div>
                      <div className={a.cardActions}>
                        <button className={a.outcomeBtn} onClick={() => void copyToClipboard(call.crmNotes!)}>📋 Copy to clipboard</button>
                      </div>
                    </div>
                  )}
                  {call.confirmationEmail && (
                    <div className={a.card}>
                      <div className={a.cardHeader}><span className={a.cardTitle}>✉️ CONFIRMATION EMAIL</span></div>
                      <div className={a.cardBody}>{call.confirmationEmail}</div>
                      <div className={a.cardActions}>
                        <button className={a.outcomeBtn} onClick={() => void copyToClipboard(call.confirmationEmail!)}>📋 Copy</button>
                        <button
                          className={`${a.outcomeBtn} ${call.emailSent ? a.outcomeBtnActive : ''}`}
                          onClick={() => void handleMarkSent(call.id)}
                          disabled={call.emailSent || actingOn === call.id}
                        >
                          {call.emailSent ? '✓ Sent' : 'Mark sent'}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className={a.card}>
                    <div className={a.cardHeader}><span className={a.cardTitle}>🔔 SHOW-UP CALL</span></div>
                    <div className={a.cardBody}>
                      Call {call.prospect_name ?? 'the prospect'} the day before their meeting to confirm they&apos;re coming.
                    </div>
                    <div className={a.cardActions}>
                      <button
                        className={`${a.outcomeBtn} ${call.reminderSet && call.reminderType === 'show_up' ? a.outcomeBtnActive : ''}`}
                        onClick={() => void handleSetReminder(call.id, 'show_up', null)}
                        disabled={(call.reminderSet && call.reminderType === 'show_up') || actingOn === call.id}
                      >
                        {call.reminderSet && call.reminderType === 'show_up' ? '✓ Reminder set' : 'Set reminder'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Not booked — analysis + debrief chat, scoped to this call */}
              {(call.outcome === 'follow_up' || call.outcome === 'drop') && (
                <div className={a.card}>
                  <div className={a.cardHeader}><span className={a.cardTitle}>🔍 CALL ANALYSIS</span></div>
                  <div className={a.cardBody}>
                    {call.objectionsRaised.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <strong>Objections raised:</strong>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                          {call.objectionsRaised.map((o, i) => <li key={i}>{o}</li>)}
                        </ul>
                      </div>
                    )}
                    {call.toneNotes && <div style={{ marginBottom: 8 }}><strong>Tone:</strong> {call.toneNotes}</div>}
                    {call.whatResonated && <div><strong>What resonated:</strong> {call.whatResonated}</div>}
                    {call.objectionsRaised.length === 0 && !call.toneNotes && !call.whatResonated && (
                      <span style={{ color: 'var(--text-dim)' }}>No detailed analysis available for this call.</span>
                    )}
                  </div>
                </div>
              )}
              {(call.outcome === 'follow_up' || call.outcome === 'drop') && <DebriefChat callId={call.id} />}

              {/* Follow-up outcome */}
              {call.outcome === 'follow_up' && (
                <div className={a.card}>
                  <div className={a.cardHeader}><span className={a.cardTitle}>🔄 FOLLOW UP</span></div>
                  <div className={a.cardBody}>
                    {call.followUpNotes}
                    <div className={a.coachingStage}>Call back: {call.followUpDate ?? 'no timeframe given'}</div>
                  </div>
                  <div className={a.cardActions}>
                    <button
                      className={`${a.outcomeBtn} ${call.reminderSet && call.reminderType === 'follow_up' ? a.outcomeBtnActive : ''}`}
                      onClick={() => void handleSetReminder(call.id, 'follow_up', call.followUpDate)}
                      disabled={(call.reminderSet && call.reminderType === 'follow_up') || actingOn === call.id}
                    >
                      {call.reminderSet && call.reminderType === 'follow_up' ? '✓ Reminder set' : 'Set reminder'}
                    </button>
                  </div>
                </div>
              )}

              {/* Drop outcome */}
              {call.outcome === 'drop' && (
                <div className={a.card}>
                  <div className={a.cardHeader}><span className={a.cardTitle}>🗑 DROP FROM CRM</span></div>
                  <div className={a.cardBody}>
                    {call.dropReason}
                    <div className={a.coachingStage}>This frees up one of your 750 CRM spots.</div>
                  </div>
                  <div className={a.cardActions}>
                    {call.dropped ? (
                      <span className={a.savedTag}>Dropped ✓</span>
                    ) : (
                      <>
                        <button className={a.analyseBtn} onClick={() => void handleConfirmDrop(call.id)} disabled={actingOn === call.id}>Confirm drop</button>
                        <button className={a.outcomeBtn} disabled>Keep anyway</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className={s.irisChatInputRow}>
        <input
          className={s.irisChatTextarea}
          style={{ resize: 'none' }}
          placeholder='Type "new call" or click + New call above…'
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleChatSend() }}
        />
        <button className={s.irisChatSendBtn} onClick={handleChatSend}>Send</button>
      </div>
    </div>
  )
}
