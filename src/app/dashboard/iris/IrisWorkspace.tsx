'use client'

import { useEffect, useState, useCallback } from 'react'
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
  created_at: number
}

interface IrisData {
  posts: IrisPost[]
  draft: IrisPost | null
  preferences: { id: string; preference_type: string; value: string }[]
}

const PILLAR_LABEL: Record<number, string> = { 1: 'Markets', 2: 'Expat Finance', 3: 'Sports & Culture' }
const PILLAR_COLOR: Record<number, string> = {
  1: 'var(--accent)',
  2: 'var(--online)',
  3: 'var(--idle)',
}

function relDate(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function IrisWorkspace() {
  const [data, setData] = useState<IrisData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [approveMsg, setApproveMsg] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    fetch('/api/dashboard/iris')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<IrisData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => { load() }, [load])

  async function approve(id: string) {
    setApproving(true)
    setApproveMsg(null)
    try {
      const res = await fetch('/api/dashboard/iris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve' }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setApproveMsg('Approved — paste to LinkedIn when ready.')
      load()
    } catch (e) {
      setApproveMsg(`Error: ${String(e)}`)
    } finally {
      setApproving(false)
    }
  }

  if (error) return <div className={s.irisError}>{error}</div>
  if (!data) return <div className={s.irisLoading}>Loading…</div>

  const { draft, posts, preferences } = data
  const history = posts.filter(p => p.status !== 'draft')

  return (
    <div className={s.irisWs}>

      {/* Current draft */}
      <section className={s.irisDraftSection}>
        <span className={s.eyebrow}>Current draft</span>
        {draft ? (
          <div className={s.irisDraftCard}>
            <div className={s.irisDraftMeta}>
              <span
                className={s.irisPillarTag}
                style={{ borderColor: PILLAR_COLOR[draft.pillar], color: PILLAR_COLOR[draft.pillar] }}
              >
                {PILLAR_LABEL[draft.pillar]}
              </span>
              <span className={s.irisDraftSlotTag}>{draft.slot}</span>
              {draft.format && <span className={s.irisDraftFormatTag}>{draft.format}</span>}
            </div>

            <div className={s.irisDraftTopic}>{draft.topic}</div>

            {draft.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.image_url}
                alt="IRIS generated image"
                className={s.irisDraftImage}
              />
            )}

            <pre className={s.irisCopy}>{draft.copy}</pre>

            {approveMsg && <p className={s.irisApproveMsg}>{approveMsg}</p>}

            <div className={s.irisDraftActions}>
              <button
                className={s.irisApproveBtn}
                onClick={() => void approve(draft.id)}
                disabled={approving}
              >
                {approving ? 'Approving…' : '✓ Approve — ready to post'}
              </button>
              <span className={s.irisDraftHint}>Refine in Slack by replying to the thread</span>
            </div>
          </div>
        ) : (
          <div className={s.irisNoDraft}>
            No draft pending. The cron delivers at 6am and 12pm CET (Mon–Fri).
          </div>
        )}
      </section>

      {/* Post history */}
      <section className={s.irisHistorySection}>
        <span className={s.eyebrow}>Post history (last 7 days)</span>
        {history.length > 0 ? (
          <div className={s.irisHistoryList}>
            {history.map(post => (
              <div key={post.id} className={s.irisHistoryRow}>
                <span
                  className={s.irisPillarBar}
                  style={{ background: PILLAR_COLOR[post.pillar] }}
                  title={PILLAR_LABEL[post.pillar]}
                />
                <div className={s.irisHistoryBody}>
                  <div className={s.irisHistoryTopic}>{post.topic}</div>
                  <div className={s.irisHistoryMeta}>
                    <span>{relDate(post.created_at)}</span>
                    <span>{post.slot}</span>
                    <span className={`${s.irisStatusChip} ${post.status === 'approved' ? s.irisStatusApproved : ''}`}>
                      {post.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={s.irisNoDraft}>No approved posts in the last 7 days.</div>
        )}
      </section>

      {/* Voice preferences */}
      {preferences.length > 0 && (
        <section className={s.irisPrefsSection}>
          <span className={s.eyebrow}>Voice memory ({preferences.length} preferences)</span>
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
