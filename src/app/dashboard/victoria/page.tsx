import { buildDashboardData } from '../data'
import AgentPageShell from '../components/AgentPageShell'
import VictoriaPanel from '../components/panels/VictoriaPanel'

export const metadata = { title: 'VICTORIA — KPI & Pipeline' }

export default async function VictoriaPage() {
  const { agents } = await buildDashboardData()
  const agent = agents.find(a => a.id === 'VICTORIA')!

  return (
    <AgentPageShell agent={agent}>
      <VictoriaPanel />
    </AgentPageShell>
  )
}
