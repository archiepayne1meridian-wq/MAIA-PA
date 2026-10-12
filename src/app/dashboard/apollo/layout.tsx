'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import s from '../dashboard.module.css'
import AgentRailNew from '../components/AgentRailNew'
import { AGENT_WORKSPACE_ROUTE, type ConversationAgent } from '../components/hub-agents'

const RAIL_COLLAPSED_KEY = 'maia_rail_collapsed'

export default function ApolloLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RAIL_COLLAPSED_KEY)
      if (saved !== null) setCollapsed(saved === 'true')
    } catch { /* ignore — e.g. private browsing */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(RAIL_COLLAPSED_KEY, String(collapsed)) } catch { /* ignore */ }
  }, [collapsed])

  function onSelect(id: ConversationAgent) {
    if (id === 'calls') return
    router.push(AGENT_WORKSPACE_ROUTE[id] ?? '/dashboard')
  }

  return (
    <div className={`${s.nexusShell} ${collapsed ? s.nexusShellRailCollapsed : ''}`}>
      <AgentRailNew
        activeId="calls"
        onSelect={onSelect}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(c => !c)}
      />
      <div className={s.agentShellScroll}>{children}</div>
    </div>
  )
}
