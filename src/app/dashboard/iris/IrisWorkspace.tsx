'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import s from '../dashboard.module.css'

interface IrisPost {
  id: string
  slot: string
  pillar: number
  topic: string
  copy: string
  image_url: string | null
  format: string | null
  status: string
  impressions: number
  likes: number
  comments: number
  reposts: number
  created_at: number
  user_edited: number
  approved: number
  post_type: string | null
  engagement_signal: string | null
}

interface VoiceLearning {
  id: string
  learning: string
  example_before: string | null
  example_after: string | null
  applied_count: number
}

interface IrisData {
  posts: IrisPost[]
  draft: IrisPost | null
  preferences: { id: string; preference_type: string; value: string }[]
  approvedPosts: IrisPost[]
}

type PostType = 'sports_twist' | 'financial_truth' | 'expat_reality' | 'news_angle'

const PILLAR_LABEL: Record<number, string> = { 1: 'Markets', 2: 'Expat Finance', 3: 'Sports & Culture' }
const PILLAR_COLOR: Record<number, string> = {
  1: 'var(--accent)',
  2: 'var(--online)',
  3: 'var(--idle)',
}

const POST_TYPES: { id: PostType; emoji: string; label: string }[] = [
  { id: 'sports_twist', emoji: '🏌️', label: 'Sports Twist' },
  { id: 'financial_truth', emoji: '💰', label: 'Financial Truth' },
  { id: 'expat_reality', emoji: '✈️', label: 'Expat Reality' },
  { id: 'news_angle', emoji: '📰', label: 'News Angle' },
]
const POST_TYPE_LABEL: Record<string, string> = Object.fromEntries(POST_TYPES.map(t => [t.id, `${t.emoji} ${t.label}`]))

const IDEA_STORAGE_KEY = 'iris_idea_draft'

