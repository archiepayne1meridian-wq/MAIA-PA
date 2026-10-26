'use client'

// CALLS — full-height shell (same pattern as MEETINGS): fixed header, calls
// stack like a chat conversation in the scrollable middle (oldest at top,
// newest at the bottom), and a pinned footer with the global chat bar +
// upload dropzone. No per-call debrief box any more — the chat bar IS the
// debrief, wired to ALL call history, not just one call.

import { useState, useEffect, useCallback, useRef } from 'react'
import a from './apollo.module.css'
import CallUploadFlow from './CallUploadFlow'
import ChatInput from '@/components/ChatInput'

type Outcome = 'booked' | 'follow_up' | 'drop'

interface ProspectMatchCandidate { id: string; name: string; company: string | null }

interface ApolloCallSummary {
  id: string
  call_date: string
  prospect_name: string | null
  companyName: string | null
  meetingDate: string | null
  created_at: number
  outcome: Outcome | null
  transcript: string | null
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
  linkedProspectId: string | null
  prospectMatches: ProspectMatchCandidate[]
}

interface GlobalChatMessage { role: 'user' | 'assistant'; content: string }

const FILLER_LABELS: Record<string, string> = {
  you_know: '"you know"', sort_of: '"sort of"', basically: '"basically"',
  kind_of: '"kind of"', obviously: '"obviously"',
}
const STAGE_LABELS: Record<string, string> = {
  opener: 'Opener', fact_find: 'Fact find', enlarge: 'Enlarge', disturb: 'Disturb', close: 'Close', completed: 'Completed',
}
const OUTCOME_LABELS: Record<Outcome, { emoji: string; label: string }> = {
  booked: { emoji: '📅', label: 'Booked' },
  follow_up: { emoji: '🔄', label: 'Follow up' },
  drop: { emoji: '🗑', label: 'Drop' },
}

function relDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ── Transcript turn parsing (speaker-labelled lines, old and new formats) ──

type Speaker = 'Archie' | 'Prospect'
interface Turn { id: string; speaker: Speaker; time: string | null; text: string }

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

// ── Global chat bar — pinned, wired to ALL call history ──────────────────

