'use client'

import { useEffect, useState } from 'react'
import { PanelSkeleton, PanelError } from './PanelShell'
import s from '../../dashboard.module.css'

interface IrisPost {
  id: string
  slot: string
  pillar: number
  topic: string
  status: string
  created_at: number
}

interface IrisPanelData {
  posts: IrisPost[]
  draft: IrisPost | null
  preferences: { id: string }[]
}

const PILLAR_LABEL: Record<number, string> = { 1: 'Markets', 2: 'Expat', 3: 'Culture' }
const PILLAR_COLOR: Record<number, string> = {
  1: 'var(--accent)',
  2: 'var(--online)',
  3: 'var(--idle)',
}

function relTime(ts: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return new Date(ts * 1000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
}

export default function IrisPanel() {
  const [data, setData] = useState<IrisPanelData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/iris')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<IrisPanelData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <PanelError message={`Failed to load IRIS data (${error})`} />
  if (!data) return <PanelSkeleton />

  const approved = data.posts.filter(p => p.status === 'approved').length
  const p1 = data.posts.filter(p => p.pillar === 1).length
  const p2 = data.posts.filter(p => p.pillar === 2).length
  const p3 = data.posts.filter(p => p.pillar === 3).length

  return (
    <>
      <div className={s.tiles}>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Drafts this week</div>
          <div className={s.tileBig}>{data.posts.length}</div>
          <div className={s.tileSub}>total</div>
        </div>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Approved</div>
          <div className={s.tileBig}>{approved}</div>
          <div className={s.tileSub}>ready to post</div>
        </div>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Voice prefs</div>
          <div className={s.tileBig}>{data.preferences.length}</div>
          <div className={s.tileSub}>logged</div>
        </div>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Pillar mix</div>
          <div className={s.tileBig} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            {p1}M · {p2}E · {p3}C
          </div>
          <div className={s.tileSub}>Markets · Expat · Culture</div>
        </div>
      </div>

      {data.draft && (
        <div className={s.irisDraftBanner}>
          <span className={s.eyebrow}>Current draft</span>
          <span className={s.irisDraftTopic}>{data.draft.topic}</span>
          <span className={s.irisDraftSlot}>{data.draft.slot}</span>
        </div>
      )}

      {data.posts.length > 0 ? (
        <>
          <div className={`${s.eyebrow} ${s.drawerSectionH}`}>Last 7 days</div>
          {data.posts.map(post => (
            <div key={post.id} className={s.irisPostRow}>
              <span
                className={s.irisPillarDot}
                style={{ background: PILLAR_COLOR[post.pillar] ?? 'var(--text-dim)' }}
                title={PILLAR_LABEL[post.pillar]}
              />
              <span className={s.irisPostTopic}>{post.topic}</span>
              <span className={s.irisPostSlot}>{post.slot}</span>
              <span className={s.irisPostStatus}>{post.status}</span>
              <span className={s.irisPostDate}>{relTime(post.created_at)}</span>
            </div>
          ))}
        </>
      ) : (
        <div className={s.panelEmpty}>
          No drafts yet. The cron runs Monday–Friday at 6am and 12pm CET.
        </div>
      )}
    </>
  )
}
