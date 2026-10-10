'use client'

import s from '../hub.module.css'
import DvLogo from './DvLogo'
import { HUB_AGENTS, type ConversationAgent } from './hub-agents'

interface Props {
  activeId: ConversationAgent
  onSelect: (id: ConversationAgent) => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

export default function AgentRailNew({ activeId, onSelect, collapsed, onToggleCollapsed }: Props) {
  if (collapsed) {
    return (
      <nav className={`${s.rail} ${s.railCollapsed}`}>
        <button className={s.railToggleBtn} onClick={onToggleCollapsed} title="Expand rail" aria-label="Expand rail">
          ›
        </button>
        <div className={s.railStrip}>
          {HUB_AGENTS.map(a => (
            <button
              key={a.id}
              className={`${s.railStripItem} ${a.id === activeId ? s.active : ''}`}
              onClick={() => onSelect(a.id)}
              title={a.name}
              aria-label={a.name}
            >
              <span className={`${s.hDot} ${a.dotOn ? s.hDotOn : s.hDotOff} ${s.railStripDot}`} />
              <span className={s.railStripIcon}>{a.icon}</span>
            </button>
          ))}
        </div>
      </nav>
    )
  }

  return (
    <nav className={s.rail}>
      <div className={s.brand}>
        <DvLogo />
        <div className={s.brandText}>
          <h1>MAIA</h1>
          <div className={s.brandSub}>Command Centre</div>
        </div>
        <button className={s.railToggleBtn} onClick={onToggleCollapsed} title="Collapse rail" aria-label="Collapse rail">
          ‹
        </button>
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
            <div className={s.hAgentPreview}>{a.preview}</div>
          </button>
        ))}
      </div>

      <div className={s.railFooter}><span>⌘K to focus chat</span></div>
    </nav>
  )
}
