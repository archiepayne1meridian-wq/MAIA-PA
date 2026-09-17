// Web adapter — ease-factor-ranked weak modules, for the "Your weak areas
// this week" panel. Fully deterministic — no Claude calls.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getWeakModules } from '../../../../../../tools/sm2'
import type { Track, Exam } from '../../../../../../tools/study-db'

export async function GET(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const track = (url.searchParams.get('track') as Track | null) ?? 'qualification'
  const exam = (url.searchParams.get('exam') as Exam | null) ?? undefined

  const modules = await getWeakModules(track, exam)
  return NextResponse.json({ modules })
}
