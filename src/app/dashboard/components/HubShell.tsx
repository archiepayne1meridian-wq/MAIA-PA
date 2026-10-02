'use client'

import { useState, useRef, useEffect } from 'react'
import s from '../hub.module.css'
import AgentRailNew from './AgentRailNew'
import ConversationCentre, { type ConversationCentreHandle } from './ConversationCentre'
import ContextPanel from './ContextPanel'
import { HUB_AGENTS, type ConversationAgent } from './hub-agents'

export default function HubShell() {
  const [activeId, setActiveId] = useState<ConversationAgent>('hub')
  const [contextRefreshKey, setContextRefreshKey] = useState(0)
  const centreRef = useRef<ConversationCentreHandle | null>(null)
  const active = HUB_AGENTS.find(a => a.id === activeId)!

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

  return (
    <div className={s.shell}>
      <AgentRailNew activeId={activeId} onSelect={setActiveId} />
      <ConversationCentre
        ref={centreRef}
        agent={active}
        onMessageSent={() => setContextRefreshKey(k => k + 1)}
        onSwitchAgent={setActiveId}
      />
      <ContextPanel agent={active.id} contextTitle={active.contextTitle} refreshKey={contextRefreshKey} />
    </div>
  )
}
