'use client'

import { useEffect, useState } from 'react'
import s from '../hub.module.css'
import DvLogo from './DvLogo'
import { HUB_AGENTS, type ConversationAgent } from './hub-agents'

interface Props {
  activeId: ConversationAgent
  onSelect: (id: ConversationAgent) => void
}

// Always fully expanded — no collapse/icon-only mode. Each row: name + time
// (row 1), subtitle (row 2), live preview line (row 3, falls back to
// hub-agents.ts's static text until the fetch resolves or for the agents
// with no live source — see src/lib/hub-rail-preview.ts).
export default function AgentRailNew({ activeId, onSelect }: Props) {
  const [livePreviews, setLivePreviews] = useState<Partial<Record<ConversationAgent, string>>>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard/hub-rail-previews')
      .then(r => r.json() as Promise<{ previews?: Partial<Record<ConversationAgent, string>> }>)
      .then(d => { if (!cancelled) setLivePreviews(d.previews ?? {}) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <nav className={s.rail}>
      <div className={s.brand}>
        <DvLogo />
        <div className={s.brandText}>
          <h1>MAIA</h1>
          <div className={s.brandSub}>Command Centre</div>
        </div>
      </div>

      <div className={s.agentList}>
        {HUB_AGENTS.map(a => (
          <button
            key={a.id}
            className={`${s.agentRow} ${a.id === activeId ? s.active : ''}`}
            onClick={() => onSelect(a.id)}
          >
            <div className={s.agentRowTop}>
              <div className={`${s.hDot} ${a.dotOn ? s.hDotOn : s.hDotOff}`} />
              <span className={s.hAgentIcon}>{a.icon}</span>
              <span className={s.hAgentName}>{a.name}</span>
              <span className={s.hAgentTime}>{a.time}</span>
            </div>
            <div className={s.hAgentRole}>{a.role}</div>
            <div className={s.hAgentPreview}>{livePreviews[a.id] ?? a.preview}</div>
          </button>
        ))}
      </div>

      <div className={s.railFooter}><span>⌘K to focus chat</span></div>
    </nav>
  )
}
