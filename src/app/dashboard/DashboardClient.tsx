'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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

// Sequential Web Audio API playback — no <audio> element, no overlap
class AudioQueue {
  private queue: Array<{ buffer: ArrayBuffer; afterDone?: () => void }> = []
  private playing = false
  private ctx: AudioContext | null = null

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  enqueue(buffer: ArrayBuffer, afterDone?: () => void) {
    this.queue.push({ buffer, afterDone })
    if (!this.playing) this.drain()
  }

  private async drain() {
    if (this.queue.length === 0) { this.playing = false; return }
    this.playing = true
    const item = this.queue.shift()!
    try {
      const ctx = this.getCtx()
      if (ctx.state === 'suspended') await ctx.resume()
      const decoded = await ctx.decodeAudioData(item.buffer.slice(0))
      const src = ctx.createBufferSource()
      src.buffer = decoded
      src.connect(ctx.destination)
      src.onended = () => {
        item.afterDone?.()
        this.drain()
      }
      src.start()
    } catch (err) {
      console.error('[AudioQueue] playback error', err)
      item.afterDone?.()
      this.playing = false
      this.drain()
    }
  }
}

// Agents with a full page at /dashboard/<id>
const ROUTABLE_AGENTS = new Set(['ATHENA', 'CASSANDRA', 'DEMETER', 'HERA', 'DIANA', 'VICTORIA', 'MERCURY', 'IRIS', 'MUSE'])

interface Props {
  agents: Agent[]
  tasks: Task[]   // accepted from data spread; TaskList now fetches its own
  onlineCount: number
  needYouCount: number
}

export default function DashboardClient({ agents, onlineCount, needYouCount }: Props) {
  const router = useRouter()
  const [orbState, setOrbState] = useState<OrbState>('idle')
  const [taskRefreshKey, setTaskRefreshKey] = useState(0)
  const audioQueueRef = useRef<AudioQueue | null>(null)

  function getQueue(): AudioQueue {
    if (!audioQueueRef.current) audioQueueRef.current = new AudioQueue()
    return audioQueueRef.current
  }

  const speakText = useCallback(async (text: string, afterDone?: () => void): Promise<void> => {
    setOrbState('speaking')
    try {
      const res = await fetch('/api/dashboard/maia/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error(`speak ${res.status}`)
      const buffer = await res.arrayBuffer()
      getQueue().enqueue(buffer, afterDone ?? (() => setOrbState('idle')))
    } catch (err) {
      console.error('[maia] speakText error', err)
      setOrbState('idle')
      afterDone?.()
    }
  }, []) // setOrbState is stable; getQueue uses a ref

  const handleRoute = useCallback(async (input: string): Promise<void> => {
    setOrbState('thinking')
    try {
      const res = await fetch('/api/dashboard/maia/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      if (!res.ok) { setOrbState('idle'); return }
      const data = await res.json() as {
        spokenResponse: string
        action?: { type: string; payload?: Record<string, unknown> }
        agentData?: { taskAdded?: string; taskCompleted?: string }
      }
      if (data.agentData?.taskAdded || data.agentData?.taskCompleted) {
        setTaskRefreshKey(k => k + 1)
      }
      await speakText(data.spokenResponse, () => {
        setOrbState('idle')
        if (data.action?.type === 'navigate' && data.action.payload?.agent) {
          const agentId = String(data.action.payload.agent).toUpperCase()
          if (ROUTABLE_AGENTS.has(agentId)) {
            router.push(`/dashboard/${agentId.toLowerCase()}`)
          }
        }
      })
    } catch (err) {
      console.error('[maia] handleRoute error', err)
      setOrbState('idle')
    }
  }, [speakText, router])

  // Greeting on mount
  useEffect(() => {
    let cancelled = false
    async function greet() {
      setOrbState('thinking')
      try {
        const res = await fetch('/api/dashboard/maia/greeting', { method: 'POST' })
        if (!res.ok) { if (!cancelled) setOrbState('idle'); return }
        const data = await res.json() as { spokenResponse?: string }
        if (cancelled) return
        if (data.spokenResponse) {
          await speakText(data.spokenResponse)
        } else {
          setOrbState('idle')
        }
      } catch {
        if (!cancelled) setOrbState('idle')
      }
    }
    greet()
    return () => { cancelled = true }
  }, [speakText])

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
        <TaskList refreshKey={taskRefreshKey} />

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
              <button className={s.chip} onClick={() => router.push('/dashboard/mercury')}>
                Draft a message
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

          <Composer
            orbState={orbState}
            onOrbChange={setOrbState}
            onRoute={handleRoute}
          />
        </section>

        <CalendarColumn events={EVENTS} />
      </div>
    </div>
  )
}
