import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { loadVictoriaConfig } from '@/lib/victoria-handler'
import { getDay, logTally } from '../../../../../../tools/victoria-db'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { metric, increment } = await req.json().catch(() => ({})) as {
    metric?: string
    increment?: number
  }

  const config = loadVictoriaConfig()

  if (!metric || !config.metrics.includes(metric) || typeof increment !== 'number' || !Number.isFinite(increment)) {
    return NextResponse.json({ error: 'metric (must be a tracked metric) and increment are required' }, { status: 400 })
  }

  const existing = await getDay()
  const merged = { ...(existing?.metrics ?? {}) }
  merged[metric] = Math.max(0, (merged[metric] ?? 0) + increment)

  const { log } = await logTally(merged)

  return NextResponse.json({ metric, value: merged[metric], todayTotals: log.metrics })
}
