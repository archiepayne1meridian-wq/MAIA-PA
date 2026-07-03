'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OrbState, Agent, Task } from './types'
import { EVENTS } from './stub-data'
import s from './dashboard.module.css'
import Topbar from './components/Topbar'
import AgentRail from './components/AgentRail'
import Orb from './components/Orb'
import Composer from './components/Composer'
import TaskList from './components/TaskList'
import CalendarColumn from './components/CalendarColumn'

interface Props {
  agents: Agent[]
  tasks: Task[]
  onlineCount: number
  needYouCount: number
}

// The only agent ids with a full page at /dashboard/<id>. MAIA (the orchestrator
// tile) and any greyed/unbuilt agent (LUNA, IRIS, JUNO) have no route — clicking
// them must stay a no-op, not a 404.
const ROUTABLE_AGENTS = new Set(['ATHENA', 'CASSANDRA', 'DEMETER', 'HERA', 'DIANA', 'VICTORIA'])

export default function DashboardClient({ agents, tasks, onlineCount, needYouCount }: Props) {
  const router = useRouter()
  const [orbState, setOrbState] = useState<OrbState>('idle')

  function handleAgentSelect(id: string) {
    if (!ROUTABLE_AGENTS.has(id)) return
    router.push(`/dashboard/${id.toLowerCase()}`)
  }

  return (
    <div className={s.app}>
      <Topbar onlineCount={onlineCount} needYouCount={needYouCount} />

      <AgentRail
        agents={agents}
        activeId=""
        onSelect={handleAgentSelect}
      />

      <div className={s.main}>
        <TaskList tasks={tasks} />

        <section className={`${s.col} ${s.colCentre}`}>
          <div className={s.centreScroll}>
            <Orb state={orbState} onChange={setOrbState} />

            <div className={s.greet}>
              <h1>
                Morning, Archie.{' '}
                {onlineCount > 0 ? (
                  <>
                    <span className={s.hl}>{onlineCount} agent{onlineCount !== 1 ? 's' : ''}</span> active — your command centre is live.
                  </>
                ) : (
                  <>Your agents are standing by.</>
                )}
              </h1>
            </div>

            <div className={s.chips}>
              <button className={s.chip} onClick={() => router.push('/dashboard/cassandra')}>
                Market brief
              </button>
              <button className={s.chip} onClick={() => router.push('/dashboard/athena')}>
                CISI cards due?
              </button>
              <button className={s.chip} onClick={() => router.push('/dashboard/demeter')}>
                Portfolio update
              </button>
            </div>

            <div className={s.msg}>
              <div className={s.msgBadge}>M</div>
              <div className={s.msgBubble}>
                {needYouCount > 0
                  ? `${needYouCount} item${needYouCount !== 1 ? 's' : ''} need${needYouCount === 1 ? 's' : ''} your attention. Tap the relevant agent tile to review.`
                  : onlineCount > 0
                  ? `All clear — ${onlineCount} agent${onlineCount !== 1 ? 's' : ''} active, nothing pending your approval.`
                  : 'Agents are standing by. Send a command in Slack or use the mic below.'}
              </div>
            </div>
          </div>

          <Composer orbState={orbState} onOrbChange={setOrbState} />
        </section>

        <CalendarColumn events={EVENTS} />
      </div>
    </div>
  )
}
