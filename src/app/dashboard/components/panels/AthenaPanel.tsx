'use client'

import { useEffect, useState } from 'react'
import { PanelSkeleton, PanelError } from './PanelShell'
import s from '../../dashboard.module.css'

interface ModuleRow { name: string; total: number; due: number; mastery: number }
interface QuizRow { id: string; date: string; accuracy: number; correct: number; total: number; modules: string[] }

interface AthenaPanelData {
  totalCards: number
  dueToday: number
  reviewedToday: number
  masteryPct: number
  totalReviews: number
  modules: ModuleRow[]
  recentQuizzes: QuizRow[]
}

export default function AthenaPanel() {
  const [data, setData] = useState<AthenaPanelData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/athena')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<AthenaPanelData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <PanelError message={`Failed to load ATHENA data (${error})`} />
  if (!data) return <PanelSkeleton />

  return (
    <>
      <div className={s.tiles}>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Cards due today</div>
          <div className={s.tileBig}>{data.dueToday}</div>
          <div className={s.tileSub}>{data.dueToday > 0 ? 'review now in Slack' : 'all clear'}</div>
        </div>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Mastery</div>
          <div className={s.tileBig}>{data.masteryPct}%</div>
          <div className={s.tileSub}>last 30 days ({data.totalReviews} reviews)</div>
        </div>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Reviewed today</div>
          <div className={s.tileBig}>{data.reviewedToday}</div>
          <div className={s.tileSub}>cards</div>
        </div>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Total cards</div>
          <div className={s.tileBig}>{data.totalCards}</div>
          <div className={s.tileSub}>in deck</div>
        </div>
      </div>

      {data.modules.length > 0 && (
        <>
          <div className={`${s.eyebrow} ${s.drawerSectionH}`}>Module breakdown</div>
          <div className={s.moduleTable}>
            {data.modules.map(m => (
              <div key={m.name} className={s.moduleRow}>
                <span className={s.moduleName}>{m.name}</span>
                <span className={s.moduleDue}>{m.due > 0 ? <span className={s.dueChip}>{m.due} due</span> : null}</span>
                <span className={s.moduleMastery}>{m.mastery}%</span>
                <span className={s.moduleProg}>
                  <span className={s.moduleProgBar} style={{ width: `${m.mastery}%` }} />
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {data.recentQuizzes.length > 0 && (
        <>
          <div className={`${s.eyebrow} ${s.drawerSectionH}`} style={{ marginTop: 20 }}>Recent quizzes</div>
          <div className={s.quizList}>
            {data.recentQuizzes.map(q => (
              <div key={q.id} className={s.quizRow}>
                <span className={s.quizDate}>{q.date}</span>
                <span className={s.quizScore}>{q.correct}/{q.total}</span>
                <span
                  className={s.quizPct}
                  style={{ color: q.accuracy >= 80 ? 'var(--online)' : q.accuracy >= 60 ? 'var(--idle)' : 'var(--alert)' }}
                >
                  {q.accuracy}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