function relDate(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function firstLine(text: string): string {
  const line = text.split('\n').find(l => l.trim())
  return line ? (line.length > 90 ? line.slice(0, 90) + '…' : line) : '(empty)'
}

function hookLength(text: string): number {
  const lines = text.split('\n').filter(l => l.trim())
  return lines.slice(0, 3).join(' ').length
}

export default function IrisWorkspace() {
  const [data, setData] = useState<IrisData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Voice note + post type
  const [ideaText, setIdeaText] = useState('')
  const [postType, setPostType] = useState<PostType | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateMsg, setGenerateMsg] = useState<string | null>(null)
  const postTypeRef = useRef<HTMLDivElement | null>(null)

  // Draft editing
  const [draftCopy, setDraftCopy] = useState('')
  const originalCopyRef = useRef('')
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const [approveMsg, setApproveMsg] = useState<string | null>(null)
  const [editLearnings, setEditLearnings] = useState<string[] | null>(null)

  // Legacy refine (kept — Slack-style feedback redraft, unrelated to the edit-tracking loop)
  const [refineFeedback, setRefineFeedback] = useState('')
  const [refining, setRefining] = useState(false)
  const [refineMsg, setRefineMsg] = useState<string | null>(null)

  // Performance log state
  const [perfOpenId, setPerfOpenId] = useState<string | null>(null)
  const [perfValues, setPerfValues] = useState<Record<string, { impressions: number; likes: number; comments: number; reposts: number }>>({})
  const [perfSavingId, setPerfSavingId] = useState<string | null>(null)
  const [perfSaveMsg, setPerfSaveMsg] = useState<Record<string, string>>({})

  // Voice profile panel
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [learnings, setLearnings] = useState<VoiceLearning[]>([])
  const [resettingLearnings, setResettingLearnings] = useState(false)

  // Post history — engagement toggle / style reference
  const [engagementSavingId, setEngagementSavingId] = useState<string | null>(null)
  const [styleRefSavingId, setStyleRefSavingId] = useState<string | null>(null)
  const [styleRefMsg, setStyleRefMsg] = useState<Record<string, string>>({})

  const [markingPosted, setMarkingPosted] = useState(false)

  // Tracked by id, not re-derived by status=='draft' every load — approving a
  // post changes its status to 'approved', so a status-based lookup would lose
  // track of it mid-flow (the "Ready to post" state would never show). Sticks
  // to the same post through edit/approve/posted until a new one is generated.
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)

  const activeDraft = data ? (data.posts.find(p => p.id === activeDraftId) ?? data.draft ?? null) : null

  const load = useCallback((preferId?: string) => {
    setError(null)
    fetch('/api/dashboard/iris')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<IrisData>
      })
      .then(d => {
        setData(d)
        const init: Record<string, { impressions: number; likes: number; comments: number; reposts: number }> = {}
        for (const p of d.posts) {
          init[p.id] = { impressions: p.impressions ?? 0, likes: p.likes ?? 0, comments: p.comments ?? 0, reposts: p.reposts ?? 0 }
        }
        setPerfValues(init)

        setActiveDraftId(prevId => {
          const wantedId = preferId ?? prevId
          const active = wantedId ? d.posts.find(p => p.id === wantedId) : undefined
          const resolved = active ?? d.draft ?? undefined
          if (resolved) {
            setDraftCopy(resolved.copy)
            originalCopyRef.current = resolved.copy
            return resolved.id
          }
          setDraftCopy('')
          originalCopyRef.current = ''
          return null
        })
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const loadLearnings = useCallback(() => {
    fetch('/api/dashboard/iris/voice')
      .then(r => r.json() as Promise<{ learnings?: VoiceLearning[] }>)
      .then(d => setLearnings(d.learnings ?? []))
      .catch(() => setLearnings([]))
  }, [])

  useEffect(() => { load(); loadLearnings() }, [load, loadLearnings])

  // Voice note idea — persists to localStorage between sessions
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(IDEA_STORAGE_KEY)
      if (saved) setIdeaText(saved)
    } catch { /* ignore */ }
  }, [])

  function handleIdeaChange(value: string) {
    setIdeaText(value)
    try { window.localStorage.setItem(IDEA_STORAGE_KEY, value) } catch { /* ignore */ }
  }

  function togglePostType(id: PostType) {
    setPostType(prev => (prev === id ? null : id))
  }

  async function handleGenerate(forcedTopic?: string, forcedPostType?: PostType) {
    setGenerating(true)
    setGenerateMsg(null)
    setEditLearnings(null)
    try {
      const res = await fetch('/api/dashboard/iris/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ideaText: forcedTopic ?? (ideaText.trim() || undefined),
          postType: forcedPostType ?? postType ?? 'auto',
        }),
      })
      const result = await res.json() as { id?: string; skipped?: boolean; reason?: string; error?: string }
      if (!res.ok) throw new Error(result.error ?? 'Generation failed')
      if (result.skipped) {
        setGenerateMsg(`Skipped — ${result.reason}`)
      } else {
        setGenerateMsg(null)
        if (!forcedTopic) handleIdeaChange('')
        load(result.id)
      }
    } catch (e) {
      setGenerateMsg(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  function handleRegenerate() {
    if (!activeDraft) return
    void handleGenerate(activeDraft.topic, (activeDraft.post_type as PostType) ?? undefined)
  }

  function handleChangeType() {
    postTypeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const isDirty = draftCopy.trim() !== originalCopyRef.current.trim()

  async function saveEdits(): Promise<boolean> {
    if (!activeDraft || !isDirty) return true
    setSaving(true)
    try {
      const res = await fetch('/api/dashboard/iris/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: activeDraft.id,
          originalContent: originalCopyRef.current,
          editedContent: draftCopy,
        }),
      })
      const result = await res.json() as { ok?: boolean; learnings?: string[]; error?: string }
      if (!res.ok) throw new Error(result.error ?? 'Save failed')
      originalCopyRef.current = draftCopy
      setEditLearnings(result.learnings ?? [])
      loadLearnings()
      return true
    } catch (e) {
      setApproveMsg(e instanceof Error ? e.message : 'Save failed')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEditsOnly() {
    const ok = await saveEdits()
    if (ok) setApproveMsg(editLearnings && editLearnings.length > 0 ? `Edits saved — ${editLearnings.length} voice learning${editLearnings.length === 1 ? '' : 's'} extracted.` : 'Edits saved.')
  }

  async function handleApprove() {
    if (!activeDraft) return
    setApproving(true)
    setApproveMsg(null)
    try {
      if (isDirty) {
        const ok = await saveEdits()
        if (!ok) return
      }
      const res = await fetch('/api/dashboard/iris/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: activeDraft.id }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setApproveMsg('Approved — ready to post.')
      load()
      loadLearnings()
    } catch (e) {
      setApproveMsg(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setApproving(false)
    }
  }

  async function handleMarkPosted() {
    if (!activeDraft) return
    setMarkingPosted(true)
    try {
      await fetch('/api/dashboard/iris/posted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: activeDraft.id }),
      })
      load()
    } finally {
      setMarkingPosted(false)
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draftCopy)
      setApproveMsg('Copied ✓')
    } catch { /* ignore */ }
  }

  async function refineDraft() {
    if (!activeDraft || !refineFeedback.trim() || refining) return
    setRefining(true)
    setRefineMsg(null)
    try {
      const res = await fetch('/api/dashboard/iris/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: activeDraft.id, feedback: refineFeedback }),
      })
      const result = await res.json() as { copy?: string; error?: string }
      if (result.copy) {
        setDraftCopy(result.copy)
        originalCopyRef.current = result.copy
        setRefineMsg('Regenerated.')
        setRefineFeedback('')
      } else {
        setRefineMsg(result.error ?? 'Error regenerating')
      }
    } catch (e) {
      setRefineMsg(`Error: ${String(e)}`)
    } finally {
      setRefining(false)
    }
  }

  async function downloadImage(post: IrisPost) {
    if (!post.image_url) return
    const dateStr = new Date(post.created_at * 1000).toISOString().slice(0, 10)
    try {
      if (post.image_url.startsWith('data:')) {
        const mime = post.image_url.match(/^data:([^;]+);base64,/)?.[1]
        const ext = mime === 'image/svg+xml' ? 'svg' : 'png'
        const res = await fetch(post.image_url)
        const blob = await res.blob()
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = `iris-post-${dateStr}.${ext}`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      } else {
        const a = document.createElement('a')
        a.href = `/api/dashboard/iris/download-image?postId=${post.id}`
        a.download = `iris-post-${dateStr}.png`
        document.body.appendChild(a)
        a.click()
        a.remove()
      }
    } catch (e) {
      console.error('[iris] image download failed:', e)
    }
  }

  async function savePerformance(postId: string) {
    const vals = perfValues[postId]
    if (!vals) return
    setPerfSavingId(postId)
    setPerfSaveMsg(prev => ({ ...prev, [postId]: '' }))
    try {
      const res = await fetch('/api/dashboard/iris/performance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, ...vals }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setPerfSaveMsg(prev => ({ ...prev, [postId]: 'Saved.' }))
    } catch (e) {
      setPerfSaveMsg(prev => ({ ...prev, [postId]: `Error: ${String(e)}` }))
    } finally {
      setPerfSavingId(null)
    }
  }

  async function toggleEngagement(post: IrisPost) {
    setEngagementSavingId(post.id)
    try {
      const newSignal = post.engagement_signal === 'good' ? null : 'good'
      await fetch('/api/dashboard/iris/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, signal: newSignal }),
      })
      load()
    } finally {
      setEngagementSavingId(null)
    }
  }

  async function useAsStyleReference(postId: string) {
    setStyleRefSavingId(postId)
    setStyleRefMsg(prev => ({ ...prev, [postId]: '' }))
    try {
      const res = await fetch('/api/dashboard/iris/style-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
      const result = await res.json() as { learnings?: string[]; error?: string }
      if (!res.ok) throw new Error(result.error ?? 'Failed')
      setStyleRefMsg(prev => ({ ...prev, [postId]: `${(result.learnings ?? []).length} learning(s) saved.` }))
      loadLearnings()
    } catch (e) {
      setStyleRefMsg(prev => ({ ...prev, [postId]: e instanceof Error ? e.message : 'Failed' }))
    } finally {
      setStyleRefSavingId(null)
    }
  }

  async function resetLearnings() {
    setResettingLearnings(true)
    try {
      await fetch('/api/dashboard/iris/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      })
      loadLearnings()
    } finally {
      setResettingLearnings(false)
    }
  }

  if (error) return <div className={s.irisError}>{error}</div>
  if (!data) return <div className={s.irisLoading}>Loading…</div>

  const { posts, preferences, approvedPosts } = data
  const draft = activeDraft
  const history = posts.filter(p => p.status !== 'draft')

  const pillarCounts = [1, 2, 3].map(p => ({
    name: PILLAR_LABEL[p],
    value: history.filter(h => h.pillar === p).length,
    color: PILLAR_COLOR[p],
  })).filter(p => p.value > 0)

  const formatCounts = history.reduce<Record<string, number>>((acc, p) => {
    if (p.format) acc[p.format] = (acc[p.format] ?? 0) + 1
    return acc
  }, {})
  const topFormat = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const hasPerformanceData = history.some(p => (p.impressions ?? 0) > 0)

  const hookLen = hookLength(draftCopy)
  const totalLen = draftCopy.length
  const hookOk = hookLen >= 150 && hookLen <= 300
  const totalOk = totalLen >= 1000 && totalLen <= 1300

  return (
    <div className={s.irisWs}>

      {/* Voice note idea input */}
      <section className={s.irisDraftSection}>
        <span className={s.eyebrow}>Your idea (optional)</span>
        <textarea
          className={s.irisIdeaTextarea}
          placeholder={'Drop a rough idea here. Messy is fine.\nE.g. "something about how padel is so much cheaper in Spain and how that should make you think about where you retire"'}
          value={ideaText}
          onChange={e => handleIdeaChange(e.target.value)}
        />

        <div ref={postTypeRef} className={s.irisPostTypeRow}>
          {POST_TYPES.map(t => (
            <button
              key={t.id}
              className={`${s.irisPostTypePill} ${postType === t.id ? s.irisPostTypePillActive : ''}`}
              onClick={() => togglePostType(t.id)}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className={s.irisApproveBtn}
            onClick={() => void handleGenerate()}
            disabled={generating}
          >
            {generating ? 'Generating…' : draft ? 'Generate new draft' : 'Generate'}
          </button>
          {generateMsg && <span className={s.irisRegenMsg}>{generateMsg}</span>}
        </div>
      </section>

      {/* Current draft */}
      <section className={s.irisDraftSection}>
        <span className={s.eyebrow}>Current draft</span>
        {draft ? (
          <div className={s.irisDraftCard}>
            <div className={s.irisDraftMeta}>
              <span className={s.irisPillarTag} style={{ borderColor: PILLAR_COLOR[draft.pillar], color: PILLAR_COLOR[draft.pillar] }}>
                {PILLAR_LABEL[draft.pillar]}
              </span>
              {draft.post_type && <span className={s.irisDraftSlotTag}>{POST_TYPE_LABEL[draft.post_type] ?? draft.post_type}</span>}
              <span className={s.irisDraftSlotTag}>{draft.slot}</span>
              {draft.format && <span className={s.irisDraftFormatTag}>{draft.format}</span>}
            </div>

            <div className={s.irisDraftTopic}>{draft.topic}</div>

            {draft.image_url && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.image_url} alt="IRIS generated image" className={s.irisDraftImage} />
                <button className={s.irisImageDownloadBtn} onClick={() => void downloadImage(draft)}>Download Image</button>
              </>
            )}

            <textarea
              className={s.irisCopyEditable}
              value={draftCopy}
              onChange={e => setDraftCopy(e.target.value)}
              disabled={Boolean(draft.approved)}
            />

            <div className={s.irisCharCount}>
              <span style={{ color: hookOk ? 'var(--online)' : 'var(--idle)' }}>Hook: {hookLen} chars (optimal 150–300)</span>
              <span style={{ color: totalOk ? 'var(--online)' : 'var(--idle)' }}>Total: {totalLen} chars (optimal 1000–1300)</span>
            </div>

            {approveMsg && <p className={s.irisApproveMsg}>{approveMsg}</p>}
            {editLearnings && editLearnings.length > 0 && (
              <ul className={s.irisEditLearningsList}>
                {editLearnings.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            )}

            {!draft.approved ? (
              <div className={s.irisDraftActions}>
                <button className={s.irisApproveBtn} onClick={() => void handleApprove()} disabled={approving || saving}>
                  {approving ? 'Approving…' : '✓ Looks good — approve it'}
                </button>
                {isDirty && (
                  <button className={s.irisRegenBtn} onClick={() => void handleSaveEditsOnly()} disabled={saving}>
                    {saving ? 'Saving…' : 'Save edits'}
                  </button>
                )}
                <button className={s.irisRegenBtn} onClick={handleRegenerate} disabled={generating}>
                  {generating ? 'Regenerating…' : 'Regenerate'}
                </button>
                <button className={s.irisRegenBtn} onClick={handleChangeType}>Change type</button>
                <button className={s.irisRegenBtn} onClick={() => void copyDraft()}>Copy</button>
              </div>
            ) : (
              <div className={s.irisDraftActions}>
                <span className={s.irisReadyBadge}>Ready to post ✓</span>
                <button className={s.irisRegenBtn} onClick={() => void copyDraft()}>Copy</button>
                {draft.image_url && (
                  <button className={s.irisRegenBtn} onClick={() => void downloadImage(draft)}>Download Image</button>
                )}
                <button
                  className={s.irisApproveBtn}
                  onClick={() => void handleMarkPosted()}
                  disabled={markingPosted || draft.status === 'posted'}
                >
                  {draft.status === 'posted' ? 'Posted ✓' : markingPosted ? 'Marking…' : 'Posted ✓'}
                </button>
              </div>
            )}

            {/* Legacy Slack-style refine (feedback-based redraft) */}
            <div className={s.irisRefineArea}>
              <textarea
                className={s.irisRefineTextarea}
                placeholder="Feedback to refine… (e.g. make it shorter, more conversational, add a stat)"
                value={refineFeedback}
                onChange={e => setRefineFeedback(e.target.value)}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className={s.irisRegenBtn} onClick={() => void refineDraft()} disabled={refining || !refineFeedback.trim()}>
                  {refining ? 'Regenerating…' : 'Regenerate with feedback'}
                </button>
                {refineMsg && <span className={s.irisRegenMsg}>{refineMsg}</span>}
              </div>
            </div>
          </div>
        ) : (
          <div className={s.irisNoDraft}>
            No draft pending. Drop an idea above and generate, or wait for the 6am/12pm cron.
          </div>
        )}
      </section>

      {/* Voice profile panel */}
      <section className={s.irisDraftSection}>
        <button className={s.irisVoicePanelToggle} onClick={() => setVoiceOpen(v => !v)}>
          {voiceOpen ? '▾' : '▸'} Voice profile ({learnings.length} learning{learnings.length === 1 ? '' : 's'})
        </button>
        {voiceOpen && (
          <div className={s.irisVoicePanel}>
            {learnings.length === 0 ? (
              <p className={s.irisInsightEmpty}>Nothing learned yet — edit a draft or mark one as a style reference.</p>
            ) : (
              <>
                <p className={s.irisVoicePanelHead}>What IRIS has learned about your voice:</p>
                <ul className={s.irisVoiceLearningsList}>
                  {learnings.map(l => (
                    <li key={l.id}>{l.learning} (applied to {l.applied_count} post{l.applied_count === 1 ? '' : 's'})</li>
                  ))}
                </ul>
              </>
            )}
            <button className={s.irisRegenBtn} onClick={() => void resetLearnings()} disabled={resettingLearnings}>
              {resettingLearnings ? 'Resetting…' : 'Reset learnings'}
            </button>
          </div>
        )}
      </section>

      {/* Post history — last 7 approved */}
      <section className={s.irisHistorySection}>
        <span className={s.eyebrow}>Post history (last 7 approved)</span>
        {approvedPosts.length > 0 ? (
          <div className={s.irisHistoryList}>
            {approvedPosts.map(post => (
              <div key={post.id} className={s.irisHistoryCard}>
                <div className={s.irisHistoryCardTop}>
                  <span className={s.irisPillarTag} style={{ borderColor: PILLAR_COLOR[post.pillar], color: PILLAR_COLOR[post.pillar] }}>
                    {post.post_type ? POST_TYPE_LABEL[post.post_type] ?? post.post_type : PILLAR_LABEL[post.pillar]}
                  </span>
                  <span className={s.irisPostDate}>{relDate(post.created_at)}</span>
                </div>
                <div className={s.irisHistoryCardLine}>{firstLine(post.copy)}</div>
                <div className={s.irisHistoryCardActions}>
                  <button
                    className={`${s.irisEngagementToggle} ${post.engagement_signal === 'good' ? s.irisEngagementToggleActive : ''}`}
                    onClick={() => void toggleEngagement(post)}
                    disabled={engagementSavingId === post.id}
                  >
                    {post.engagement_signal === 'good' ? '★ Got good engagement' : '☆ Got good engagement'}
                  </button>
                  <button
                    className={s.irisRegenBtn}
                    onClick={() => void useAsStyleReference(post.id)}
                    disabled={styleRefSavingId === post.id}
                  >
                    {styleRefSavingId === post.id ? 'Saving…' : 'Use as style reference'}
                  </button>
                  {styleRefMsg[post.id] && <span className={s.irisRegenMsg}>{styleRefMsg[post.id]}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={s.irisNoDraft}>No approved posts yet.</div>
        )}
      </section>

      {/* Legacy time-windowed history with performance logging (unchanged) */}
      <section className={s.irisHistorySection}>
        <span className={s.eyebrow}>All activity (last 7 days)</span>
        {history.length > 0 ? (
          <div className={s.irisHistoryList}>
            {history.map(post => {
              const perfOpen = perfOpenId === post.id
              const pv = perfValues[post.id] ?? { impressions: 0, likes: 0, comments: 0, reposts: 0 }
              const saveMsg = perfSaveMsg[post.id]
              return (
                <div key={post.id} className={s.irisHistoryRow} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className={s.irisPillarBar} style={{ background: PILLAR_COLOR[post.pillar] }} title={PILLAR_LABEL[post.pillar]} />
                    <div className={s.irisHistoryBody}>
                      <div className={s.irisHistoryTopic}>{post.topic}</div>
                      <div className={s.irisHistoryMeta}>
                        <span>{relDate(post.created_at)}</span>
                        <span>{post.slot}</span>
                        <span className={`${s.irisStatusChip} ${post.status === 'approved' ? s.irisStatusApproved : ''}`}>{post.status}</span>
                      </div>
                    </div>
                    <button className={s.irisPerfLogToggle} onClick={() => setPerfOpenId(perfOpen ? null : post.id)}>
                      {perfOpen ? '▲ Hide stats' : '▼ Log stats'}
                    </button>
                  </div>

                  {perfOpen && (
                    <div className={s.irisPerfLogArea}>
                      <div className={s.irisPerfInputGrid}>
                        {(['impressions', 'likes', 'comments', 'reposts'] as const).map(field => (
                          <div key={field} className={s.irisPerfInputWrap}>
                            <span className={s.irisPerfInputLabel}>{field.charAt(0).toUpperCase() + field.slice(1)}</span>
                            <input
                              type="number"
                              min={0}
                              className={s.irisPerfInput}
                              value={pv[field]}
                              onChange={e => setPerfValues(prev => ({ ...prev, [post.id]: { ...pv, [field]: Math.max(0, parseInt(e.target.value, 10) || 0) } }))}
                            />
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button className={s.irisPerfSaveBtn} onClick={() => void savePerformance(post.id)} disabled={perfSavingId === post.id}>
                          {perfSavingId === post.id ? 'Saving…' : 'Save'}
                        </button>
                        {saveMsg && <span className={s.irisPerfSaveMsg}>{saveMsg}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className={s.irisNoDraft}>No approved posts in the last 7 days.</div>
        )}
      </section>

      {/* What's Working */}
      {history.length >= 2 && (
        <section className={s.irisHistorySection}>
          <span className={s.eyebrow}>What&apos;s Working</span>
          <div className={s.irisWhatWorking}>
            {pillarCounts.length > 0 && (
              <div className={s.irisPieChartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pillarCounts}
                      cx="50%"
                      cy="50%"
                      outerRadius={55}
                      dataKey="value"
                      label={({ name, percent }) => `${name ?? ''} ${Math.round(((percent as number) ?? 0) * 100)}%`}
                      labelLine={false}
                    >
                      {pillarCounts.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {topFormat && (
              <div className={s.irisBestFormat}>
                <span className={s.fpSectionLabel}>Top format</span>
                <div className={s.irisBestFormatVal}>{topFormat}</div>
                <div className={s.irisBestFormatSub}>{formatCounts[topFormat]} post{formatCounts[topFormat] > 1 ? 's' : ''} this week</div>
              </div>
            )}

            {hasPerformanceData ? (
              <p className={s.irisInsightText}>Performance data logged — keep tracking to surface content insights.</p>
            ) : (
              <p className={s.irisInsightEmpty}>Log post stats above to unlock engagement insights.</p>
            )}
          </div>
        </section>
      )}

      {/* Legacy voice preferences (Slack-derived) */}
      {preferences.length > 0 && (
        <section className={s.irisPrefsSection}>
          <span className={s.eyebrow}>Voice memory — Slack feedback ({preferences.length})</span>
          <div className={s.irisPrefs}>
            {preferences.slice(0, 8).map(p => (
              <div key={p.id} className={s.irisPrefRow}>
                <span className={s.irisPrefType}>{p.preference_type}</span>
                <span className={s.irisPrefValue}>{p.value}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
