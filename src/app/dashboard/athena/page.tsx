import { buildDashboardData } from '../data'
import AgentPageShell from '../components/AgentPageShell'
import AthenaPanel from '../components/panels/AthenaPanel'
import AthenaWorkspace from './AthenaWorkspace'

export const metadata = { title: 'ATHENA — CISI Study Coach' }

export default async function AthenaPage() {
  const { agents } = await buildDashboardData()
  const agent = agents.find(a => a.id === 'ATHENA')!

  return (
    <AgentPageShell agent={agent}>
      <AthenaPanel />
      <AthenaWorkspace />
    </AgentPageShell>
  )
}
