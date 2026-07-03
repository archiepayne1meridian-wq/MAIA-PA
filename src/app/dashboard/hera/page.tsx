import { buildDashboardData } from '../data'
import AgentPageShell from '../components/AgentPageShell'
import HeraPanel from '../components/panels/HeraPanel'

export const metadata = { title: 'HERA — Reflection & Coaching' }

export default async function HeraPage() {
  const { agents } = await buildDashboardData()
  const agent = agents.find(a => a.id === 'HERA')!

  return (
    <AgentPageShell agent={agent}>
      <HeraPanel />
    </AgentPageShell>
  )
}
