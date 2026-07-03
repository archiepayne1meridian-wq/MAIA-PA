import { buildDashboardData } from '../data'
import AgentPageShell from '../components/AgentPageShell'
import DianaPanel from '../components/panels/DianaPanel'
import DianaWorkspace from './DianaWorkspace'

export const metadata = { title: 'DIANA — Objection Roleplay' }

export default async function DianaPage() {
  const { agents } = await buildDashboardData()
  const agent = agents.find(a => a.id === 'DIANA')!

  return (
    <AgentPageShell agent={agent}>
      <DianaPanel />
      <DianaWorkspace />
    </AgentPageShell>
  )
}
