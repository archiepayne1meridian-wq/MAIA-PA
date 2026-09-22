import { buildDashboardData } from './data'
import { gatherMaiaContext } from '@/lib/maia-context'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const [data, brief] = await Promise.all([buildDashboardData(), gatherMaiaContext()])
  return <DashboardClient {...data} brief={brief} />
}
