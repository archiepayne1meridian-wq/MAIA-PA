'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import s from '../dashboard.module.css'

type PostType = 'personal_story' | 'news_angle' | 'fact_drop' | 'tool_guide' | 'expat_reality' | 'reframe'
type PostTypeChoice = PostType | 'auto'

interface IrisPost {
  id: string
  topic: string
  copy: string
  status: string
  post_type: string | null
  created_at: number
}

interface TimelineItem {
  id: string
  role: 'maia' | 'archie'
  content: string
  created_at: number
  draft: IrisPost | null
}

interface VoiceLearning {
  id: string
  learning: string
  applied_count: number
}

interface ThreadData {
  timeline: TimelineItem[]
  activeDraftId: string | null
  history: IrisPost[]
  voiceLearnings: VoiceLearning[]
  weeklyTracker: { totalThisWeek: number; approvedThisWeek: number }
}

const POST_TYPE_PILLS: { id: PostTypeChoice; emoji: string; label: string }[] = [
  { id: 'auto', emoji: '✨', label: 'Auto' },
  { id: 'personal_story', emoji: '🙋', label: 'Story' },
  { id: 'news_angle', emoji: '📰', label: 'News' },
  { id: 'fact_drop', emoji: '📊', label: 'Fact' },
  { id: 'tool_guide', emoji: '🛠', label: 'Guide' },
  { id: 'expat_reality', emoji: '✈️', label: 'Reality' },
  { id: 'reframe', emoji: '🔄', label: 'Reframe' },
]
const POST_TYPE_LABEL: Record<string, string> = Object.fromEntries(POST_TYPE_PILLS.map(t => [t.id, t.label]))

function relDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function firstLine(text: string): string {
  const line = text.split('\n').find(l => l.trim())
  return line ? (line.length > 90 ? line.slice(0, 90) + '…' : line) : '(empty)'
}

