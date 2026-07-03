import { buildDashboardData } from '../data'
import AgentPageShell from '../components/AgentPageShell'
import CassandraPanel from '../components/panels/CassandraPanel'

export const metadata = { title: 'CASSANDRA — Market & FX Brief' }

export default async function CassandraPage() {
  const { agents } = await buildDashboardData()
  const agent = agents.find(a => a.id === 'CASSANDRA')!

  return (
    <AgentPageShell agent={agent}>
      <CassandraPanel />
    </AgentPageShell>
  )
}
