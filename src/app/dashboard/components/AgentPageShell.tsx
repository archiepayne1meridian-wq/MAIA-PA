'use client'

import { useRouter } from 'next/navigation'
import type { Agent } from '../types'
import s from '../dashboard.module.css'

interface Props {
  agent: Agent
  children: React.ReactNode
}

const DOT_CLASS: Record<string, string> = {
  online: s.sOnline,
  idle: s.sIdle,
  alert: s.sAlert,
}

export default function AgentPageShell({ agent, children }: Props) {
  const router = useRouter()

  return (
    <div className={s.agentPageWrap}>
      <button className={s.agentPageBack} onClick={() => router.push('/dashboard')}>← MAIA</button>

      <div className={s.drawerHead}>
        <div className={s.drawerBadge}>{agent.badge}</div>
        <div>
          <div className={s.drawerName}>{agent.id}</div>
          <div className={s.drawerRole}>{agent.role}</div>
        </div>
      </div>

      <div className={s.drawerStatus}>
        <span className={`${s.sdot} ${DOT_CLASS[agent.status] ?? ''}`} />
        {agent.statusLabel}
      </div>

      <div className={s.drawerProg}>
        <div
          className={`${s.drawerProgBar} ${agent.progAlert ? s.alertBar : ''}`}
          style={{ width: `${agent.prog}%` }}
        />
      </div>

      <div className={s.agentPageBody}>
        {children}
      </div>
    </div>
  )
}

export function InteractiveSlotPlaceholder({ label }: { label: string }) {
  return (
    <div className={s.interactiveSlot}>
      <span className={s.eyebrow}>{label}</span>
      <p className={s.interactiveSlotText}>Interactive practice — coming soon.</p>
    </div>
  )
}
