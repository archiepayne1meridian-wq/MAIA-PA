'use client'

import { useEffect, useState } from 'react'
import { PanelSkeleton, PanelError } from './PanelShell'
import s from '../../dashboard.module.css'

interface DianaSession {
  id: string
  scenario: string
  difficulty: string
  status: string
  turnCount: number
  date: string
  time: string
}

interface LastCompleted {
  scenario: string
  difficulty: string
  turns: number
  date: string | null
}

interface DianaPanelData {
  sessions: DianaSession[]
  completedThisWeek: number
  lastCompleted: LastCompleted | null
  feedbackNote: string
}

const DIFFICULTY_COLOR: Record<string, string> = {
  warm: 'var(--online)',
  neutral: 'var(--text-mid)',
  tough: 'var(--alert)',
}

const TARGET = 5

export default function DianaPanel() {
  const [data, setData] = useState<DianaPanelData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/diana')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<DianaPanelData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <PanelError message={`Failed to load DIANA data (${error})`} />
  if (!data) return <PanelSkeleton />

  const prog = Math.min(Math.round(data.sessions.length / TARGET * 100), 100)

  return (
    <>
      <div className={s.tiles}>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Sessions this week</div>
          <div className={s.tileBig}>{data.sessions.length}</div>
          <div className={s.tileSub}>of {TARGET} target</div>
        </div>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Completed</div>
          <div className={s.tileBig}>{data.completedThisWeek}</div>
          <div className={s.tileSub}>scored drills</div>
        </div>
        <div className={s.tile}>
          <div className={s.eyebrow} style={{ marginBottom: 9 }}>Weekly progress</div>
          <div className={s.tileBig}>{prog}%</div>
          <div className={s.tileSub}>of weekly target</div>
        </div>
        {data.lastCompleted && (
          <div className={s.tile}>
            <div className={s.eyebrow} style={{ marginBottom: 9 }}>Last drill</div>
            <div className={s.tileBig} style={{ fontSize: 12, lineHeight: 1.4 }}>{data.lastCompleted.scenario}</div>
            <div className={s.tileSub}>{data.lastCompleted.turns} exchanges · {data.lastCompleted.difficulty}</div>
          </div>
        )}
      </div>

      {data.sessions.length > 0 ? (
        <>
          <div className={`${s.eyebrow} ${s.drawerSectionH}`}>This week&apos;s drills</div>
          {data.sessions.map(session => (
            <div key={session.id} className={s.dianaSessionRow}>
              <div className={s.dianaSessionLeft}>
                <span
                  className={s.dianaDiffDot}
                  style={{ background: DIFFICULTY_COLOR[session.difficulty] ?? 'var(--text-dim)' }}
                />
                <span className={s.dianaScenario}>{session.scenario}</span>
              </div>
              <div className={s.dianaSessionRight}>
                <span className={s.dianaTurns}>{session.turnCount} exchanges</span>
                <span className={s.dianaStatus}>{session.status === 'ended' ? 'scored' : 'active'}</span>
                <span className={s.dianaDate}>{session.date}</span>
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className={s.panelEmpty}>
          No drills this week. Say <strong>&quot;DIANA, roleplay&quot;</strong> in Slack to start.
        </div>
      )}

      <div className={s.dianaFeedbackNote}>
        <span className={s.dianaFeedbackIcon}>ⓘ</span>
        {data.feedbackNote}
      </div>
    </>
  )
}
