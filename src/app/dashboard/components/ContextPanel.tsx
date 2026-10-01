'use client'

import { useEffect, useState, useCallback } from 'react'
import s from '../hub.module.css'
import type { ConversationAgent } from './hub-agents'

type Section =
  | { type: 'reminders'; title: string; items: { text: string; sub?: string }[] }
  | { type: 'goals'; title: string; shortTerm: { text: string; completed: boolean }[]; longTerm: { text: string; completed: boolean }[] }
  | { type: 'stats'; title: string; rows: { label: string; value: string; color?: string }[] }
  | { type: 'tags'; title: string; tags: { text: string; tone: 'red' | 'amber' | 'green' }[] }
  | { type: 'list'; title: string; items: { text: string; sub?: string }[] }
  | { type: 'empty'; title: string; message: string }

interface Props {
  agent: ConversationAgent
  contextTitle: string
  refreshKey?: number
}

const TAG_CLASS: Record<string, string> = { red: 'hTagRed', amber: 'hTagAmber', green: 'hTagGreen' }

export default function ContextPanel({ agent, contextTitle, refreshKey }: Props) {
  const [sections, setSections] = useState<Section[] | null>(null)
  const [reminderDone, setReminderDone] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    setSections(null)
    fetch(`/api/dashboard/hub-context/${agent}`)
      .then(r => r.json() as Promise<{ sections: Section[] }>)
      .then(d => setSections(d.sections))
      .catch(() => setSections([]))
  }, [agent])

  useEffect(() => { load() }, [load, refreshKey])

  async function toggleGoal(text: string, completed: boolean) {
    // Goals are keyed by text here since the panel doesn't carry ids — find by
    // text via the goals list endpoint isn't available client-side, so this
    // optimistic toggle re-fetches after the PATCH resolves server-side.
    try {
      const res = await fetch('/api/dashboard/goals')
      const data = await res.json() as { short_term: { id: string; goal_text: string }[]; long_term: { id: string; goal_text: string }[] }
      const all = [...data.short_term, ...data.long_term]
      const match = all.find(g => g.goal_text === text)
      if (!match) return
      await fetch(`/api/dashboard/goals/${match.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: completed ? 0 : 1 }),
      })
      load()
    } catch { /* ignore */ }
  }

  function toggleReminder(text: string) {
    setReminderDone(prev => {
      const next = new Set(prev)
      if (next.has(text)) next.delete(text); else next.add(text)
      return next
    })
  }

  return (
    <div className={s.context}>
      <div className={s.contextHeader}>
        <div className={s.contextTitle}>{contextTitle}</div>
      </div>
      <div className={s.contextBody}>
        {sections === null ? (
          <div className={s.ctxEmpty}>Loading…</div>
        ) : sections.length === 0 ? (
          <div className={s.ctxEmpty}>Nothing here yet.</div>
        ) : (
          sections.map((sec, i) => (
            <div key={i} className={s.ctxSection}>
              <h3>{sec.title}</h3>

              {sec.type === 'empty' && <p className={s.ctxEmpty}>{sec.message}</p>}

              {sec.type === 'reminders' && sec.items.map((item, j) => (
                <button key={j} className={s.reminderRow} onClick={() => toggleReminder(item.text)}>
                  <div className={`${s.rCheck} ${reminderDone.has(item.text) ? s.rCheckDone : ''}`} />
                  <div className={`${s.rText} ${reminderDone.has(item.text) ? s.rTextDone : ''}`}>
                    {item.text}
                    {item.sub && <span className={s.rSub}>{item.sub}</span>}
                  </div>
                </button>
              ))}

              {sec.type === 'list' && sec.items.map((item, j) => (
                <div key={j} className={s.reminderRow} style={{ cursor: 'default' }}>
                  <div className={s.rText}>
                    {item.text}
                    {item.sub && <span className={s.rSub}>{item.sub}</span>}
                  </div>
                </div>
              ))}

              {sec.type === 'goals' && (
                <>
                  <div className={s.goalType}>SHORT TERM</div>
                  {sec.shortTerm.length === 0
                    ? <p className={s.ctxEmpty}>None yet.</p>
                    : sec.shortTerm.map((g, j) => (
                      <div key={j} className={s.goalRow} onClick={() => void toggleGoal(g.text, g.completed)} style={{ cursor: 'pointer' }}>
                        <div className={`${s.gDot} ${s.gDotSt}`} />
                        <div className={`${s.gText} ${g.completed ? s.gTextDone : ''}`}>{g.text}</div>
                      </div>
                    ))}
                  <div className={s.goalType}>LONG TERM</div>
                  {sec.longTerm.length === 0
                    ? <p className={s.ctxEmpty}>None yet.</p>
                    : sec.longTerm.map((g, j) => (
                      <div key={j} className={s.goalRow} onClick={() => void toggleGoal(g.text, g.completed)} style={{ cursor: 'pointer' }}>
                        <div className={`${s.gDot} ${s.gDotLt}`} />
                        <div className={`${s.gText} ${g.completed ? s.gTextDone : ''}`}>{g.text}</div>
                      </div>
                    ))}
                </>
              )}

              {sec.type === 'stats' && sec.rows.map((row, j) => (
                <div key={j} className={s.statRow}>
                  <span className={s.statLabel}>{row.label}</span>
                  <span className={s.statVal}>{row.value}</span>
                </div>
              ))}

              {sec.type === 'tags' && sec.tags.map((tag, j) => (
                <span key={j} className={`${s.hTag} ${s[TAG_CLASS[tag.tone]!]}`}>{tag.text}</span>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