function GlobalChat() {
  const [messages, setMessages] = useState<GlobalChatMessage[] | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const threadRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/apollo/global-chat')
      .then(r => r.json() as Promise<{ messages?: GlobalChatMessage[] }>)
      .then(d => setMessages(d.messages ?? []))
      .catch(() => setMessages([]))
  }, [])

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }) }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    setMessages(prev => [...(prev ?? []), { role: 'user', content: text }])
    try {
      const res = await fetch('/api/dashboard/apollo/global-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }),
      })
      const data = await res.json() as { reply?: string; error?: string }
      if (!res.ok || !data.reply) throw new Error(data.error ?? 'Chat failed')
      setMessages(prev => [...(prev ?? []), { role: 'assistant', content: data.reply! }])
    } catch (err) {
      setMessages(prev => [...(prev ?? []), { role: 'assistant', content: err instanceof Error ? err.message : 'That failed — try again.' }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={a.globalChatWrap}>
      {messages && messages.length > 0 && (
        <div className={a.globalChatThread} ref={threadRef}>
          {messages.map((m, i) => (
            <div key={i} className={`${a.debriefMsg} ${m.role === 'user' ? a.debriefMsgUser : ''}`}>
              <div className={`${a.debriefBubble} ${m.role === 'user' ? a.debriefBubbleUser : a.debriefBubbleAssistant}`}>{m.content}</div>
            </div>
          ))}
        </div>
      )}
      <ChatInput
        value={input}
        onChange={setInput}
        onSend={() => void send()}
        sending={sending}
        placeholder='Ask about any call — "what works as an objection handle?", "summarise my last 5 calls"…'
      />
    </div>
  )
}

// ── One call's transcript, collapsible + editable after the fact ────────

function TranscriptBlock({ call, onSave }: { call: ApolloCallSummary; onSave: (transcript: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const idCounter = useRef(0)
  const makeId = useCallback(() => `turn-${idCounter.current++}`, [])

  function startEditing() {
    setTurns(parseTranscriptToTurns(call.transcript ?? '', makeId))
    setEditing(true)
    setExpanded(true)
  }

  function toggleTurnSpeaker(turnId: string) {
    setTurns(prev => prev.map(t => (t.id === turnId ? { ...t, speaker: t.speaker === 'Archie' ? 'Prospect' : 'Archie' } : t)))
  }
  function commitTurnText(turnId: string, text: string) {
    setTurns(prev => prev.map(t => (t.id === turnId ? { ...t, text } : t)))
  }

  function save() {
    onSave(serialiseTurns(turns))
    setEditing(false)
  }

  if (!call.transcript) return null
  const displayTurns = editing ? turns : parseTranscriptToTurns(call.transcript, makeId)

  return (
    <div className={a.card}>
      <div className={a.cardHeader} onClick={() => !editing && setExpanded(e => !e)} style={{ cursor: editing ? 'default' : 'pointer' }}>
        <span className={a.cardTitle}>📝 TRANSCRIPT</span>
        <span className={a.transcriptToggle}>{expanded ? '▲ collapse' : '▼ expand'}</span>
      </div>
      {expanded && (
        <>
          <div className={a.turns}>
            {displayTurns.map(turn => (
              <div key={turn.id} className={a.turn}>
                <span
                  className={`${a.turnSpeaker} ${turn.speaker === 'Archie' ? a.turnSpeakerArchie : a.turnSpeakerProspect}`}
                  onClick={() => editing && toggleTurnSpeaker(turn.id)}
                  title={editing ? 'Click to swap speaker' : undefined}
                  style={{ cursor: editing ? 'pointer' : 'default' }}
                >
                  {turn.speaker}
                </span>
                <div
                  className={a.turnText}
                  contentEditable={editing}
                  suppressContentEditableWarning
                  onBlur={e => editing && commitTurnText(turn.id, e.currentTarget.innerText)}
                >
                  {turn.text}
                </div>
              </div>
            ))}
          </div>
          <div className={a.cardActions}>
            {editing ? (
              <>
                <p className={a.transcriptHint}>Click a speaker label to swap · click a line to edit text</p>
                <button className={a.outcomeBtn} onClick={save}>✓ Save &amp; re-analyse</button>
                <button className={a.outcomeBtn} onClick={() => setEditing(false)}>Cancel</button>
              </>
            ) : (
              <button className={a.outcomeBtn} onClick={startEditing}>✏ Fix speakers / text</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function ApolloWorkspace() {
  const [calls, setCalls] = useState<ApolloCallSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingPhrase, setSavingPhrase] = useState<string | null>(null)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [reanalysing, setReanalysing] = useState<string | null>(null)
  const stackRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(() => {
    setError(null)
    fetch('/api/dashboard/apollo')
      .then(r => r.ok ? r.json() as Promise<{ calls: ApolloCallSummary[] }> : Promise.reject(new Error(`${r.status}`)))
      .then(d => setCalls(d.calls))
      .catch((e: Error) => {
        console.error('[apollo] load failed:', e)
        setError(e.message)
        setCalls(prev => prev ?? [])
      })
  }, [])

  useEffect(() => { load() }, [load])

  // New call appears at the bottom — follow it there, same as a chat thread.
  useEffect(() => { stackRef.current?.scrollTo({ top: stackRef.current.scrollHeight }) }, [calls])

  async function savePhraseToMuse(call: ApolloCallSummary, idx: number, phrase: string) {
    setSavingPhrase(`${call.id}-${idx}`)
    try {
      await fetch('/api/dashboard/apollo/save-phrase', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: call.id, phraseIndex: idx, phrase }),
      })
      load()
    } finally {
      setSavingPhrase(null)
    }
  }

  async function handleConfirmDrop(id: string) {
    setActingOn(id)
    try {
      await fetch('/api/dashboard/apollo/confirm-drop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: id }) })
      load()
    } finally { setActingOn(null) }
  }

  async function handleSetReminder(id: string) {
    setActingOn(id)
    try {
      await fetch('/api/dashboard/apollo/set-reminder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: id }) })
      load()
    } finally { setActingOn(null) }
  }

  async function handleMarkSent(id: string) {
    setActingOn(id)
    try {
      await fetch('/api/dashboard/apollo/mark-sent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: id }) })
      load()
    } finally { setActingOn(null) }
  }

  async function handleLinkProspect(callId: string, prospectId: string) {
    setActingOn(callId)
    try {
      await fetch('/api/dashboard/apollo/link-prospect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId, prospectId }) })
      load()
    } finally { setActingOn(null) }
  }

  async function handleSaveTranscript(callId: string, transcript: string) {
    setReanalysing(callId)
    try {
      const res = await fetch('/api/dashboard/apollo/analyse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId, transcript }),
      })
      if (!res.ok) throw new Error('Re-analysis failed')
      load()
    } catch (err) {
      console.error('[apollo] re-analyse failed:', err)
      setError('Re-analysis failed — try again')
    } finally {
      setReanalysing(null)
    }
  }

  async function copyToClipboard(text: string) {
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
  }

  // Oldest at top, newest at the bottom — like a chat thread.
  const orderedCalls = calls ? [...calls].reverse() : null

  return (
    <div className={a.shell}>
      <div className={a.header}><span className={a.headerTitle}>📞 CALLS</span></div>

      <div className={a.scrollMiddle} ref={stackRef}>
        {error && <p className={a.errorText}>{error}</p>}
        {orderedCalls === null ? (
          <p className={a.emptyThread}>Loading…</p>
        ) : orderedCalls.length === 0 ? (
          <p className={a.emptyThread}>Drop a recording below to get started.</p>
        ) : (
          orderedCalls.map(call => {
            const outcomeInfo = call.outcome ? OUTCOME_LABELS[call.outcome] : null
            return (
              <div key={call.id} className={a.callGroup}>
                <div className={a.callGroupDivider}>
                  <span>
                    {call.prospect_name ?? 'Unnamed prospect'} · {relDate(call.created_at)}
                    {outcomeInfo && <> · {outcomeInfo.emoji} {outcomeInfo.label}</>}
                  </span>
                </div>

                <TranscriptBlock call={call} onSave={t => void handleSaveTranscript(call.id, t)} />
                {reanalysing === call.id && <p className={a.transcriptHint}>Re-analysing…</p>}

                {call.outcome === 'booked' && call.crmNotes && (
                  <div className={a.card}>
                    <div className={a.cardHeader}><span className={a.cardTitle}>📋 CRM NOTES — {call.prospect_name ?? 'Unnamed'}</span></div>
                    <div className={a.cardBody}>{call.crmNotes}</div>
                    <div className={a.cardActions}>
                      <button className={a.outcomeBtn} onClick={() => void copyToClipboard(call.crmNotes!)}>📋 Copy to clipboard</button>
                    </div>
                  </div>
                )}

                {call.outcome === 'booked' && call.confirmationEmail && (
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

                {/* Call Insights — coaching, filler words, winning phrases, and
                    (not-booked calls) objections/tone/what-resonated, all
                    under one heading. Same content/behaviour as before. */}
                <div className={a.card}>
                  <div className={a.cardHeader}><span className={a.cardTitle}>🎯 CALL INSIGHTS</span></div>
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
                    {(call.outcome === 'follow_up' || call.outcome === 'drop') && (
                      <>
                        {call.objectionsRaised.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <strong>Objections raised:</strong>
                            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                              {call.objectionsRaised.map((o, i) => <li key={i}>{o}</li>)}
                            </ul>
                          </div>
                        )}
                        {call.toneNotes && <div style={{ marginTop: 8 }}><strong>Tone:</strong> {call.toneNotes}</div>}
                        {call.whatResonated && <div style={{ marginTop: 8 }}><strong>What resonated:</strong> {call.whatResonated}</div>}
                      </>
                    )}
                  </div>
                  {call.winningPhrases.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px' }}>
                      <div className={a.cardTitle} style={{ marginBottom: 8 }}>✨ PHRASES THAT LANDED</div>
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
                </div>

                {call.outcome === 'follow_up' && (
                  <div className={a.card}>
                    <div className={a.cardHeader}><span className={a.cardTitle}>🔄 FOLLOW UP</span></div>
                    <div className={a.cardBody}>
                      {call.followUpNotes}
                      <div className={a.coachingStage}>Call back: {call.followUpDate ?? 'no timeframe given'}</div>
                    </div>
                  </div>
                )}

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

                {/* Booked + not yet linked to a Nexus prospect — always a
                    one-click confirm, never silent, however confident the
                    suggested match. */}
                {call.outcome === 'booked' && !call.linkedProspectId && call.prospectMatches.length > 0 && (
                  <div className={a.card}>
                    <div className={a.cardHeader}><span className={a.cardTitle}>🔗 LINK TO PROSPECT</span></div>
                    <div className={a.cardBody}>
                      Looks like you booked {call.prospect_name ?? 'this prospect'} — link to prospect?
                    </div>
                    <div className={a.cardActions}>
                      {call.prospectMatches.map(m => (
                        <button key={m.id} className={a.outcomeBtn} onClick={() => void handleLinkProspect(call.id, m.id)} disabled={actingOn === call.id}>
                          {m.name}{m.company ? ` (${m.company})` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {call.outcome === 'booked' && call.linkedProspectId && (
                  <p className={a.transcriptHint}>✓ Linked to prospect — marked booked in Nexus</p>
                )}

                {/* Set Reminder — day-of nudge on the home screen */}
                {(call.meetingDate || call.followUpDate) && (
                  <div className={a.card}>
                    <div className={a.cardHeader}><span className={a.cardTitle}>🔔 SET REMINDER</span></div>
                    <div className={a.cardBody}>
                      {call.outcome === 'booked'
                        ? `Remind me on the day of the meeting${call.meetingDate ? ` (${call.meetingDate})` : ''}.`
                        : `Remind me to follow up${call.followUpDate ? ` on ${call.followUpDate}` : ''}.`}
                    </div>
                    <div className={a.cardActions}>
                      <button
                        className={`${a.outcomeBtn} ${call.reminderSet ? a.outcomeBtnActive : ''}`}
                        onClick={() => void handleSetReminder(call.id)}
                        disabled={call.reminderSet || actingOn === call.id}
                      >
                        {call.reminderSet ? '✓ Reminder set' : 'Set reminder'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className={a.pinnedFooter}>
        <GlobalChat />
        <CallUploadFlow onComplete={load} />
      </div>
    </div>
  )
}
