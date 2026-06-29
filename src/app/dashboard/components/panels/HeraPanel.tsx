'use client'

import { useEffect, useState } from 'react'
import { PanelSkeleton, PanelError } from './PanelShell'
import s from '../../dashboard.module.css'

interface Reflection {
  id: string
  body: string
  source: string
  date: string
  time: string
  // sentiment is deliberately NOT included — internal only
}

interface WeeklyReview {
  id: string
  summary: string
  periodStart: string
  periodEnd: string
}

interface HeraPanelData {
  reflections: Reflection[]
  streak: number
  weeklyReview: WeeklyReview | null
}

export default function HeraPanel() {
  const [data, setData] = useState<HeraPanelData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/hera')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<HeraPanelData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <PanelError message={`Failed to load HERA data (${error})`} />
  if (!data) return <PanelSkeleton />

  return (
    <>
      <div className={s.tiles}>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Streak</div>
          <div className={s.tileBig}>{data.streak}d</div>
          <div className={s.tileSub}>days reflected (30d)</div>
        </div>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Total entries</div>
          <div className={s.tileBig}>{data.reflections.length > 0 ? `${data.reflections.length}+` : '0'}</div>
          <div className={s.tileSub}>recent shown below</div>
        </div>
      </div>

      {data.weeklyReview && (
        <>
          <div className={`${s.eyebrow} ${s.drawerSectionH}`}>
            Weekly review · {data.weeklyReview.periodStart}–{data.weeklyReview.periodEnd}
          </div>
          <div className={s.weeklyReviewText}>{data.weeklyReview.summary}</div>
        </>
      )}

      {data.reflections.length > 0 ? (
        <>
          <div className={`${s.eyebrow} ${s.drawerSectionH}`} style={{ marginTop: data.weeklyReview ? 20 : 0 }}>
            Recent reflections
          </div>
          {data.reflections.map(r => (
            <div key={r.id} className={s.reflectionItem}>
              <div className={s.reflectionMeta}>
                <span className={s.reflectionDate}>{r.date}</span>
                <span className={s.reflectionTime}>{r.time}</span>
                {r.source === 'voice' && <span className={s.reflectionVoiceTag}>voice</span>}
              </div>
              <div className={s.reflectionBody}>{r.body}</div>
            </div>
          ))}
        </>
      ) : (
        <div className={s.panelEmpty}>
          No reflections yet. Say <strong>"reflection: ..."</strong> in Slack tonight.
        </div>
      )}
    </>
  )
}
