'use client'

import { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import s from '../hub.module.css'
import type { ConversationAgent, HubAgentMeta } from './hub-agents'

interface ConversationMessage {
  id: string
  role: 'maia' | 'user'
  type: 'text' | 'draft' | 'news' | 'crm_notes' | 'flashcard' | 'morning_brief' | 'action_buttons'
  content: string
  metadata?: Record<string, unknown>
  timestamp: number
  approved?: boolean
}

export interface ConversationCentreHandle {
  focusInput: () => void
}

interface Props {
  agent: HubAgentMeta
  onMessageSent?: () => void
}

function fmtDate(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const ConversationCentre = forwardRef<ConversationCentreHandle, Props>(function ConversationCentre({ agent, onMessageSent }, ref) {
  const [messages, setMessages] = useState<ConversationMessage[] | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [notConnectedNote, setNotConnectedNote] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useImperativeHandle(ref, () => ({ focusInput: () => inputRef.current?.focus() }))

  const load = useCallback(() => {
    fetch(`/api/dashboard/conversations/${agent.id}`)
      .then(r => r.json() as Promise<{ messages: ConversationMessage[] }>)
      .then(d => setMessages(d.messages))
      .catch(() => setMessages([]))
  }, [agent.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages?.length])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    try {
      const res = await fetch(`/api/dashboard/conversations/${agent.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
      const data = await res.json() as { messages?: ConversationMessage[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')
      load()
      onMessageSent?.()
    } catch {
      setInput(text)
    } finally {
      setSending(false)
    }
  }

  function notConnected() {
    setNotConnectedNote("This agent's conversation logic isn't connected yet.")
    setTimeout(() => setNotConnectedNote(null), 2500)
  }

  async function copyToClipboard(text: string) {
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
  }

  return (
    <div className={s.centre}>
      <div className={s.centreHeader}>
        <div className={s.centreDot} />
        <span className={s.centreName}>{agent.name}</span>
        <span className={s.centreRole}>{agent.role} · {fmtDate()}</span>
      </div>

      <div ref={threadRef} className={s.chatThread}>
        {messages === null ? (
          <div className={s.chatEmpty}>Loading…</div>
        ) : messages.length === 0 ? (
          <div className={s.chatEmpty}>No messages yet. Say something below.</div>
        ) : (
          messages.map(m => <MessageItem key={m.id} message={m} onNotConnected={notConnected} onCopy={copyToClipboard} />)
        )}
      </div>

      <div className={s.chatInputBar}>
        <button className={s.micBtn} onClick={notConnected} aria-label="Voice input">🎙</button>
        <input
          ref={inputRef}
          className={s.chatInput}
          placeholder={notConnectedNote ?? 'Type or speak to MAIA...'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void send() }}
        />
        <button className={s.sendBtn} onClick={() => void send()} disabled={sending || !input.trim()} aria-label="Send">↑</button>
      </div>
    </div>
  )
})

export default ConversationCentre

function MessageItem({ message, onNotConnected, onCopy }: {
  message: ConversationMessage
  onNotConnected: () => void
  onCopy: (text: string) => void
}) {
  if (message.type === 'morning_brief') {
    const meta = message.metadata as { dateLabel?: string; todayAngle?: string | null; thisWeekMeetings?: { prospectName: string; meetingDetails: string; hasBrief: boolean; callDate: string }[] } | undefined
    const meetings = meta?.thisWeekMeetings ?? []
    return (
      <div className={s.morningBrief}>
        <div className={s.briefHeader}><h2>Good morning, Archie.</h2><span>{meta?.dateLabel ?? ''}</span></div>
        <div className={s.briefLabel}>TODAY&apos;S ANGLE</div>
        <div className={s.briefAngle}>{meta?.todayAngle ?? message.content}</div>
        <div className={s.briefLabel} style={{ marginTop: 12 }}>THIS WEEK&apos;S MEETINGS</div>
        {meetings.length === 0 ? (
          <div className={s.meetingEmpty}>No meetings tracked yet.</div>
        ) : (
          meetings.map((mtg, i) => (
            <div key={i} className={s.meetingRow}>
              <span style={{ color: mtg.hasBrief ? 'var(--online)' : '#D97706' }}>{mtg.hasBrief ? '✓' : '⚠'}</span>
              <span className={s.meetingName}>{mtg.prospectName}</span>
              <span className={s.meetingTime}>{mtg.callDate}</span>
            </div>
          ))
        )}
      </div>
    )
  }

  if (message.type === 'draft') {
    const meta = message.metadata as { platformTag?: string; postType?: string } | undefined
    return (
      <div className={s.draftCard}>
        <div className={s.draftHeader}><span className={s.platformTag}>{meta?.platformTag ?? 'DRAFT'}</span></div>
        <div className={s.draftBody}>{message.content}</div>
        <div className={s.draftActions}>
          <button className={`${s.hBtn} ${s.hBtnP}`} onClick={onNotConnected}>✓ Approve</button>
          <button className={`${s.hBtn} ${s.hBtnG}`} onClick={onNotConnected}>✏ Edit</button>
          <button className={`${s.hBtn} ${s.hBtnG}`} onClick={onNotConnected}>🔄 Redo</button>
        </div>
      </div>
    )
  }

  if (message.type === 'news') {
    const meta = message.metadata as { headline?: string; source?: string; timeAgo?: string; url?: string } | undefined
    return (
      <div className={s.newsCard}>
        <div className={s.newsTitle}>📰 {meta?.headline ?? message.content}</div>
        <div className={s.newsMeta}>{meta?.source ?? ''} {meta?.timeAgo ? `· ${meta.timeAgo}` : ''}</div>
        <div className={s.newsSummary}>{message.content}</div>
        <div className={s.newsActions}>
          <button className={`${s.hBtn} ${s.hBtnG}`} onClick={onNotConnected}>Read full article →</button>
          <button className={`${s.hBtn} ${s.hBtnP}`} onClick={onNotConnected}>Use on a call</button>
        </div>
      </div>
    )
  }

  if (message.type === 'flashcard') {
    return (
      <div className={s.flashcard}>
        <div className={s.flashcardQ}>Q: {message.content}</div>
        <div className={s.flashcardActions}>
          <button className={`${s.hBtn} ${s.hBtnG}`} onClick={onNotConnected}>Reveal answer</button>
          <button className={`${s.hBtn} ${s.hBtnG}`} onClick={onNotConnected}>Again</button>
          <button className={`${s.hBtn} ${s.hBtnG}`} onClick={onNotConnected}>Hard</button>
          <button className={`${s.hBtn} ${s.hBtnG}`} onClick={onNotConnected}>Good</button>
          <button className={`${s.hBtn} ${s.hBtnG}`} onClick={onNotConnected}>Easy</button>
        </div>
      </div>
    )
  }

  if (message.type === 'crm_notes') {
    const meta = message.metadata as { prospectName?: string } | undefined
    return (
      <div className={s.crmCard}>
        <div className={s.crmHeader}>CRM NOTES — {meta?.prospectName ?? ''}</div>
        <div className={s.crmBody}>{message.content}</div>
        <div className={s.crmActions}>
          <button className={`${s.hBtn} ${s.hBtnG}`} onClick={() => onCopy(message.content)}>📋 Copy to clipboard</button>
        </div>
      </div>
    )
  }

  // 'text' and 'action_buttons' fall back to a plain bubble
  return (
    <div className={`${s.msg} ${message.role === 'user' ? s.msgUser : s.msgMaia}`}>
      <div className={s.msgSender}>{message.role === 'user' ? 'Archie' : `MAIA · ${fmtTime(message.timestamp)}`}</div>
      <div className={s.msgBubble}>{message.content}</div>
    </div>
  )
}
