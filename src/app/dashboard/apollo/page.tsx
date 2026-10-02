import { buildDashboardData } from '../data'
import AgentPageShell from '../components/AgentPageShell'
import ApolloWorkspace from './ApolloWorkspace'

export const metadata = { title: 'Calls — Transcription & Coaching' }

export default async function ApolloPage() {
  const { agents } = await buildDashboardData()
  const agent = agents.find(a => a.id === 'APOLLO')!

  return (
    <AgentPageShell agent={agent}>
      <ApolloWorkspace />
    </AgentPageShell>
  )
}
