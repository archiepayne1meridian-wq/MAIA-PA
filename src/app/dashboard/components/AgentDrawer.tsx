'use client'

import { useEffect } from 'react'
import type { Agent } from '../types'
import s from '../dashboard.module.css'
import GenericPanel from './panels/GenericPanel'
import AthenaPanel from './panels/AthenaPanel'
import CassandraPanel from './panels/CassandraPanel'
import DemeterPanel from './panels/DemeterPanel'
import HeraPanel from './panels/HeraPanel'
import DianaPanel from './panels/DianaPanel'
import VictoriaPanel from './panels/VictoriaPanel'

interface Props {
  agent: Agent | null
  onClose: () => void
}

const DOT_CLASS: Record<string, string> = {
  online: s.sOnline,
  idle: s.sIdle,
  alert: s.sAlert,
}

function AgentPanel({ agent }: { agent: Agent }) {
  switch (agent.id) {
    case 'ATHENA':   return <AthenaPanel />
    case 'CASSANDRA': return <CassandraPanel />
    case 'DEMETER':  return <DemeterPanel />
    case 'HERA':     return <HeraPanel />
    case 'DIANA':    return <DianaPanel />
    case 'VICTORIA': return <VictoriaPanel />
    default:         return <GenericPanel agent={agent} />
  }
}

export default function AgentDrawer({ agent, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={`${s.overlay} ${agent ? s.open : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {agent && (
        <div className={s.drawer}>
          <button className={s.drawerClose} onClick={onClose} aria-label="Close">×</button>

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

          <AgentPanel agent={agent} />

          <div className={s.drawerActions}>
            <button className={s.btnPrimary} onClick={onClose}>Close panel</button>
            <button className={s.btnGhost} onClick={onClose}>Message {agent.id}</button>
          </div>
        </div>
      )}
    </div>
  )
}
