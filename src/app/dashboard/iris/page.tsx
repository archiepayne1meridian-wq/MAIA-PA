import { buildDashboardData } from '../data'
import AgentPageShell from '../components/AgentPageShell'
import IrisPanel from '../components/panels/IrisPanel'
import IrisWorkspace from './IrisWorkspace'

export const metadata = { title: 'IRIS — LinkedIn Drafts' }

export default async function IrisPage() {
  const { agents } = await buildDashboardData()
  const agent = agents.find(a => a.id === 'IRIS')!

  return (
    <AgentPageShell agent={agent}>
      <IrisPanel />
      <IrisWorkspace />
    </AgentPageShell>
  )
}
