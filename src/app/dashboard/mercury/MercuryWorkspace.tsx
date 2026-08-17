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

interface MercuryTemplate {
  id: string
  name: string
  category: string
  medium: string
  description: string
  system_prompt_addition: string
  created_at: number
}

interface ApolloCallSummary {
  id: string
  call_date: string
  prospect_name: string | null
  created_at: number
}

interface ApolloIntelligence {
  prospect_name: string | null
  meeting_details: string | null
  financial_concerns: string | null
  talking_points: string[]
}

const MEDIUM_LABELS: Record<Medium, string> = {
  email: '✉️ Email',
  whatsapp: '💬 WhatsApp',
  imessage: '💬 iMessage',
}

const CATEGORY_LABELS: Record<string, string> = {
  booking: 'Booking',
  reminder: 'Reminder',
  follow_up: 'Follow-Up',
  thank_you: 'Thank You',
  general: 'General',
}

// Placeholder guidance shown in the context box once a template is selected —
// keyed by template name (fixed, seeded once via scripts/seed-mercury-templates.ts).
const TEMPLATE_CONTEXT_PROMPTS: Record<string, string> = {
  'Post-Call Booking Confirmation': 'Post-Call Booking: Who did you just book? What did they mention on the call? Meeting date, time, and format (phone/video)?',
  'Meeting Reminder': 'Meeting Reminder: Who is the meeting with, and when? What will you be discussing? Any dial-in link or phone number to include?',
  'Pre-Meeting Follow-Up': 'Pre-Meeting Follow-Up: Who has gone quiet, and what meeting are you confirming? What day/time was proposed?',
  'Post-Meeting Thank You': 'Post-Meeting Thank You: Who did you meet with, and when? One positive thing about how the meeting went?',
  'General Follow-Up': 'General Follow-Up: Who are you reaching out to, and why now? Any news, regulation change, or something they mentioned that gives you a natural reason to get in touch?',
}

