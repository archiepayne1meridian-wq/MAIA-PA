'use client'

import { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { useRouter } from 'next/navigation'
import s from '../hub.module.css'
import type { ConversationAgent, HubAgentMeta } from './hub-agents'
import FileDropZone from './FileDropZone'

// What the empty-state CTA does for each agent — most just focus the input
// (it's the only thing that works for them so far), but News/LinkedIn retry
// their auto-populate and Calls points at its real dedicated workspace.
const EMPTY_STATE_CTA: Partial<Record<ConversationAgent, { label: string; action: 'retry' | 'focus' | string }>> = {
  news: { label: 'Try again', action: 'retry' },
  linkedin: { label: 'Open LinkedIn workspace', action: '/dashboard/iris' },
  calls: { label: 'Open Calls workspace', action: '/dashboard/apollo' },
}

// Mirrors the server-side allow-list in /api/dashboard/conversations/[agent]/upload —
// kept here too so the file picker and drag-over only accept what that route will.
const AGENT_FILE_ACCEPT: Partial<Record<ConversationAgent, string[]>> = {
  calls: ['mp3', 'mp4', 'm4a', 'wav', 'ogg'],
  linkedin: ['png', 'jpg', 'jpeg', 'webp'],
  news: ['pdf', 'png', 'jpg'],
  study: ['pdf', 'docx'],
  prospects: ['csv', 'xlsx'],
}
const DEFAULT_FILE_ACCEPT = ['png', 'jpg', 'jpeg', 'webp', 'pdf']

interface ConversationMessage {
  id: string
  role: 'maia' | 'user'
  type: 'text' | 'draft' | 'news' | 'crm_notes' | 'flashcard' | 'morning_brief' | 'action_buttons' | 'news_brief' | 'news_card'
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
  onSwitchAgent?: (agent: ConversationAgent) => void
}

function fmtDate(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function timeAgo(ts: number): string {
  const diffSecs = Math.max(0, Math.floor(Date.now() / 1000) - ts)
  if (diffSecs < 3600) return `${Math.max(1, Math.round(diffSecs / 60))}m ago`
  if (diffSecs < 86400) return `${Math.round(diffSecs / 3600)}h ago`
  return `${Math.round(diffSecs / 86400)}d ago`
}

const ConversationCentre = forwardRef<ConversationCentreHandle, Props>(function ConversationCentre({ agent, onMessageSent, onSwitchAgent }, ref) {
  const router = useRouter()
  const [messages, setMessages] = useState<ConversationMessage[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [notConnectedNote, setNotConnectedNote] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [barDragOver, setBarDragOver] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useImperativeHandle(ref, () => ({ focusInput: () => inputRef.current?.focus() }))

  // Kept in a ref rather than a useCallback dependency — HubShell passes a new
  // inline function on every render, so depending on it directly would
  // recreate `load` (and retrigger its effect) on every parent render.
  const onMessageSentRef = useRef(onMessageSent)
  useEffect(() => { onMessageSentRef.current = onMessageSent }, [onMessageSent])

  const load = useCallback(() => {
    const agentId = agent.id
    setLoadError(null)
    fetch(`/api/dashboard/conversations/${agentId}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({})) as { error?: string }
          throw new Error(body.error ?? `${r.status}`)
        }
        return r.json() as Promise<{ messages: ConversationMessage[] }>
      })
      .then(d => {
        setMessages(d.messages)
        // A GET can itself insert a message (morning brief / news auto-fetch /
        // LinkedIn draft) — the right-hand context panel should reflect that
        // too, same as it does after a manually sent message.
        onMessageSentRef.current?.()
      })
      .catch((err: Error) => {
        console.error(`[conversation:${agentId}] load failed:`, err)
        setLoadError(err.message)
        setMessages([])
      })
  }, [agent.id])

  // Reset to the loading state immediately on agent switch — without this the
  // previous agent's messages stay on screen (stale) until the new fetch
  // resolves, which reads as "the thread didn't update" when switching fast.
  useEffect(() => {
    setMessages(null)
    setLoadError(null)
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

  // Routes a dropped/picked file based on the active agent + its extension —
  // server-side validates the same allow-list (AGENT_FILE_ACCEPT above mirrors
  // it client-side just for the picker/drag-over affordance).
  async function handleFileDrop(file: File) {
    if (uploadingFile) return
    setUploadingFile(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/dashboard/conversations/${agent.id}/upload`, { method: 'POST', body: formData })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      load()
      onMessageSent?.()
    } catch (err) {
      console.error('[conversation] file upload failed:', err)
    } finally {
      setUploadingFile(false)
    }
  }

  function notConnected() {
    setNotConnectedNote("This agent's conversation logic isn't connected yet.")
    setTimeout(() => setNotConnectedNote(null), 2500)
  }

  function showToast(text: string) {
    setToast(text)
    setTimeout(() => setToast(null), 2200)
  }

  async function copyToClipboard(text: string) {
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
  }

  function readFullArticle(url: string | undefined) {
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function useOnCall(itemId: string | undefined, callAngle: string) {
    await copyToClipboard(callAngle)
    showToast('Copied — ready to use')
    if (!itemId) return
    try {
      await fetch('/api/dashboard/cassandra/used', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, action: 'used_on_call' }),
      })
    } catch { /* best-effort tracking — the copy already happened */ }
  }

  async function postIdea(itemId: string | undefined) {
    if (!itemId) return
    try {
      await fetch('/api/dashboard/cassandra/used', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, action: 'post_idea' }),
      })
      onSwitchAgent?.('linkedin')
    } catch (err) {
      console.error('[conversation] post idea failed:', err)
    }
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
          <div className={s.chatEmpty}>Loading conversation...</div>
        ) : messages.length === 0 ? (
          <div className={s.chatEmpty}>
            <p>No messages yet.</p>
            {loadError && <p style={{ color: 'var(--alert)', marginTop: 4 }}>{loadError}</p>}
            {(() => {
              const cta = EMPTY_STATE_CTA[agent.id]
              if (!cta) return (
                <button className={`${s.hBtn} ${s.hBtnG}`} style={{ marginTop: 10 }} onClick={() => inputRef.current?.focus()}>Start here</button>
              )
              return (
                <button
                  className={`${s.hBtn} ${s.hBtnP}`}
                  style={{ marginTop: 10 }}
                  onClick={() => (cta.action === 'retry' ? load() : router.push(cta.action))}
                >
                  {cta.label}
                </button>
              )
            })()}
          </div>
        ) : (
          messages.map(m => (
            <MessageItem
              key={m.id}
              message={m}
              onNotConnected={notConnected}
              onCopy={copyToClipboard}
              onReadArticle={readFullArticle}
              onUseOnCall={useOnCall}
              onPostIdea={postIdea}
            />
          ))
        )}
        {toast && <div className={s.toast}>{toast}</div>}
      </div>

      <div
        className={`${s.chatInputBar} ${barDragOver ? s.chatInputBarDragOver : ''}`}
        onDragOver={e => { e.preventDefault(); setBarDragOver(true) }}
        onDragLeave={() => setBarDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setBarDragOver(false)
          const file = e.dataTransfer.files[0]
          if (file) void handleFileDrop(file)
        }}
      >
        <button className={s.micBtn} onClick={notConnected} aria-label="Voice input">🎙</button>
        <FileDropZone
          compact
          accept={AGENT_FILE_ACCEPT[agent.id] ?? DEFAULT_FILE_ACCEPT}
          onFile={file => void handleFileDrop(file)}
          disabled={uploadingFile}
          label={`Attach file (${(AGENT_FILE_ACCEPT[agent.id] ?? DEFAULT_FILE_ACCEPT).map(e => `.${e}`).join(' ')})`}
        />
        <input
          ref={inputRef}
          className={s.chatInput}
          placeholder={notConnectedNote ?? (uploadingFile ? 'Uploading file…' : 'Type or speak to MAIA...')}
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

