import { buildDashboardData } from '../data'
import AgentPageShell from '../components/AgentPageShell'
import MercuryWorkspace from './MercuryWorkspace'

export const metadata = { title: 'MERCURY — Message Drafts' }

export default async function MercuryPage() {
  const { agents } = await buildDashboardData()
  const agent = agents.find(a => a.id === 'MERCURY')!

  return (
    <AgentPageShell agent={agent}>
      <MercuryWorkspace />
    </AgentPageShell>
  )
}
