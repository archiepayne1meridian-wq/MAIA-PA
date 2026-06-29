'use client'

import { useEffect, useState } from 'react'
import s from '../dashboard.module.css'

interface Props {
  onlineCount?: number
  needYouCount?: number
}

function fmt(n: Date) {
  return {
    time: n.toTimeString().slice(0, 5),
    date: n.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase(),
  }
}

export default function Topbar({ onlineCount = 0, needYouCount = 0 }: Props) {
  const [tick, setTick] = useState(fmt(new Date()))

  useEffect(() => {
    const id = setInterval(() => setTick(fmt(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className={s.topbar}>
      <div className={s.brand}>
        <span className={s.star} aria-hidden="true" />
        <span className={s.wordmark}>MAIA</span>
      </div>
      <div className={s.sys}>
        <span className={s.sysDot} />
        {onlineCount} agent{onlineCount !== 1 ? 's' : ''} active
        {needYouCount > 0 ? ` · ${needYouCount} awaiting you` : ''}
      </div>
      <div className={s.topbarRight}>
        <div className={s.clock}>
          <div className={s.clockTime}>{tick.time}</div>
          <div className={s.clockDate}>{tick.date}</div>
        </div>
      </div>
    </header>
  )
}
