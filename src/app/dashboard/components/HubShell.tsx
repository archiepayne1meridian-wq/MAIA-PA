'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import s from '../hub.module.css'
import AgentRailNew from './AgentRailNew'
import ConversationCentre, { type ConversationCentreHandle } from './ConversationCentre'
import ContextPanel from './ContextPanel'
import HomeHub from './HomeHub'
import { AGENT_WORKSPACE_ROUTE, HUB_AGENTS, type ConversationAgent } from './hub-agents'

// Agents that redirect straight to their dedicated full-page workspace
// instead of opening the generic hub chat tile — unlike Calls/LinkedIn/Social,
// these have no useful chat-only experience in the hub (Prospects is a data
// grid, Study/Practice's dedicated pages are the whole workspace, Map is a
// pure data view with no chat at all).
const DIRECT_NAV_AGENTS = new Set<ConversationAgent>(['prospects', 'study', 'practice', 'map'])

const RAIL_COLLAPSED_KEY = 'maia_rail_collapsed'

export default function HubShell() {
  const router = useRouter()
  const [activeId, setActiveId] = useState<ConversationAgent>('hub')
  const [contextRefreshKey, setContextRefreshKey] = useState(0)
  // Default false (expanded, matching the hub's default state) until the
  // mount effect below reads the real saved preference — localStorage isn't
  // available during server render, so this has to settle client-side.
  const [collapsed, setCollapsed] = useState(false)
  const centreRef = useRef<ConversationCentreHandle | null>(null)
  const active = HUB_AGENTS.find(a => a.id === activeId)!

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RAIL_COLLAPSED_KEY)
      if (saved !== null) setCollapsed(saved === 'true')
    } catch { /* ignore — e.g. private browsing */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(RAIL_COLLAPSED_KEY, String(collapsed)) } catch { /* ignore */ }
  }, [collapsed])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        centreRef.current?.focusInput()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Auto-collapse on entering any agent, auto-expand on returning to the hub —
  // the manual toggle (below) can still override this at any time afterwards.
  //
  // Prospects/Study/Practice have no useful generic-chat experience — selecting
  // one navigates straight to its dedicated workspace instead of opening the
  // generic conversation shell.
  function selectAgent(id: ConversationAgent) {
    if (DIRECT_NAV_AGENTS.has(id)) { router.push(AGENT_WORKSPACE_ROUTE[id] ?? '/dashboard'); return }
    setActiveId(id)
    setCollapsed(id !== 'hub')
  }

  const isHome = activeId === 'hub'

  return (
    <div className={`${s.shell} ${collapsed ? s.shellRailCollapsed : ''} ${isHome ? s.shellHome : ''}`}>
      <AgentRailNew
        activeId={activeId}
        onSelect={selectAgent}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(c => !c)}
      />
      {isHome ? (
        <HomeHub />
      ) : (
        <>
          <ConversationCentre
            ref={centreRef}
            agent={active}
            onMessageSent={() => setContextRefreshKey(k => k + 1)}
            onSwitchAgent={selectAgent}
          />
          <ContextPanel agent={active.id} contextTitle={active.contextTitle} refreshKey={contextRefreshKey} />
        </>
      )}
    </div>
  )
}