export default function IrisWorkspace() {
  const [data, setData] = useState<ThreadData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [postType, setPostType] = useState<PostTypeChoice>('auto')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [actingOnId, setActingOnId] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(() => {
    setError(null)
    fetch('/api/dashboard/iris/thread')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<ThreadData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [data?.timeline.length])

  async function send(message: string) {
    if (!message.trim() || sending) return
    setSending(true)
    setInput('')
    try {
      const res = await fetch('/api/dashboard/iris/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), postType: postType === 'auto' ? undefined : postType }),
      })
      const result = await res.json() as { kind?: string; error?: string }
      if (!res.ok) throw new Error(result.error ?? 'Failed')
      if (result.kind === 'show_history') setHistoryOpen(true)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  function focusForRefine() {
    inputRef.current?.focus()
    setInput(prev => prev || '')
  }

  async function approve(postId: string) {
    setActingOnId(postId)
    try {
      await fetch('/api/dashboard/iris/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
      load()
    } finally {
      setActingOnId(null)
    }
  }

  async function markPosted(postId: string) {
    setActingOnId(postId)
    try {
      await fetch('/api/dashboard/iris/posted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
      load()
    } finally {
      setActingOnId(null)
    }
  }

  if (error) return <div className={s.irisError}>{error}</div>
  if (!data) return <div className={s.irisLoading}>Loading…</div>

  return (
    <div className={s.irisChatLayout}>
      <div className={s.irisChatCentre}>
        <div className={s.irisPostTypeRow}>
          {POST_TYPE_PILLS.map(t => (
            <button
              key={t.id}
              className={`${s.irisPostTypePill} ${postType === t.id ? s.irisPostTypePillActive : ''}`}
              onClick={() => setPostType(t.id)}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        <div ref={threadRef} className={s.irisChatThread}>
          {data.timeline.length === 0 ? (
            <div className={s.irisChatEmpty}>
              No messages yet. Drop a rough idea below, or wait for tomorrow&apos;s 7am draft.
            </div>
          ) : (
            data.timeline.map(item => (
              <div key={item.id} className={`${s.irisChatRow} ${item.role === 'archie' ? s.irisChatRowArchie : s.irisChatRowMaia}`}>
                <span className={s.irisChatLabel}>{item.role === 'archie' ? 'Archie' : 'MAIA'}</span>
                {item.content && (
                  <div className={`${s.irisChatBubble} ${item.role === 'archie' ? s.irisChatBubbleArchie : s.irisChatBubbleMaia}`}>
                    {item.content}
                  </div>
                )}
                {item.draft && (
                  <DraftCard
                    post={item.draft}
                    isActive={item.draft.id === data.activeDraftId}
                    acting={actingOnId === item.draft.id}
                    onApprove={() => void approve(item.draft!.id)}
                    onRefine={focusForRefine}
                    onRedo={() => void send('Start again on the same topic')}
                    onMarkPosted={() => void markPosted(item.draft!.id)}
                  />
                )}
              </div>
            ))
          )}
        </div>

        <div className={s.irisChatInputRow}>
          <textarea
            ref={inputRef}
            className={s.irisChatTextarea}
            placeholder='Drop an idea, or type a refinement like "make the hook punchier"…'
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(input)
              }
            }}
          />
          <button className={s.irisChatSendBtn} onClick={() => void send(input)} disabled={sending || !input.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>

      <div className={s.irisRightPanel}>
        <div className={s.irisRightSection}>
          <span className={s.eyebrow}>This week</span>
          <div className={s.irisTrackerRow}>
            <div className={s.irisTrackerStat}>
              <div className={s.irisTrackerVal}>{data.weeklyTracker.totalThisWeek}</div>
              <div className={s.irisTrackerLabel}>Drafted</div>
            </div>
            <div className={s.irisTrackerStat}>
              <div className={s.irisTrackerVal}>{data.weeklyTracker.approvedThisWeek}</div>
              <div className={s.irisTrackerLabel}>Approved</div>
            </div>
          </div>
        </div>

        <div className={s.irisRightSection}>
          <button className={s.irisVoicePanelToggle} onClick={() => setHistoryOpen(v => !v)}>
            {historyOpen ? '▾' : '▸'} Post history ({data.history.length})
          </button>
          {historyOpen && (
            data.history.length === 0 ? (
              <div className={s.panelEmpty}>No approved posts yet.</div>
            ) : (
              <div className={s.irisHistoryList}>
                {data.history.map(post => (
                  <div key={post.id} className={s.irisHistoryCard}>
                    <div className={s.irisHistoryCardTop}>
                      <span className={s.irisPillarTag}>{post.post_type ? POST_TYPE_LABEL[post.post_type] ?? post.post_type : 'Auto'}</span>
                      <span className={s.irisPostDate}>{relDate(post.created_at)}</span>
                    </div>
                    <div className={s.irisHistoryCardLine}>{firstLine(post.copy)}</div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        <div className={s.irisRightSection}>
          <span className={s.eyebrow}>Voice learnings ({data.voiceLearnings.length})</span>
          {data.voiceLearnings.length === 0 ? (
            <p className={s.irisInsightEmpty}>Nothing learned yet — approve or refine a few drafts.</p>
          ) : (
            <ul className={s.irisVoiceLearningsList}>
              {data.voiceLearnings.slice(0, 8).map(l => (
                <li key={l.id}>{l.learning} (×{l.applied_count})</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function DraftCard({
  post, isActive, acting, onApprove, onRefine, onRedo, onMarkPosted,
}: {
  post: IrisPost
  isActive: boolean
  acting: boolean
  onApprove: () => void
  onRefine: () => void
  onRedo: () => void
  onMarkPosted: () => void
}) {
  const charCount = post.copy.length
  const typeLabel = post.post_type ? POST_TYPE_LABEL[post.post_type] ?? post.post_type : 'Auto'

  return (
    <div className={`${s.irisChatDraftCard} ${!isActive ? s.irisChatDraftCardSuperseded : ''}`}>
      <div className={s.irisChatDraftHead}>
        <span>LinkedIn draft</span>
        <span>{post.status}</span>
      </div>
      <div className={s.irisChatDraftCopy}>{post.copy}</div>
      <div className={s.irisChatDraftMeta}>
        <span>{charCount} chars</span>
        <span>·</span>
        <span>{typeLabel}</span>
      </div>

      {isActive && post.status === 'draft' && (
        <div className={s.irisChatDraftActions}>
          <button className={s.irisApproveBtn} onClick={onApprove} disabled={acting}>
            {acting ? 'Approving…' : '✓ Approve'}
          </button>
          <button className={s.irisRegenBtn} onClick={onRefine}>✏ Refine</button>
          <button className={s.irisRegenBtn} onClick={onRedo}>🔄 Redo</button>
        </div>
      )}
      {isActive && post.status === 'approved' && (
        <div className={s.irisChatDraftActions}>
          <button className={s.irisApproveBtn} onClick={onMarkPosted} disabled={acting}>
            {acting ? 'Marking…' : 'Posted ✓'}
          </button>
        </div>
      )}
      {post.status === 'posted' && (
        <div className={s.irisChatDraftActions}>
          <span className={s.irisReadyBadge}>Posted ✓</span>
        </div>
      )}
    </div>
  )
}
