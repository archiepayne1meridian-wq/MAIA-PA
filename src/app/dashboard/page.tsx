import { buildDashboardData } from './data'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const data = await buildDashboardData()
  return <DashboardClient {...data} />
}
