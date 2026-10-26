'use client'

import { useRouter } from 'next/navigation'
import s from '../dashboard.module.css'
import AgentRailNew from '../components/AgentRailNew'
import { AGENT_WORKSPACE_ROUTE, type ConversationAgent } from '../components/hub-agents'

export default function NexusLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  function onSelect(id: ConversationAgent) {
    if (id === 'prospects') return
    router.push(AGENT_WORKSPACE_ROUTE[id] ?? '/dashboard')
  }

  return (
    <div className={s.nexusShell}>
      <AgentRailNew activeId="prospects" onSelect={onSelect} />
      {children}
    </div>
  )
}
