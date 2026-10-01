import { buildDashboardData } from '../data'
import AgentPageShell from '../components/AgentPageShell'
import IrisWorkspace from './IrisWorkspace'

export const metadata = { title: 'LinkedIn — Content Drafts' }

export default async function IrisPage() {
  const { agents } = await buildDashboardData()
  const agent = agents.find(a => a.id === 'IRIS')!

  return (
    <AgentPageShell agent={agent}>
      <IrisWorkspace />
    </AgentPageShell>
  )
}
