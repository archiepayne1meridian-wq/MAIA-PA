'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import s from '../dashboard.module.css'
import FileDropZone from '../components/FileDropZone'

// ── Types ─────────────────────────────────────────────────────────────────────

type MainTab = 'r01' | 'product'
const TAB_STORAGE_KEY = 'athena_active_tab'

interface AthenaCard {
  id: string
  tab: MainTab
  front: string
  back: string
  note: string | null
  product_id: string | null
  interval: number
  ease_factor: number
  next_review: string
  total_reviews: number
  correct_streak: number
}

interface MCQ { question: string; options: [string, string, string, string]; correct: 0 | 1 | 2 | 3; explanation: string }

interface AthenaProduct {
  id: string
  name: string
  summary: string
  card_count: number
  mcq_count: number
  salesAngles: string[]
  mcqs: MCQ[]
  podcastStreamUrl: string | null
  avgEaseFactor: number | null
  healthy: boolean | null
}

interface AthenaContext {
  r01: { totalCards: number; dueToday: number; masteredCards: number; masteredPct: number }
  products: { id: string; name: string; avgEaseFactor: number | null; healthy: boolean | null }[]
  today: { cardsReviewed: number; accuracyPct: number; streakDays: number }
}

// ── Shared: countdown to local midnight (client clock only — no timezone math) ─

function useCountdownToMidnight(active: boolean): string {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!active) { setLabel(''); return }
    function update() {
      const now = new Date()
      const next = new Date(now)
      next.setHours(24, 0, 0, 0)
      const ms = next.getTime() - now.getTime()
      const h = Math.floor(ms / 3600000)
      const m = Math.floor((ms % 3600000) / 60000)
      setLabel(`${h}h ${m}m`)
    }
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  }, [active])
  return label
}

// ── Root component ───────────────────────────────────────────────────────────

export default function AthenaWorkspace() {
  const [tab, setTab] = useState<MainTab>('r01')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [contextRefreshKey, setContextRefreshKey] = useState(0)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY)
      if (saved === 'r01' || saved === 'product') setTab(saved)
    } catch { /* ignore — private browsing */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(TAB_STORAGE_KEY, tab) } catch { /* ignore */ }
  }, [tab])

  function showToast(text: string) {
    setToast(text)
    setTimeout(() => setToast(null), 3200)
  }

  function refreshContext() {
    setContextRefreshKey(k => k + 1)
  }

  function jumpToProduct(id: string) {
    setTab('product')
    setSelectedProductId(id)
  }

  return (
    <div className={s.fullPage}>
      <div className={s.fullPageTopbar}>
        <a href="/dashboard" className={s.fpBack}>← Dashboard</a>
        <span className={s.fpPageTitle}>ATHENA</span>
        <span className={s.fpPageSubtitle}>Qualification &amp; Product Knowledge</span>
      </div>

      <div className={s.athenaV2MainTabs}>
        <button className={`${s.athenaV2MainTab} ${tab === 'r01' ? s.athenaV2MainTabActive : ''}`} onClick={() => setTab('r01')}>
          Qualification
        </button>
        <button className={`${s.athenaV2MainTab} ${tab === 'product' ? s.athenaV2MainTabActive : ''}`} onClick={() => setTab('product')}>
          Product Knowledge
        </button>
      </div>

      <div className={s.fullPageCols}>
        {tab === 'r01' ? (
          <R01Tab showToast={showToast} onReview={refreshContext} />
        ) : (
          <ProductTab
            showToast={showToast}
            onChange={refreshContext}
            selectedProductId={selectedProductId}
            setSelectedProductId={setSelectedProductId}
          />
        )}
        <AthenaContextPanel refreshKey={contextRefreshKey} onJumpToProduct={jumpToProduct} />
      </div>

      {toast && <div className={s.athenaV2Toast}>{toast}</div>}
    </div>
  )
}

// ── R01 Qualification tab ────────────────────────────────────────────────────

