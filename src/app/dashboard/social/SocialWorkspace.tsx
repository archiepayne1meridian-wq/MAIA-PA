'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import s from '../dashboard.module.css'

type MainTab = 'repurpose' | 'history'
type SourceType = 'linkedin' | 'idea' | 'news'
type PostStatus = 'draft' | 'approved' | 'posted'

interface SocialSlide {
  slideNumber: number
  type: 'hook' | 'content'
  text: string
  imagePrompt: string
}

interface SocialPost {
  id: string
  source_type: SourceType
  hook_text: string
  slides: SocialSlide[]
  caption: string
  hashtags: string
  status: PostStatus
  created_at: string
  images?: (string | null)[]
  thumbnailUrl?: string | null
}

interface SocialContext {
  todaysAngle: { headline: string; summary: string } | null
  postStreakDays: number
  contentMix: Record<SourceType, number>
  styleReminder: string[]
}

const SOURCE_PILLS: { id: SourceType; label: string }[] = [
  { id: 'idea', label: 'Idea' },
  { id: 'linkedin', label: 'LinkedIn repost' },
  { id: 'news', label: 'News angle' },
]

const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 90

export default function SocialWorkspace() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<MainTab>('repurpose')
  const [toast, setToast] = useState<string | null>(null)

  function showToast(text: string) {
    setToast(text)
    setTimeout(() => setToast(null), 2800)
  }

  // Handoff from LinkedIn's "Repurpose for Instagram/Facebook →" button —
  // pre-fills the input, doesn't auto-submit (Archie still reviews/sends).
  const [sourceType, setSourceType] = useState<SourceType>('idea')
  const [input, setInput] = useState('')
  const appliedRepurpose = useRef(false)

  useEffect(() => {
    if (appliedRepurpose.current) return
    const repurpose = searchParams.get('repurpose')
    if (repurpose) {
      setInput(repurpose)
      setSourceType('linkedin')
      appliedRepurpose.current = true
    }
  }, [searchParams])

  function useAngleSuggestion(headline: string, summary: string) {
    setInput(`${headline}\n\n${summary}`)
    setSourceType('news')
    setTab('repurpose')
  }

  return (
    <div className={s.fullPage}>
      <div className={s.fullPageTopbar}>
        <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
        <span className={s.fpPageTitle}>SOCIAL</span>
        <span className={s.fpPageSubtitle}>Instagram &amp; Facebook</span>
      </div>

      <div className={s.socialMainTabs}>
        <button className={`${s.socialMainTab} ${tab === 'repurpose' ? s.socialMainTabActive : ''}`} onClick={() => setTab('repurpose')}>
          Repurpose
        </button>
        <button className={`${s.socialMainTab} ${tab === 'history' ? s.socialMainTabActive : ''}`} onClick={() => setTab('history')}>
          History
        </button>
      </div>

      <div className={s.fullPageCols}>
        {tab === 'repurpose' ? (
          <RepurposeTab
            sourceType={sourceType} setSourceType={setSourceType}
            input={input} setInput={setInput}
            showToast={showToast}
          />
        ) : (
          <HistoryTab showToast={showToast} />
        )}
        <SocialContextPanel onUseAngle={useAngleSuggestion} />
      </div>

      {toast && <div className={s.socialToast}>{toast}</div>}
    </div>
  )
}

// ── Repurpose tab ────────────────────────────────────────────────────────────

