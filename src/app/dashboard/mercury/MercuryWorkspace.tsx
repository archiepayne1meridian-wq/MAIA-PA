'use client'

import { useEffect, useState, useCallback } from 'react'
import s from '../dashboard.module.css'

type Medium = 'email' | 'whatsapp' | 'imessage'

interface MercuryDraft {
  id: string
  medium: string
  context: string
  incoming_message: string | null
  draft: string
  status: string
  created_at: number
}

interface DraftResult {
  id: string
  subject: string | null
  body: string
  medium: string
  status: string
  error?: string
}

const MEDIUM_LABELS: Record<Medium, string> = {
  email: '✉️ Email',
  whatsapp: '💬 WhatsApp',
  imessage: '💬 iMessage',
}

function relDate(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function MercuryWorkspace() {
  const [medium, setMedium] = useState<Medium>('email')
  const [context, setContext] = useState('')
  const [incoming, setIncoming] = useState('')
  const [showIncoming, setShowIncoming] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [currentDraft, setCurrentDraft] = useState<DraftResult | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const [feedback, setFeedback] = useState('')
  const [refining, setRefining] = useState(false)
  const [refineError, setRefineError] = useState<string | null>(null)

  const [doneMsg, setDoneMsg] = useState<string | null>(null)
  const [doneBusy, setDoneBusy] = useState(false)

  const [copied, setCopied] = useState(false)

  const [history, setHistory] = useState<MercuryDraft[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedExpandId, setCopiedExpandId] = useState<string | null>(null)

  const loadHistory = useCallback(() => {
    setHistoryError(null)
    fetch('/api/dashboard/mercury')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<{ drafts: MercuryDraft[] }>
      })
      .then(d => setHistory(d.drafts.filter(x => x.status === 'approved')))
      .catch((e: Error) => setHistoryError(e.message))
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  async function generate() {
    if (!context.trim()) return
    setGenerating(true)
    setGenerateError(null)
    setCurrentDraft(null)
    setDoneMsg(null)
    setFeedback('')
    try {
      const res = await fetch('/api/dashboard/mercury/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medium, context, incomingMessage: incoming || undefined }),
      })
      const data = await res.json() as DraftResult
      if (!res.ok) throw new Error(data.error ?? `${res.status}`)
      setCurrentDraft(data)
    } catch (e) {
      setGenerateError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  async function refine() {
    if (!currentDraft || !feedback.trim()) return
    setRefining(true)
    setRefineError(null)
    try {
      const res = await fetch('/api/dashboard/mercury/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: currentDraft.id, feedback }),
      })
      const data = await res.json() as DraftResult
      if (!res.ok) throw new Error(data.error ?? `${res.status}`)
      setCurrentDraft(prev => prev ? { ...prev, body: data.body, subject: data.subject } : data)
      setFeedback('')
    } catch (e) {
      setRefineError(String(e))
    } finally {
      setRefining(false)
    }
  }

  async function approve() {
    if (!currentDraft) return
    setDoneBusy(true)
    setDoneMsg(null)
    try {
      const res = await fetch('/api/dashboard/mercury/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: currentDraft.id }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setDoneMsg('Saved. Copy and send whenever you\'re ready.')
      loadHistory()
    } catch (e) {
      setDoneMsg(`Error: ${String(e)}`)
    } finally {
      setDoneBusy(false)
    }
  }

  async function copyToClipboard() {
    if (!currentDraft) return
    const text = currentDraft.subject
      ? `Subject: ${currentDraft.subject}\n\n${currentDraft.body}`
      : currentDraft.body
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={s.mercuryWs}>

      {/* Medium selector */}
      <section className={s.mercurySection}>
        <span className={s.eyebrow}>Medium</span>
        <div className={s.mercuryMediumRow}>
          {(['email', 'whatsapp', 'imessage'] as Medium[]).map(m => (
            <button
              key={m}
              className={`${s.mercuryMediumBtn} ${medium === m ? s.mercuryMediumActive : ''}`}
              onClick={() => setMedium(m)}
            >
              {MEDIUM_LABELS[m]}
            </button>
          ))}
        </div>
      </section>

      {/* Context input */}
      <section className={s.mercurySection}>
        <span className={s.eyebrow}>Context</span>
        <textarea
          className={s.mercuryTextarea}
          rows={3}
          placeholder="Who is this to and what do you need? e.g. follow-up to a prospect who attended last week's seminar, pension planning conversation, warm but professional"
          value={context}
          onChange={e => setContext(e.target.value)}
        />
      </section>

      {/* Incoming message (collapsible) */}
      <section className={s.mercurySection}>
        <button
          className={s.mercuryToggle}
          onClick={() => setShowIncoming(v => !v)}
        >
          {showIncoming ? '▾' : '▸'} Incoming message <span className={s.mercuryToggleHint}>(optional — paste if replying)</span>
        </button>
        {showIncoming && (
          <textarea
            className={s.mercuryTextarea}
            rows={4}
            placeholder="Paste the message you're replying to here…"
            value={incoming}
            onChange={e => setIncoming(e.target.value)}
          />
        )}
      </section>

      {/* Generate button */}
      <button
        className={s.mercuryGenerateBtn}
        onClick={() => void generate()}
        disabled={generating || !context.trim()}
      >
        {generating ? 'Generating…' : 'Generate draft'}
      </button>
      {generateError && <p className={s.mercuryError}>{generateError}</p>}

      {/* Draft output */}
      {currentDraft && (
        <section className={s.mercuryDraftSection}>
          <div className={s.mercuryDraftHead}>
            <span className={s.eyebrow}>Draft</span>
            <button className={s.mercuryCopyBtn} onClick={() => void copyToClipboard()}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          {currentDraft.subject && (
            <div className={s.mercurySubjectLine}>
              <span className={s.mercurySubjectLabel}>Subject:</span> {currentDraft.subject}
            </div>
          )}

          <pre className={s.mercuryDraftBody}>{currentDraft.body}</pre>

          {doneMsg && <p className={s.mercuryDoneMsg}>{doneMsg}</p>}

          {/* Refine input */}
          <div className={s.mercuryRefineRow}>
            <input
              className={s.mercuryRefineInput}
              placeholder="Feedback to refine… (e.g. make it more formal, shorter, add Thursday availability)"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void refine() } }}
            />
            <button
              className={s.mercuryRefineBtn}
              onClick={() => void refine()}
              disabled={refining || !feedback.trim()}
            >
              {refining ? '…' : 'Regenerate'}
            </button>
          </div>
          {refineError && <p className={s.mercuryError}>{refineError}</p>}

          {/* Done */}
          <button
            className={s.mercuryDoneBtn}
            onClick={() => void approve()}
            disabled={doneBusy || !!doneMsg}
          >
            {doneBusy ? 'Saving…' : '✓ Done — approve draft'}
          </button>
        </section>
      )}

      {/* Draft history */}
      <section className={s.mercuryHistorySection}>
        <span className={s.eyebrow}>History (last 7 days — approved)</span>
        {historyError && <p className={s.mercuryError}>{historyError}</p>}
        {history.length === 0 && !historyError && (
          <div className={s.mercuryEmpty}>No approved drafts in the last 7 days.</div>
        )}
        {history.map(d => (
          <div key={d.id}>
            <div
              className={`${s.mercuryHistoryRow} ${s.mercuryHistoryRowClickable}`}
              onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
            >
              <span className={s.mercuryHistoryMedium}>{d.medium}</span>
              <div className={s.mercuryHistoryBody}>
                <div className={s.mercuryHistoryContext}>{d.context.slice(0, 80)}{d.context.length > 80 ? '…' : ''}</div>
                <div className={s.mercuryHistoryMeta}>{relDate(d.created_at)} · approved</div>
              </div>
              <span className={s.mercuryExpandBtn}>{expandedId === d.id ? '▲' : '▼'}</span>
            </div>
            {expandedId === d.id && (
              <div className={s.mercuryExpandedDraft}>
                <div className={s.mercuryExpandedHeader}>
                  <button
                    className={s.mercuryCopyExpandBtn}
                    onClick={e => {
                      e.stopPropagation()
                      void navigator.clipboard.writeText(d.draft).then(() => {
                        setCopiedExpandId(d.id)
                        setTimeout(() => setCopiedExpandId(null), 2000)
                      })
                    }}
                  >
                    {copiedExpandId === d.id ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <pre className={s.mercuryExpandedBody}>{d.draft}</pre>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