function R01Tab({ showToast, onReview }: { showToast: (t: string) => void; onReview: () => void }) {
  const [queue, setQueue] = useState<AthenaCard[] | null>(null)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [rating, setRating] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)

  const load = useCallback(() => {
    setQueue(null)
    fetch('/api/dashboard/athena/cards?tab=r01&due=true')
      .then(r => r.json() as Promise<{ cards: AthenaCard[]; seeded: number }>)
      .then(d => {
        if (d.seeded > 0) showToast(`ATHENA seeded ${d.seeded} R01 cards — let's go`)
        setQueue(d.cards)
        setIndex(0)
        setFlipped(false)
      })
      .catch(() => setQueue([]))
  }, [showToast])

  useEffect(() => {
    load()
    fetch('/api/dashboard/athena/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab: 'r01' }),
    })
      .then(r => r.json() as Promise<{ id: string }>)
      .then(d => setSessionId(d.id))
      .catch(() => { /* session tracking is best-effort — a card review still works without it */ })
  }, [load])

  const card = queue && index < queue.length ? queue[index] : null

  function flip() {
    if (card) setFlipped(f => !f)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' && card) { e.preventDefault(); flip() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [card, flipped])

  async function rate(quality: 1 | 3 | 5) {
    if (!card || rating) return
    setRating(true)
    try {
      await fetch(`/api/dashboard/athena/cards/${card.id}/review`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quality }),
      })
      const newReviewed = reviewedCount + 1
      const newCorrect = correctCount + (quality >= 3 ? 1 : 0)
      setReviewedCount(newReviewed)
      setCorrectCount(newCorrect)
      if (sessionId) {
        void fetch(`/api/dashboard/athena/sessions/${sessionId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardsReviewed: newReviewed, correctCount: newCorrect }),
        })
      }
      onReview()
      setFlipped(false)
      setIndex(i => i + 1)
    } finally {
      setRating(false)
    }
  }

  const dueRemaining = queue ? Math.max(0, queue.length - index) : null

  return (
    <div className={s.fpCol} style={{ flex: 1 }}>
      <div className={s.fpColHead}>
        <div className={s.fpColTitle}>Qualification</div>
        {dueRemaining !== null && <div className={s.fpColSub}>{dueRemaining} card{dueRemaining === 1 ? '' : 's'} due today</div>}
      </div>

      {queue === null ? (
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</p>
      ) : card ? (
        <div className={s.athenaR01Area}>
          <div className={s.athenaFlipOuter} onClick={flip}>
            <div className={`${s.athenaFlipInner} ${flipped ? s.athenaFlipInnerFlipped : ''}`}>
              <div className={s.athenaFlipFace}>
                <p className={s.athenaFlipQuestion}>{card.front}</p>
                <span className={s.athenaFlipHint}>Click or press space to flip</span>
              </div>
              <div className={`${s.athenaFlipFace} ${s.athenaFlipFaceBack}`}>
                <p className={s.athenaFlipAnswer}>{card.back}</p>
                {card.note && <p className={s.athenaFlipNote}>💡 {card.note}</p>}
              </div>
            </div>
          </div>

          {flipped && (
            <div className={s.athenaRateRow}>
              <button className={`${s.athenaRateBtn} ${s.athenaRateBtnMiss}`} onClick={() => void rate(1)} disabled={rating}>Missed it</button>
              <button className={`${s.athenaRateBtn} ${s.athenaRateBtnGot}`} onClick={() => void rate(3)} disabled={rating}>Got it</button>
              <button className={`${s.athenaRateBtn} ${s.athenaRateBtnNailed}`} onClick={() => void rate(5)} disabled={rating}>Nailed it</button>
            </div>
          )}
        </div>
      ) : (
        <div className={s.athenaDoneState}>
          <p className={s.athenaDoneTitle}>You&apos;re done for today.</p>
          <p className={s.athenaDoneSub}>
            {reviewedCount} card{reviewedCount === 1 ? '' : 's'} reviewed this session
            {reviewedCount > 0 ? ` · ${Math.round((correctCount / reviewedCount) * 100)}% correct` : ''}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Product Knowledge tab ────────────────────────────────────────────────────

function ProductTab({ showToast, onChange, selectedProductId, setSelectedProductId }: {
  showToast: (t: string) => void
  onChange: () => void
  selectedProductId: string | null
  setSelectedProductId: (id: string | null) => void
}) {
  const [products, setProducts] = useState<AthenaProduct[] | null>(null)
  const [detail, setDetail] = useState<{ product: AthenaProduct; cards: AthenaCard[] } | null>(null)
  const [showDropZone, setShowDropZone] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const loadProducts = useCallback(() => {
    fetch('/api/dashboard/athena/products')
      .then(r => r.json() as Promise<{ products: AthenaProduct[] }>)
      .then(d => setProducts(d.products))
      .catch(() => setProducts([]))
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  useEffect(() => {
    if (!selectedProductId) { setDetail(null); return }
    fetch(`/api/dashboard/athena/products/${selectedProductId}`)
      .then(r => r.json() as Promise<{ product: AthenaProduct; cards: AthenaCard[] }>)
      .then(setDetail)
      .catch(() => setDetail(null))
  }, [selectedProductId])

  async function handleDrop(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/dashboard/athena/products/upload', { method: 'POST', body: formData })
      const data = await res.json() as { product?: AthenaProduct; cardCount?: number; mcqCount?: number; podcastReady?: boolean; error?: string }
      if (!res.ok || !data.product) throw new Error(data.error ?? 'Upload failed')

      showToast(`${data.product.name} added — ${data.cardCount} cards, ${data.mcqCount} MCQs, ${data.podcastReady ? 'podcast ready' : 'podcast unavailable'}`)
      setShowDropZone(false)
      loadProducts()
      setSelectedProductId(data.product.id)
      onChange()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteProduct(id: string) {
    await fetch(`/api/dashboard/athena/products/${id}`, { method: 'DELETE' })
    if (selectedProductId === id) setSelectedProductId(null)
    loadProducts()
    onChange()
  }

  return (
    <>
      <div className={s.fpCol} style={{ width: 280, flexShrink: 0 }}>
        <div className={s.fpColHead}>
          <div className={s.fpColTitle}>Products</div>
        </div>

        <button className={s.athenaAddProductBtn} onClick={() => setShowDropZone(v => !v)}>
          {showDropZone ? 'Cancel' : '+ Add Product'}
        </button>

        {showDropZone && (
          <FileDropZone
            accept={['pdf']}
            onFile={file => void handleDrop(file)}
            onRejected={() => showToast('Only PDF files are accepted')}
            disabled={uploading}
            icon="📄"
            label={uploading ? 'Generating…' : 'Drop product PDF here or click'}
            hint=".pdf only"
          />
        )}
        {uploading && <p className={s.athenaGeneratingPulse}>Generating podcast…</p>}
        {uploadError && <p style={{ color: 'var(--alert)', fontSize: 11 }}>{uploadError}</p>}

        <div className={s.athenaProductList}>
          {(products ?? []).map(p => (
            <button
              key={p.id}
              className={`${s.athenaProductCard} ${selectedProductId === p.id ? s.athenaProductCardActive : ''}`}
              onClick={() => setSelectedProductId(p.id)}
            >
              <span className={s.athenaProductName}>{p.name}</span>
              <span className={s.athenaProductMeta}>{p.card_count} cards{p.podcastStreamUrl ? ' · 🎧' : ''}</span>
            </button>
          ))}
          {products !== null && products.length === 0 && (
            <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>No products yet.</p>
          )}
        </div>
      </div>

      <div className={s.fpCol} style={{ flex: 1 }}>
        {!detail ? (
          <div className={s.athenaEmptyState}>Drop a product PDF to get started</div>
        ) : (
          <ProductDetail detail={detail} onDelete={() => void handleDeleteProduct(detail.product.id)} />
        )}
      </div>
    </>
  )
}

function ProductDetail({ detail, onDelete }: { detail: { product: AthenaProduct; cards: AthenaCard[] }; onDelete: () => void }) {
  const { product } = detail
  return (
    <div className={s.athenaProductDetail}>
      <div className={s.fpColHead} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div className={s.fpColTitle}>{product.name}</div>
        <button className={s.athenaSpeedBtn} onClick={onDelete}>Delete</button>
      </div>

      <p className={s.athenaProductSummary}>{product.summary}</p>

      <div className={s.fpSection}>
        <span className={s.fpSectionLabel}>Sales angles</span>
        <ul className={s.athenaAnglesList}>
          {(product.salesAngles ?? []).map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </div>

      {product.mcqs && product.mcqs.length > 0 && (
        <div className={s.fpSection}>
          <span className={s.fpSectionLabel}>Test yourself</span>
          <MCQSection mcqs={product.mcqs} />
        </div>
      )}

      {product.podcastStreamUrl && (
        <div className={s.fpSection}>
          <span className={s.fpSectionLabel}>Podcast</span>
          <PodcastPlayer src={product.podcastStreamUrl} />
        </div>
      )}
    </div>
  )
}

function MCQSection({ mcqs }: { mcqs: MCQ[] }) {
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)

  const q = mcqs[index]
  const done = index >= mcqs.length

  function submit() {
    if (selected === null || !q) return
    setSubmitted(true)
    if (selected === q.correct) setCorrectCount(c => c + 1)
  }

  function next() {
    setIndex(i => i + 1)
    setSelected(null)
    setSubmitted(false)
  }

  if (done) {
    return <p className={s.athenaDoneSub}>Quiz complete — {correctCount}/{mcqs.length} correct.</p>
  }

  return (
    <div className={s.athenaMcqSection}>
      <div className={`${s.athenaMcqCard} ${submitted ? (selected === q!.correct ? s.athenaMcqFlashCorrect : s.athenaMcqFlashWrong) : ''}`}>
        <p className={s.athenaMcqQuestion}>{q!.question}</p>
        <div className={s.athenaMcqOptions}>
          {q!.options.map((opt, i) => (
            <label
              key={i}
              className={`${s.athenaMcqOption} ${submitted && i === q!.correct ? s.athenaMcqOptionCorrect : ''} ${submitted && i === selected && i !== q!.correct ? s.athenaMcqOptionWrong : ''}`}
            >
              <input type="radio" name={`mcq-${index}`} checked={selected === i} disabled={submitted} onChange={() => setSelected(i)} />
              {opt}
            </label>
          ))}
        </div>
        {!submitted ? (
          <button className={s.athenaMcqSubmitBtn} onClick={submit} disabled={selected === null}>Submit</button>
        ) : (
          <>
            <p className={s.athenaMcqExplanation}>{q!.explanation}</p>
            <button className={s.athenaMcqSubmitBtn} onClick={next}>Next →</button>
          </>
        )}
      </div>
      <div className={s.athenaMcqProgressBar}>{correctCount}/{mcqs.length} correct</div>
    </div>
  )
}

function PodcastPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    function onTime() { setCurrentTime(audio!.currentTime) }
    function onLoaded() { setDuration(audio!.duration) }
    function onEnded() { setPlaying(false) }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('ended', onEnded)
    }
  }, [src])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause(); else void audio.play()
    setPlaying(!playing)
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    const t = Number(e.target.value)
    if (audio) audio.currentTime = t
    setCurrentTime(t)
  }

  function changeSpeed(v: number) {
    setSpeed(v)
    if (audioRef.current) audioRef.current.playbackRate = v
  }

  function fmt(t: number): string {
    if (!Number.isFinite(t)) return '0:00'
    const m = Math.floor(t / 60)
    const sec = Math.floor(t % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  return (
    <div className={s.athenaPodcastPlayer}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button className={s.athenaPlayBtn} onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '⏸' : '▶'}</button>
      <input type="range" className={s.athenaSeekBar} min={0} max={duration || 0} value={currentTime} onChange={seek} />
      <span className={s.athenaTimeLabel}>{fmt(currentTime)} / {fmt(duration)}</span>
      <div className={s.athenaSpeedRow}>
        {[0.75, 1, 1.25, 1.5].map(v => (
          <button key={v} className={`${s.athenaSpeedBtn} ${speed === v ? s.athenaSpeedBtnActive : ''}`} onClick={() => changeSpeed(v)}>{v}×</button>
        ))}
      </div>
    </div>
  )
}

// ── Right context panel ──────────────────────────────────────────────────────

function AthenaContextPanel({ refreshKey, onJumpToProduct }: { refreshKey: number; onJumpToProduct: (id: string) => void }) {
  const [ctx, setCtx] = useState<AthenaContext | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/athena/context')
      .then(r => r.json() as Promise<AthenaContext>)
      .then(setCtx)
      .catch(() => setCtx(null))
  }, [refreshKey])

  const countdown = useCountdownToMidnight(!!ctx && ctx.r01.dueToday === 0)

  return (
    <div className={s.fpCol} style={{ width: 300, flexShrink: 0 }}>
      <div className={s.fpColHead}>
        <div className={s.fpColTitle}>Progress</div>
      </div>

      {!ctx ? (
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</p>
      ) : (
        <>
          <div className={s.fpSection}>
            <span className={s.fpSectionLabel}>R01 Progress</span>
            <div className={s.athenaStatsRow}>
              <span>Total cards: {ctx.r01.totalCards}</span>
              <span>Due today: {ctx.r01.dueToday}</span>
              <span>Mastered (≥21d): {ctx.r01.masteredCards}</span>
            </div>
            <div className={s.athenaProgressBarWrap}>
              <div className={s.athenaProgressBarFill} style={{ width: `${ctx.r01.masteredPct}%` }} />
            </div>
            <p className={s.athenaNextSession}>
              {ctx.r01.dueToday > 0 ? 'Cards ready now' : countdown ? `Next card due in ${countdown}` : ''}
            </p>
          </div>

          <div className={s.fpSection}>
            <span className={s.fpSectionLabel}>Product Cards</span>
            {ctx.products.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>No products yet.</p>
            ) : (
              ctx.products.map(p => (
                <button key={p.id} className={s.athenaProductTagRow} onClick={() => onJumpToProduct(p.id)}>
                  <span className={`${s.athenaHealthDot} ${p.healthy === false ? s.athenaHealthDotRed : s.athenaHealthDotGreen}`} />
                  {p.name}
                </button>
              ))
            )}
          </div>

          <div className={s.fpSection}>
            <span className={s.fpSectionLabel}>Today&apos;s Stats</span>
            <div className={s.athenaStatsRow}>
              <span>Cards reviewed: {ctx.today.cardsReviewed}</span>
              <span>Accuracy: {ctx.today.accuracyPct}%</span>
              <span>Streak: {ctx.today.streakDays} day{ctx.today.streakDays === 1 ? '' : 's'}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
