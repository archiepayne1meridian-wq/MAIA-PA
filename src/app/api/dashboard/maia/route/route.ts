import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { buildDashboardData } from '@/app/dashboard/data'
import { routeToAgent, generateAgentSummary, extractTask } from '@/lib/maia-voice'
import { saveTasks, completeTask } from '../../../../../../tools/maia-voice'

// Agents that have real data to summarise — anything not in this set gets the
// router's own spokenResponse (which is already reasonable for MUSE, MERCURY, etc.)
const DATA_AGENTS = new Set(['DEMETER', 'ATHENA', 'CASSANDRA', 'VICTORIA', 'DIANA', 'IRIS'])

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { input?: string }
  if (!body.input?.trim()) {
    return NextResponse.json({ error: 'input required' }, { status: 400 })
  }

  const input = body.input.trim()

  try {
    const data = await buildDashboardData()
    const routing = await routeToAgent(input, data)

    let spokenResponse = routing.spokenResponse
    let agentData: Record<string, unknown> | undefined

    // For agents with real DB data, replace the router's placeholder with a real summary
    if (routing.agent && DATA_AGENTS.has(routing.agent.toUpperCase())) {
      spokenResponse = await generateAgentSummary(routing.agent, data)
    }

    // Execute task actions
    if (routing.action?.type === 'add_task') {
      // Prefer payload from router (already extracted); fall back to regex
      const title = (routing.action.payload?.title as string | undefined)?.trim()
        || extractTask(input)?.title
      if (title) {
        await saveTasks([{ title, source: 'voice' }])
        agentData = { taskAdded: title }
      }
    } else if (routing.action?.type === 'complete_task') {
      const id = routing.action.payload?.id as string | undefined
      if (id) {
        await completeTask(id)
        agentData = { taskCompleted: id }
      }
    }

    return NextResponse.json({ spokenResponse, action: routing.action, agentData })
  } catch (err) {
    console.error('[maia/route] error', err)
    return NextResponse.json({ error: 'Routing failed' }, { status: 500 })
  }
}
