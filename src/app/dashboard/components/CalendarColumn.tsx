import type { CalEvent } from '../types'
import s from '../dashboard.module.css'

interface Props {
  events: CalEvent[]
}

const DOT_CLASS: Record<string, string> = {
  done: s.done,
  now: s.now,
  pending: s.pending,
}

export default function CalendarColumn({ events }: Props) {
  const today = new Date()
  const weekday = today.toLocaleDateString('en-GB', { weekday: 'long' })
  const dayNum = today.toLocaleDateString('en-GB', { day: '2-digit' })
  const month = today.toLocaleDateString('en-GB', { month: 'long' })

  return (
    <section className={`${s.col} ${s.colRight}`}>
      <div className={s.calDate}>{weekday}</div>
      <div className={s.calSub}>{dayNum} {month} · {events.length} events</div>
      {events.map((e, i) => (
        <div key={i} className={s.event}>
          <div className={s.evTime}>{e.time}</div>
          <div className={`${s.evDot} ${DOT_CLASS[e.dot] ?? ''}`} />
          <div className={s.evBody}>
            <div className={s.evTitle}>{e.title}</div>
            <div className={s.evTag}>{e.tag}</div>
          </div>
        </div>
      ))}
    </section>
  )
}