function RepurposeTab({ sourceType, setSourceType, input, setInput, showToast }: {
  sourceType: SourceType
  setSourceType: (t: SourceType) => void
  input: string
  setInput: (v: string) => void
  showToast: (t: string) => void
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [post, setPost] = useState<SocialPost | null>(null)
  const [totalSlides, setTotalSlides] = useState(0)
  const [imagesReady, setImagesReady] = useState(0)
  const [redoingSlide, setRedoingSlide] = useState<number | null>(null)
  const [cacheBust, setCacheBust] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }
  useEffect(() => () => stopPolling(), [])

  function pollPost(postId: string) {
    let attempts = 0
    stopPolling()
    pollRef.current = setInterval(() => {
      attempts++
      fetch(`/api/dashboard/social/posts/${postId}`)
        .then(r => r.json() as Promise<{ post: SocialPost; totalSlides: number; imagesReady: number }>)
        .then(d => {
          setPost(d.post)
          setTotalSlides(d.totalSlides)
          setImagesReady(d.imagesReady)
          setCacheBust(c => c + 1)
          if (d.imagesReady >= d.totalSlides || attempts >= MAX_POLLS) stopPolling()
        })
        .catch(() => { if (attempts >= MAX_POLLS) stopPolling() })
    }, POLL_INTERVAL_MS)
  }

  async function generate() {
    if (!input.trim() || generating) return
    setGenerating(true)
    setError(null)
    setPost(null)
    try {
      const res = await fetch('/api/dashboard/social/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType, sourceContent: input.trim() }),
      })
      const data = await res.json() as { id?: string; hook?: string; slides?: SocialSlide[]; caption?: string; hashtags?: string; totalSlides?: number; error?: string }
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Generation failed')

      setPost({
        id: data.id, source_type: sourceType, hook_text: data.hook ?? '', slides: data.slides ?? [],
        caption: data.caption ?? '', hashtags: data.hashtags ?? '', status: 'draft', created_at: new Date().toISOString(),
        images: (data.slides ?? []).map(() => null),
      })
      setTotalSlides(data.totalSlides ?? data.slides?.length ?? 0)
      setImagesReady(0)
      pollPost(data.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function redoSlide(slideNumber: number) {
    if (!post || redoingSlide !== null) return
    setRedoingSlide(slideNumber)
    try {
      const res = await fetch('/api/dashboard/social/generate/slide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, slideNumber }),
      })
      const data = await res.json() as { slide?: SocialSlide; error?: string }
      if (!res.ok || !data.slide) throw new Error(data.error ?? 'Redo failed')
      setPost(prev => prev ? { ...prev, slides: prev.slides.map(sl => (sl.slideNumber === slideNumber ? data.slide! : sl)) } : prev)
      setCacheBust(c => c + 1)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Redo failed')
    } finally {
      setRedoingSlide(null)
    }
  }

  async function copyText(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); showToast(`${label} copied`) } catch { /* ignore */ }
  }

  async function saveToHistory() {
    if (!post) return
    await fetch(`/api/dashboard/social/posts/${post.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }),
    })
    setPost(prev => prev ? { ...prev, status: 'approved' } : prev)
    showToast('Saved to history')
  }

  return (
    <div className={s.fpCol} style={{ flex: 1 }}>
      <div className={s.fpColHead}>
        <div className={s.fpColTitle}>Repurpose</div>
        <div className={s.fpColSub}>Paste a LinkedIn post, a news story, or just a raw idea.</div>
      </div>

      <div className={s.fpSection}>
        <div className={s.socialSourceRow}>
          {SOURCE_PILLS.map(p => (
            <button key={p.id} className={`${s.socialSourcePill} ${sourceType === p.id ? s.socialSourcePillActive : ''}`} onClick={() => setSourceType(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className={s.socialInputRow} style={{ marginTop: 10 }}>
          <textarea
            className={s.socialTextarea}
            placeholder="Paste a LinkedIn post, a news angle, or type a raw idea…"
            value={input}
            onChange={e => setInput(e.target.value)}
          />
          <button className={s.socialGenerateBtn} onClick={() => void generate()} disabled={generating || !input.trim()}>
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {error && <p style={{ color: 'var(--alert)', fontSize: 12 }}>{error}</p>}
      </div>

      {post && (
        <div className={s.socialResultCard}>
          {imagesReady < totalSlides && (
            <div className={s.socialProgress}>
              <span className={s.socialProgressSpinner} />
              Generating slide {imagesReady + 1} of {totalSlides}…
            </div>
          )}

          <div className={s.socialCarousel}>
            {post.slides.map((slide, i) => {
              const imgUrl = post.images?.[i]
              return (
                <div key={slide.slideNumber} className={s.socialSlideCard}>
                  <div className={s.socialSlideImgWrap}>
                    {imgUrl ? (
                      <img src={`${imgUrl}?v=${cacheBust}`} alt={slide.text} className={s.socialSlideImg} />
                    ) : (
                      <span className={s.socialSlidePending}>Generating…</span>
                    )}
                  </div>
                  <span className={s.socialSlideLabel}>Slide {slide.slideNumber} · {slide.type}</span>
                  <button className={s.socialRedoBtn} onClick={() => void redoSlide(slide.slideNumber)} disabled={redoingSlide !== null}>
                    {redoingSlide === slide.slideNumber ? 'Redoing…' : `Redo slide ${slide.slideNumber}`}
                  </button>
                </div>
              )
            })}
          </div>

          <div className={s.socialCaptionBlock} onClick={() => void copyText(post.caption, 'Caption')} title="Click to copy">
            {post.caption}
          </div>
          <div className={s.socialHashtagsBlock} onClick={() => void copyText(post.hashtags, 'Hashtags')} title="Click to copy">
            {post.hashtags}
          </div>

          <div className={s.socialResultActions}>
            <a className={s.socialResultBtn} href={`/api/dashboard/social/posts/${post.id}/download`} download={`post_${post.created_at.slice(0, 10)}.zip`}>
              ⬇ Download all
            </a>
            {post.status === 'draft' ? (
              <button className={`${s.socialResultBtn} ${s.socialResultBtnPrimary}`} onClick={() => void saveToHistory()}>
                Save to history
              </button>
            ) : (
              <span className={s.socialStatusBadge} style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>Saved ✓</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── History tab ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<PostStatus, string> = { draft: 'Draft', approved: 'Approved', posted: 'Posted' }
const STATUS_CLASS: Record<PostStatus, string> = { draft: 'socialStatusDraft', approved: 'socialStatusApproved', posted: 'socialStatusPosted' }

function HistoryTab({ showToast }: { showToast: (t: string) => void }) {
  const [posts, setPosts] = useState<SocialPost[] | null>(null)

  const load = useCallback(() => {
    fetch('/api/dashboard/social/posts')
      .then(r => r.json() as Promise<{ posts: SocialPost[] }>)
      .then(d => setPosts(d.posts))
      .catch(() => setPosts([]))
  }, [])

  useEffect(() => { load() }, [load])

  async function markPosted(id: string) {
    await fetch(`/api/dashboard/social/posts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'posted' }),
    })
    showToast('Marked as posted')
    load()
  }

  return (
    <div className={s.fpCol} style={{ flex: 1 }}>
      <div className={s.fpColHead}>
        <div className={s.fpColTitle}>History</div>
      </div>

      {posts === null ? (
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</p>
      ) : posts.length === 0 ? (
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No posts yet — generate one from the Repurpose tab.</p>
      ) : (
        <div className={s.socialHistoryGrid}>
          {posts.map(p => (
            <div key={p.id} className={s.socialHistoryCard}>
              <div className={s.socialHistoryThumbWrap}>
                {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" className={s.socialHistoryThumb} /> : <span className={s.socialSlidePending}>No image</span>}
              </div>
              <div className={s.socialHistoryBody}>
                <div className={s.socialHistoryHook}>{p.hook_text}</div>
                <div className={s.socialHistoryMeta}>
                  <span>{p.created_at.slice(0, 10)}</span>
                  <span className={`${s.socialStatusBadge} ${s[STATUS_CLASS[p.status]]}`}>{STATUS_LABEL[p.status]}</span>
                </div>
              </div>
              <div className={s.socialHistoryActions}>
                <a className={s.socialRedoBtn} href={`/api/dashboard/social/posts/${p.id}/download`} download={`post_${p.created_at.slice(0, 10)}.zip`}>Download</a>
                {p.status !== 'posted' && (
                  <button className={s.socialRedoBtn} onClick={() => void markPosted(p.id)}>Mark as posted</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Right context panel ──────────────────────────────────────────────────────

function SocialContextPanel({ onUseAngle }: { onUseAngle: (headline: string, summary: string) => void }) {
  const [ctx, setCtx] = useState<SocialContext | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/social/context')
      .then(r => r.json() as Promise<SocialContext>)
      .then(setCtx)
      .catch(() => setCtx(null))
  }, [])

  const mixTotal = ctx ? ctx.contentMix.linkedin + ctx.contentMix.idea + ctx.contentMix.news : 0

  return (
    <div className={s.fpCol} style={{ width: 300, flexShrink: 0 }}>
      <div className={s.fpColHead}>
        <div className={s.fpColTitle}>Context</div>
      </div>

      {!ctx ? (
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</p>
      ) : (
        <>
          <div className={s.fpSection}>
            <span className={s.fpSectionLabel}>Today&apos;s angle</span>
            {ctx.todaysAngle ? (
              <div className={s.socialAngleCard}>
                <span className={s.socialAngleHeadline}>{ctx.todaysAngle.headline}</span>
                <button className={s.socialAngleBtn} onClick={() => onUseAngle(ctx.todaysAngle!.headline, ctx.todaysAngle!.summary)}>
                  Turn this into a post?
                </button>
              </div>
            ) : (
              <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>No CASSANDRA story yet today.</p>
            )}
          </div>

          <div className={s.fpSection}>
            <span className={s.fpSectionLabel}>Post streak</span>
            <div className={s.socialMixRow}>
              <span>{ctx.postStreakDays} day{ctx.postStreakDays === 1 ? '' : 's'}</span>
            </div>
          </div>

          <div className={s.fpSection}>
            <span className={s.fpSectionLabel}>Content mix (30d)</span>
            <div className={s.socialMixRow}>
              <span>News: {mixTotal > 0 ? Math.round((ctx.contentMix.news / mixTotal) * 100) : 0}%</span>
              <span>Idea: {mixTotal > 0 ? Math.round((ctx.contentMix.idea / mixTotal) * 100) : 0}%</span>
              <span>Repurposed LinkedIn: {mixTotal > 0 ? Math.round((ctx.contentMix.linkedin / mixTotal) * 100) : 0}%</span>
            </div>
          </div>

          <div className={s.fpSection}>
            <span className={s.fpSectionLabel}>Style reminder</span>
            <div className={s.socialStyleReminder}>
              {ctx.styleReminder.map((line, i) => <span key={i}>{line}</span>)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
