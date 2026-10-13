'use client'

// Reusable chat mechanic shared by MERCURY's conversational tabs (LinkedIn
// Messages, Quick Replies). Each tab is still an independent conversation —
// but now persisted server-side (mercury_chat_messages, scoped by tab), not
// kept only in this component's React state, so it survives a refresh or
// closing the browser entirely.

import { useState, useRef, useEffect } from 'react'
import s from './ChatInterface.module.css'
import ChatInput from './ChatInput'

export interface ChatInterfaceProps {
  tab: 'linkedin_messages' | 'quick_replies'
  starterMessage?: string
  placeholder?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatInterface({ tab, starterMessage, placeholder }: ChatInterfaceProps) {
  // null = history still loading — the input stays disabled until it
  // resolves, so Archie never types into a thread that's about to be
  // overwritten by whatever loads a moment later.
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setMessages(null)
    fetch(`/api/dashboard/mercury/chat?tab=${tab}`)
      .then(r => r.json() as Promise<{ messages?: ChatMessage[] }>)
      .then(d => setMessages(d.messages ?? []))
      .catch(() => setMessages([]))
  }, [tab])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages?.length, sending])

  async function send() {
    const text = input.trim()
    if (!text || sending || messages === null) return
    setError(null)
    setInput('')
    setMessages(m => [...(m ?? []), { role: 'user', content: text }])
    setSending(true)
    try {
      const res = await fetch('/api/dashboard/mercury/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab, message: text }),
      })
      const data = await res.json() as { reply?: string; error?: string }
      if (!res.ok || !data.reply) throw new Error(data.error ?? 'Failed to generate a reply')
      setMessages(m => [...(m ?? []), { role: 'assistant', content: data.reply! }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate a reply')
    } finally {
      setSending(false)
    }
  }

  async function copy(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 1800)
    } catch { /* ignore */ }
  }

  const loading = messages === null

  return (
    <div className={s.panel}>
      <div ref={threadRef} className={s.thread}>
        {loading ? (
          <div className={s.empty}>Loading…</div>
        ) : messages.length === 0 ? (
          <div className={s.empty}>{starterMessage ?? 'Type a message to get started.'}</div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`${s.msg} ${m.role === 'user' ? s.msgUser : s.msgMaia}`}>
              <div className={s.msgSender}>{m.role === 'user' ? 'Archie' : 'MAIA'}</div>
              <div className={s.msgBubble}>{m.content}</div>
              {m.role === 'assistant' && (
                <div className={s.bubbleActions}>
                  <button className={s.copyBtn} onClick={() => void copy(m.content, i)}>
                    {copiedIndex === i ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        {sending && (
          <div className={`${s.msg} ${s.msgMaia}`}>
            <div className={s.msgSender}>MAIA</div>
            <div className={s.msgBubble}>…</div>
          </div>
        )}
        {error && <div className={s.errorBubble}>{error}</div>}
      </div>

      <ChatInput
        ref={inputRef}
        value={input}
        onChange={setInput}
        onSend={() => void send()}
        sending={loading || sending}
        placeholder={loading ? 'Loading…' : placeholder}
      />
    </div>
  )
}
