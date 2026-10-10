import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { listCards, createCard, type AthenaTab } from '../../../../../../tools/athena-db'
import { seedR01IfEmpty } from '@/lib/athena-knowledge'

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const tabParam = searchParams.get('tab')
  const tab: AthenaTab | undefined = tabParam === 'r01' || tabParam === 'product' ? tabParam : undefined
  const due = searchParams.get('due') === 'true'

  try {
    // First-ever load of the R01 tab: the deck is empty, so generate and
    // insert the 40-card seed set before returning — the client shows its
    // "seeded" toast based on the `seeded` count in this response.
    let seeded = 0
    if (tab === 'r01') seeded = await seedR01IfEmpty()

    const cards = await listCards({ tab, due })
    return NextResponse.json({ cards, seeded })
  } catch (err) {
    console.error('[athena/cards] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load cards' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as { tab?: AthenaTab; front?: string; back?: string; note?: string; product_id?: string }
  if (!body.front?.trim() || !body.back?.trim() || (body.tab !== 'r01' && body.tab !== 'product')) {
    return NextResponse.json({ error: 'tab (r01|product), front, and back are required' }, { status: 400 })
  }

  try {
    const id = await createCard({ tab: body.tab, front: body.front.trim(), back: body.back.trim(), note: body.note ?? null, product_id: body.product_id ?? null })
    return NextResponse.json({ id })
  } catch (err) {
    console.error('[athena/cards] POST failed:', err)
    return NextResponse.json({ error: 'Failed to create card' }, { status: 500 })
  }
}
