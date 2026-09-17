// Web adapter — APOLLO connection. APOLLO calls this when a product-knowledge
// gap surfaces on a prospect call; it pulls matching cards' due date forward
// so ATHENA's next session surfaces them. No Claude call — pure DB write.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { flagWeakArea } from '@/lib/athena'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { topic?: string; exam?: 'R01' | 'R06' | 'products' }
  if (!body.topic?.trim()) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 })
  }
  if (!body.exam || !['R01', 'R06', 'products'].includes(body.exam)) {
    return NextResponse.json({ error: "exam must be 'R01' | 'R06' | 'products'" }, { status: 400 })
  }

  const result = await flagWeakArea(body.topic.trim(), body.exam)
  return NextResponse.json(result)
}
