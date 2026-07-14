'use client'

import { useState, useEffect } from 'react'
import type { MaiaTask, NonNegotiables } from '../types'
import s from '../dashboard.module.css'

interface Props {
  refreshKey: number
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 30, c = 2 * Math.PI * r
  const off = c * (1 - pct / 100)
  return (
    <div className={s.ring}>
      <svg width={74} height={74} viewBox="0 0 74 74">
        <circle cx={37} cy={37} r={r} fill="none" stroke="var(--raised-2)" strokeWidth={6} />
        <circle
          cx={37} cy={37} r={r} fill="none" stroke="var(--accent)" strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={c.toFixed(1)}
          strokeDashoffset={off.toFixed(1)}
        />
      </svg>
      <div className={s.ringPct}>{pct}%</div>
    </div>
  )
}

interface PinnedTask {
  key: string
  label: string
  agent: string
  done: boolean
}

const EMPTY_NON_NEG: NonNegotiables = { linkedinToday: 0, dianaToday: 0, athenaToday: 0 }

export default function TaskList({ refreshKey }: Props) {
  const [tasks, setTasks] = useState<MaiaTask[]>([])
  const [nonNeg, setNonNeg] = useState<NonNegotiables>(EMPTY_NON_NEG)
  const [addValue, setAddValue] = useState('')
  const [adding, setAdding] = useState(false)

  async function fetchTasks() {
    try {
      const res = await fetch('/api/dashboard/maia/tasks')
      if (!res.ok) return
      const data = await res.json() as { tasks: MaiaTask[]; nonNegotiables?: NonNegotiables }
      setTasks(data.tasks)
      if (data.nonNegotiables) setNonNeg(data.nonNegotiables)
    } catch { /* silent — stale UI is better than an error boundary */ }
  }

  useEffect(() => { fetchTasks() }, [refreshKey])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleComplete(id: string) {
    try {
      const res = await fetch('/api/dashboard/maia/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) return
      const data = await res.json() as { tasks: MaiaTask[] }
      setTasks(data.tasks)
    } catch { /* silent */ }
  }

  async function handleAddTask() {
    const title = addValue.trim()
    if (!title || adding) return
    setAdding(true)
    try {
      const res = await fetch('/api/dashboard/maia/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) return
      const data = await res.json() as { tasks: MaiaTask[] }
      setTasks(data.tasks)
      setAddValue('')
    } catch { /* silent */ } finally {
      setAdding(false)
    }
  }

  const pinnedTasks: PinnedTask[] = [
    { key: 'linkedin-1', label: 'LinkedIn post 1', agent: 'IRIS', done: nonNeg.linkedinToday >= 1 },
    { key: 'linkedin-2', label: 'LinkedIn post 2', agent: 'IRIS', done: nonNeg.linkedinToday >= 2 },
    { key: 'athena',     label: 'ATHENA study',    agent: 'ATHENA', done: nonNeg.athenaToday > 0 },
    { key: 'diana',      label: 'DIANA practice',  agent: 'DIANA', done: nonNeg.dianaToday > 0 },
  ]

  const pinnedDone = pinnedTasks.filter(t => t.done).length
  const totalItems = pinnedTasks.length + tasks.length
  const pct = totalItems > 0 ? Math.round((pinnedDone / totalItems) * 100) : 0

  return (
    <section className={`${s.col} ${s.colLeft}`}>
      <div className={s.colHead}>
        <span className={s.eyebrow}>Today</span>
        <span className={`${s.colHead} ${s.num}`} style={{ marginBottom: 0 }}>{pct}%</span>
      </div>

      <div className={s.summary}>
        <ProgressRing pct={pct} />
        <div className={s.summaryCounts}>
          <div>
            <div className={s.scNum} style={{ color: 'var(--alert)' }}>0</div>
            <div className={s.scLbl}>Need you</div>
          </div>
          <div>
            <div className={s.scNum}>{tasks.length}</div>
            <div className={s.scLbl}>To do</div>
          </div>
          <div>
            <div className={s.scNum}>{pinnedDone}</div>
            <div className={s.scLbl}>Done</div>
          </div>
        </div>
      </div>

      <div className={s.eyebrow} style={{ marginBottom: 10 }}>Non-negotiables</div>

      {pinnedTasks.map((t) => (
        <div key={t.key} className={`${s.task} ${s.maiaTaskPinned} ${t.done ? s.done : ''}`}>
          <div className={s.check}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#0D1014" strokeWidth={3.5} strokeLinecap="round">
              <path d="M5 12l5 5L20 6" />
            </svg>
          </div>
          <div className={s.taskBody}>
            <div className={s.taskText}>{t.label}</div>
            <div className={s.taskMeta}>
              <span className={s.pill}>{t.agent}</span>
            </div>
          </div>
        </div>
      ))}

      <div className={s.eyebrow} style={{ marginBottom: 10, marginTop: 16 }}>Tasks</div>

      {tasks.map((t) => (
        <div
          key={t.id}
          className={s.task}
          onClick={() => handleComplete(t.id)}
        >
          <div className={s.check}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#0D1014" strokeWidth={3.5} strokeLinecap="round">
              <path d="M5 12l5 5L20 6" />
            </svg>
          </div>
          <div className={s.taskBody}>
            <div className={s.taskText}>{t.title}</div>
            <div className={s.taskMeta}>
              <span className={s.pill}>{t.source}</span>
              {t.due_date && <span className={`${s.pill} ${s.warn}`}>{t.due_date}</span>}
            </div>
          </div>
        </div>
      ))}

      <div className={s.maiaAddTaskRow}>
        <input
          className={s.maiaAddTaskInput}
          placeholder="Add a task…"
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
          disabled={adding}
        />
        <button
          className={s.maiaAddTaskBtn}
          onClick={handleAddTask}
          disabled={adding || !addValue.trim()}
          aria-label="Add task"
        >
          +
        </button>
      </div>
    </section>
  )
}
