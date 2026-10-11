'use client'

// Reusable chat mechanic shared by MERCURY's conversational tabs (LinkedIn
// Messages, Quick Replies). History is kept in memory for the life of the
// component only — nothing is persisted server-side, matching the spec: each
// tab is an independent, in-browser-session conversation.

import { useState, useRef, useEffect } from 'react'
import s from './ChatInterface.module.css'

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
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, sending])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setError(null)
    setInput('')
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setSending(true)
    try {
      const res = await fetch('/api/dashboard/mercury/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab, messages: next }),
      })
      const data = await res.json() as { reply?: string; error?: string }
      if (!res.ok || !data.reply) throw new Error(data.error ?? 'Failed to generate a reply')
      setMessages(m => [...m, { role: 'assistant', content: data.reply! }])
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

  return (
    <div className={s.panel}>
      <div ref={threadRef} className={s.thread}>
        {messages.length === 0 ? (
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

      <div className={s.inputBar}>
        <input
          ref={inputRef}
          className={s.input}
          placeholder={sending ? 'Thinking…' : placeholder ?? 'Type a message...'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void send() }}
          disabled={sending}
        />
        <button className={s.sendBtn} onClick={() => void send()} disabled={sending || !input.trim()} aria-label="Send">
          →
        </button>
      </div>
    </div>
  )
}
