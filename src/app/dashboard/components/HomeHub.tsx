'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import s from '../hub.module.css'
import ChatInput from '@/components/ChatInput'

// Static for now, per the home page redesign — these mirror the long-running
// goals Archie already keeps in maia_goals (see tools/goals.ts); the panel
// below reads the real, live table rather than hardcoding a second copy of
// the same six/three lines that would drift the moment he adds or completes
// one via a chat command ("add to short term goals: ...").

interface Goal {
  id: string
  goal_text: string
  goal_type: 'short_term' | 'long_term'
  completed: number
}

interface Reminder {
  id: number
  text: string
  done: number
  due_date: string | null
}

// Date-triggered referral nudge (the `reminders` table) — distinct from the
// Reminder/to-do interface above (maia_reminders). Shown once, the morning
// before a booked meeting, then dismissed.
interface DueNudge {
  id: number
  message: string
}

interface MorningBriefMessage {
  type: string
  metadata?: { todayAngle?: string | null }
}

const TRANSIENT_REPLY_MS = 8000

function formatToday(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function HomeHub() {
  const [todayAngle, setTodayAngle] = useState<string | null | undefined>(undefined) // undefined = still loading
  const [goals, setGoals] = useState<{ shortTerm: Goal[]; longTerm: Goal[] } | null>(null)
  const [reminders, setReminders] = useState<Reminder[] | null>(null)
  const [dueNudges, setDueNudges] = useState<DueNudge[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [transientReply, setTransientReply] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadBrief = useCallback(() => {
    // Same route ConversationCentre already uses for the hub thread — it
    // auto-populates today's morning_brief message on first load of the day,
    // so this reuses that exact data source rather than building a new one.
    fetch('/api/dashboard/conversations/hub')
      .then(r => r.json() as Promise<{ messages: MorningBriefMessage[] }>)
      .then(d => {
        const brief = [...d.messages].reverse().find(m => m.type === 'morning_brief')
        setTodayAngle(brief?.metadata?.todayAngle ?? null)
      })
      .catch(() => setTodayAngle(null))
  }, [])

  const loadGoals = useCallback(() => {
    fetch('/api/dashboard/goals')
      .then(r => r.json() as Promise<{ short_term: Goal[]; long_term: Goal[] }>)
      .then(d => setGoals({ shortTerm: d.short_term ?? [], longTerm: d.long_term ?? [] }))
      .catch(() => setGoals({ shortTerm: [], longTerm: [] }))
  }, [])

  const loadReminders = useCallback(() => {
    fetch('/api/dashboard/reminders')
      .then(r => r.json() as Promise<{ reminders: Reminder[] }>)
      .then(d => setReminders(d.reminders ?? []))
      .catch(() => setReminders([]))
  }, [])

  const loadDueNudges = useCallback(() => {
    fetch('/api/dashboard/reminders/due')
      .then(r => r.json() as Promise<{ reminders: DueNudge[] }>)
      .then(d => setDueNudges(d.reminders ?? []))
      .catch(() => setDueNudges([]))
  }, [])

  useEffect(() => { loadBrief(); loadGoals(); loadReminders(); loadDueNudges() }, [loadBrief, loadGoals, loadReminders, loadDueNudges])

  async function dismissNudge(id: number) {
    setDueNudges(prev => prev.filter(n => n.id !== id))
    try {
      await fetch(`/api/dashboard/reminders/due/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
    } catch { /* already removed client-side — a retry isn't worth the complexity here */ }
  }

  function showToast(text: string) {
    setToast(text)
    setTimeout(() => setToast(null), 2200)
  }

  async function toggleReminder(id: number) {
    setReminders(prev => prev?.map(r => r.id === id ? { ...r, done: 1 } : r) ?? prev)
    try {
      await fetch(`/api/dashboard/reminders/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: true }),
      })
      loadReminders()
    } catch { loadReminders() }
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setInput('')
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current)
    setTransientReply(null)
    try {
      const res = await fetch('/api/dashboard/home/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: trimmed }),
      })
      const data = await res.json() as { action?: string; message?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed')

      if (data.action === 'add_reminder') {
        loadReminders()
        showToast('Added to your list')
      } else if (data.action === 'add_goal') {
        loadGoals()
        showToast('Added to your goals')
      } else if (data.message) {
        setTransientReply(data.message)
        replyTimerRef.current = setTimeout(() => setTransientReply(null), TRANSIENT_REPLY_MS)
      }
    } catch {
      setTransientReply("Couldn't process that — try again.")
      replyTimerRef.current = setTimeout(() => setTransientReply(null), TRANSIENT_REPLY_MS)
    } finally {
      setSending(false)
    }
  }

  const shortGoals = goals?.shortTerm ?? []
  const longGoals = goals?.longTerm ?? []

  return (
    <div className={s.homeShell}>
      {dueNudges.length > 0 && (
        <div className={s.homeNudges}>
          {dueNudges.map(n => (
            <div key={n.id} className={s.homeNudge}>
              <span className={s.homeNudgeIcon}>🔔</span>
              <span className={s.homeNudgeText}>{n.message}</span>
              <button className={s.homeNudgeDismiss} onClick={() => void dismissNudge(n.id)}>Dismiss</button>
            </div>
          ))}
        </div>
      )}
      <div className={s.homeTop}>
        <div className={s.homeTopHead}>
          <div className={s.homeGreet}>Good morning, Archie.</div>
          <div className={s.homeDate}>{formatToday()}</div>
        </div>
        <div className={s.briefLabel}>TODAY&apos;S ANGLE</div>
        {todayAngle === undefined ? (
          <p className={s.ctxEmpty}>Loading…</p>
        ) : todayAngle ? (
          <div className={s.briefAngle}>📞 {todayAngle}</div>
        ) : (
          <p className={s.ctxEmpty}>No briefing generated yet today.</p>
        )}
      </div>

      <div className={s.homeGrid}>
        <div className={s.homePanel}>
          <h3 className={s.homePanelTitle}>GOALS</h3>
          <div className={s.goalType}>SHORT TERM</div>
          {shortGoals.length === 0 ? (
            <p className={s.ctxEmpty}>None yet.</p>
          ) : shortGoals.map(g => (
            <div key={g.id} className={s.goalRow}>
              <div className={`${s.gDot} ${s.gDotSt}`} />
              <div className={`${s.gText} ${g.completed ? s.gTextDone : ''}`}>{g.goal_text}</div>
            </div>
          ))}
          <div className={s.goalType}>LONG TERM</div>
          {longGoals.length === 0 ? (
            <p className={s.ctxEmpty}>None yet.</p>
          ) : longGoals.map(g => (
            <div key={g.id} className={s.goalRow}>
              <div className={`${s.gDot} ${s.gDotLt}`} />
              <div className={`${s.gText} ${g.completed ? s.gTextDone : ''}`}>{g.goal_text}</div>
            </div>
          ))}
        </div>

        <div className={s.homePanel}>
          <h3 className={s.homePanelTitle}>REMINDERS / TO-DO</h3>
          {reminders === null ? (
            <p className={s.ctxEmpty}>Loading…</p>
          ) : reminders.length === 0 ? (
            <p className={s.ctxEmpty}>Nothing on the list — tell MAIA what to add.</p>
          ) : reminders.map(r => (
            <button key={r.id} className={s.reminderRow} onClick={() => r.done ? undefined : void toggleReminder(r.id)}>
              <div className={`${s.rCheck} ${r.done ? s.rCheckDone : ''}`} />
              <div className={`${s.rText} ${r.done ? s.rTextDone : ''}`}>
                {r.text}
                {r.due_date && <span className={s.rSub}>{r.due_date}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {transientReply && <div className={s.homeTransientReply}>{transientReply}</div>}
      {toast && <div className={s.toast}>{toast}</div>}

      <ChatInput
        value={input}
        onChange={setInput}
        onSend={() => void send(input)}
        sending={sending}
        placeholder="Type or speak to MAIA…"
      />
    </div>
  )
}
