'use client'

import { useState } from 'react'
import type { Task } from '../types'
import s from '../dashboard.module.css'

interface Props {
  tasks: Task[]
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

export default function TaskList({ tasks: initial }: Props) {
  const [tasks, setTasks] = useState(initial)

  const done = tasks.filter((t) => t.done).length
  const needYou = tasks.filter((t) => !t.done && t.warn).length
  const todo = tasks.filter((t) => !t.done).length
  const pct = Math.round((done / tasks.length) * 100)

  function toggle(i: number) {
    setTasks((prev) => prev.map((t, idx) => idx === i ? { ...t, done: !t.done } : t))
  }

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
            <div className={s.scNum} style={{ color: 'var(--alert)' }}>{needYou}</div>
            <div className={s.scLbl}>Need you</div>
          </div>
          <div>
            <div className={s.scNum}>{todo}</div>
            <div className={s.scLbl}>To do</div>
          </div>
          <div>
            <div className={s.scNum}>{done}</div>
            <div className={s.scLbl}>Done</div>
          </div>
        </div>
      </div>

      <div className={s.eyebrow} style={{ marginBottom: 10 }}>Tasks</div>

      {tasks.map((t, i) => (
        <div
          key={i}
          className={`${s.task} ${t.done ? s.done : ''}`}
          onClick={() => toggle(i)}
        >
          <div className={s.check}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#0D1014" strokeWidth={3.5} strokeLinecap="round">
              <path d="M5 12l5 5L20 6" />
            </svg>
          </div>
          <div className={s.taskBody}>
            <div className={s.taskText}>{t.text}</div>
            <div className={s.taskMeta}>
              <span className={s.pill}>{t.meta}</span>
              {t.warn && <span className={`${s.pill} ${s.warn}`}>{t.warn}</span>}
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}
