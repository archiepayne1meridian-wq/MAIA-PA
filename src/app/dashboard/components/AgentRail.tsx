'use client'

import type { Agent } from '../types'
import s from '../dashboard.module.css'

interface Props {
  agents: Agent[]
  activeId: string
  onSelect: (id: string) => void
}

const dotClass: Record<string, string> = {
  online: s.sOnline,
  idle: s.sIdle,
  alert: s.sAlert,
}

export default function AgentRail({ agents, activeId, onSelect }: Props) {
  return (
    <nav className={s.rail}>
      {agents.filter(a => !a.inactive).map(a => (
        <button
          key={a.id}
          className={[
            s.agent,
            !a.inactive && a.id === activeId ? s.active : '',
            a.inactive ? s.agentInactive : '',
          ].filter(Boolean).join(' ')}
          onClick={() => { if (!a.inactive) onSelect(a.id) }}
          aria-label={a.inactive ? `${a.id} — coming soon` : a.id}
        >
          <div className={s.agentTop}>
            <div className={s.monoBadge}>{a.badge}</div>
            <div>
              <div className={s.agentName}>{a.id}</div>
              <div className={s.agentRole}>{a.role}</div>
            </div>
          </div>
          <div className={s.agentStat}>
            <span className={`${s.sdot} ${!a.inactive ? (dotClass[a.status] ?? '') : ''}`} />
            {a.stat}
          </div>
          <div className={s.agentProgwrap}>
            <div className={s.agentProg}>
              <div
                className={`${s.agentProgBar} ${a.progAlert ? s.alertBar : ''}`}
                style={{ width: `${a.prog}%` }}
              />
            </div>
            <span className={s.progPct}>{a.prog}%</span>
          </div>
        </button>
      ))}
    </nav>
  )
}
