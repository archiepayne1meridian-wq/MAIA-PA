import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { loadVictoriaConfig } from '@/lib/victoria-handler'
import { parseVoiceTally } from '@/lib/victoria'
import { getDay, logTally } from '../../../../../../tools/victoria-db'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { transcript } = await req.json().catch(() => ({})) as { transcript?: string }

  if (!transcript?.trim()) {
    return NextResponse.json({ error: 'transcript required' }, { status: 400 })
  }

  const config = loadVictoriaConfig()

  try {
    const parsed = await parseVoiceTally(transcript.trim(), config.metrics)

    if (parsed.length === 0) {
      return NextResponse.json({ status: 'no_metrics', logged: [], todayTotals: (await getDay())?.metrics ?? {} })
    }

    const existing = await getDay()
    const merged = { ...(existing?.metrics ?? {}) }
    for (const { name, count } of parsed) {
      merged[name] = (merged[name] ?? 0) + count
    }

    const { log } = await logTally(merged)

    return NextResponse.json({ status: 'logged', logged: parsed, todayTotals: log.metrics })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Voice log error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
