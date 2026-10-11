'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import s from '../dashboard.module.css'
import AgentRailNew from '../components/AgentRailNew'
import type { ConversationAgent } from '../components/hub-agents'

const RAIL_COLLAPSED_KEY = 'maia_rail_collapsed'

// Agents with their own dedicated full-page workspace — clicking one from
// here goes straight there (mirrors HubShell's prospects-specific redirect).
// Anything else falls back to the hub, same as before this layout existed.
const AGENT_ROUTE: Partial<Record<ConversationAgent, string>> = {
  calls: '/dashboard/apollo',
  linkedin: '/dashboard/iris',
  practice: '/dashboard/diana',
  study: '/dashboard/athena',
  social: '/dashboard/social',
}

export default function NexusLayout({ children }: { children: React.ReactNode }) {
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
    if (id === 'prospects') return
    router.push(AGENT_ROUTE[id] ?? '/dashboard')
  }

  return (
    <div className={`${s.nexusShell} ${collapsed ? s.nexusShellRailCollapsed : ''}`}>
      <AgentRailNew
        activeId="prospects"
        onSelect={onSelect}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(c => !c)}
      />
      {children}
    </div>
  )
}