function MessageItem({ message, onNotConnected, onCopy, onReadArticle, onUseOnCall, onPostIdea }: {
  message: ConversationMessage
  onNotConnected: () => void
  onCopy: (text: string) => void
  onReadArticle: (url: string | undefined) => void
  onUseOnCall: (itemId: string | undefined, callAngle: string) => void
  onPostIdea: (itemId: string | undefined) => void
}) {
  if (message.type === 'news_brief') {
    return (
      <div className={`${s.msg} ${s.msgMaia}`}>
        <div className={s.msgSender}>MAIA · {fmtTime(message.timestamp)}</div>
        <div className={s.msgBubble}>{message.content}</div>
      </div>
    )
  }

  if (message.type === 'news_card') {
    const meta = message.metadata as {
      itemId?: string; title?: string; source?: string; url?: string
      keyQuote?: string | null; callAngle?: string; categoryLabel?: string
    } | undefined
    return (
      <div className={s.newsCard}>
        <div className={s.newsTitle}>📰 {meta?.title ?? message.content}</div>
        <div className={s.newsMeta}>{meta?.source ?? ''} · {timeAgo(message.timestamp)}{meta?.categoryLabel ? ` · ${meta.categoryLabel}` : ''}</div>
        <div className={s.newsSummary}>{message.content}</div>
        {meta?.keyQuote && (
          <div className={s.newsQuoteBlock}>
            <div className={s.newsBlockLabel}>💬 Key quote</div>
            <p className={s.newsQuoteText}>&ldquo;{meta.keyQuote}&rdquo;</p>
          </div>
        )}
        {meta?.callAngle && (
          <div className={s.newsAngleBlock}>
            <div className={s.newsBlockLabel}>📞 Call angle</div>
            <p className={s.newsAngleText}>{meta.callAngle}</p>
          </div>
        )}
        <div className={s.newsActions}>
          <button className={`${s.hBtn} ${s.hBtnG}`} onClick={() => onReadArticle(meta?.url)} disabled={!meta?.url}>Read full article ↗</button>
          <button className={`${s.hBtn} ${s.hBtnP}`} onClick={() => onUseOnCall(meta?.itemId, meta?.callAngle ?? '')}>Use on a call</button>
          <button className={`${s.hBtn} ${s.hBtnG}`} onClick={() => onPostIdea(meta?.itemId)}>Post idea</button>
        </div>
      </div>
    )
  }

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