function relDate(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function MercuryWorkspace() {
  // ── Template library state (additive — free compose below is unchanged) ──
  const [viewMode, setViewMode] = useState<'compose' | 'templates'>('compose')
  const [templates, setTemplates] = useState<MercuryTemplate[]>([])
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [activeTemplate, setActiveTemplate] = useState<MercuryTemplate | null>(null)
  const [recentApolloCall, setRecentApolloCall] = useState<ApolloCallSummary | null>(null)
  const [pullingApollo, setPullingApollo] = useState(false)
  const [pullApolloError, setPullApolloError] = useState<string | null>(null)

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

  // Load the template library + check for a recent (last 24h) APOLLO call.
  useEffect(() => {
    fetch('/api/dashboard/mercury/templates')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<{ templates: MercuryTemplate[] }>
      })
      .then(d => setTemplates(d.templates))
      .catch((e: Error) => setTemplatesError(e.message))

    fetch('/api/dashboard/apollo')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<{ calls: ApolloCallSummary[] }>
      })
      .then(d => {
        const dayAgo = Date.now() / 1000 - 24 * 3600
        const recent = d.calls.find(c => c.created_at >= dayAgo)
        setRecentApolloCall(recent ?? null)
      })
      .catch(() => setRecentApolloCall(null))
  }, [])

  function selectTemplate(t: MercuryTemplate) {
    setActiveTemplate(t)
    setMedium(t.medium as Medium)
    setContext('')
    setCurrentDraft(null)
    setGenerateError(null)
    setPullApolloError(null)
    setViewMode('compose')
  }

  function clearTemplate() {
    setActiveTemplate(null)
    setPullApolloError(null)
  }

  async function pullFromLastCall() {
    if (!recentApolloCall) return
    setPullingApollo(true)
    setPullApolloError(null)
    try {
      const res = await fetch(`/api/dashboard/apollo/${recentApolloCall.id}`)
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json() as { call: { prospect_name: string | null; intelligence: ApolloIntelligence | null } }
      const intel = data.call.intelligence
      const prospectName = intel?.prospect_name ?? data.call.prospect_name
      const parts: string[] = []
      if (prospectName) parts.push(`Prospect: ${prospectName}.`)
      if (intel?.meeting_details) parts.push(`Meeting: ${intel.meeting_details}.`)
      if (intel?.financial_concerns) parts.push(`Concerns: ${intel.financial_concerns}.`)
      if (intel?.talking_points?.length) parts.push(`Key points: ${intel.talking_points.join('; ')}.`)
      setContext(parts.join(' '))
    } catch (e) {
      setPullApolloError(String(e))
    } finally {
      setPullingApollo(false)
    }
  }

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
        body: JSON.stringify({
          medium,
          context,
          incomingMessage: incoming || undefined,
          templateAddition: activeTemplate?.system_prompt_addition,
        }),
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

      {/* Template / free-compose selector */}
      <section className={s.mercurySection}>
        <div className={s.mercuryModeRow}>
          <button
            className={`${s.mercuryModeBtn} ${viewMode === 'templates' ? s.mercuryModeActive : ''}`}
            onClick={() => setViewMode('templates')}
          >
            Templates ▾
          </button>
          <button
            className={`${s.mercuryModeBtn} ${viewMode === 'compose' && !activeTemplate ? s.mercuryModeActive : ''}`}
            onClick={() => { setViewMode('compose'); clearTemplate() }}
          >
            Compose freely
          </button>
        </div>
      </section>

      {/* Template grid */}
      {viewMode === 'templates' && (
        <section className={s.mercurySection}>
          <span className={s.eyebrow}>Choose a template</span>
          {templatesError && <p className={s.mercuryError}>{templatesError}</p>}
          {templates.length === 0 && !templatesError && (
            <div className={s.mercuryEmpty}>No templates yet — run scripts/seed-mercury-templates.ts.</div>
          )}
          <div className={s.mercuryTemplateGrid}>
            {templates.map(t => (
              <button key={t.id} className={s.mercuryTemplateCard} onClick={() => selectTemplate(t)}>
                <div className={s.mercuryTemplateCardHead}>
                  <span className={s.mercuryTemplateName}>{t.name}</span>
                  <span className={s.mercuryMediumBadge}>{MEDIUM_LABELS[t.medium as Medium] ?? t.medium}</span>
                </div>
                <span className={s.mercuryCategoryChip}>{CATEGORY_LABELS[t.category] ?? t.category}</span>
                <p className={s.mercuryTemplateDesc}>{t.description}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Active template banner */}
      {viewMode === 'compose' && activeTemplate && (
        <section className={s.mercurySection}>
          <div className={s.mercuryTemplateBanner}>
            <span>
              Using template: <strong>{activeTemplate.name}</strong>
              <span className={s.mercuryCategoryChip} style={{ marginLeft: 8 }}>{CATEGORY_LABELS[activeTemplate.category] ?? activeTemplate.category}</span>
            </span>
            <button className={s.mercuryToggle} onClick={clearTemplate}>Clear</button>
          </div>
          {recentApolloCall && (
            <div className={s.mercuryPullApolloRow}>
              <button
                className={s.mercuryPullApolloBtn}
                onClick={() => void pullFromLastCall()}
                disabled={pullingApollo}
              >
                {pullingApollo ? 'Pulling…' : `📞 Pull from last call${recentApolloCall.prospect_name ? ` — ${recentApolloCall.prospect_name}` : ''}`}
              </button>
              {pullApolloError && <span className={s.mercuryError}>{pullApolloError}</span>}
            </div>
          )}
        </section>
      )}

      {viewMode === 'compose' && (
        <>
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
          placeholder={
            activeTemplate
              ? TEMPLATE_CONTEXT_PROMPTS[activeTemplate.name] ?? 'Fill in the details for this template…'
              : "Who is this to and what do you need? e.g. follow-up to a prospect who attended last week's seminar, pension planning conversation, warm but professional"
          }
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
        </>
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
