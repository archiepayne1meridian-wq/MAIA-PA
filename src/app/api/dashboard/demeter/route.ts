import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { portfolio_snapshots } from '@/db/schema'
import { desc } from 'drizzle-orm'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  // Read from snapshot only — never triggers a live price fetch.
  const [row] = await db
    .select()
    .from(portfolio_snapshots)
    .orderBy(desc(portfolio_snapshots.taken_at))
    .limit(1)

  if (!row) {
    return NextResponse.json({ snapshot: null })
  }

  let holdings: unknown[] = []
  try { holdings = JSON.parse(row.holdings_json) } catch { /* malformed — use empty */ }

  const prevValue = row.total_value - row.day_change
  const dayChangePct = prevValue > 0 ? (row.day_change / prevValue) * 100 : 0

  return NextResponse.json({
    snapshot: {
      takenAt: row.taken_at,
      takenAtLabel: new Date(row.taken_at * 1000).toLocaleString('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      }),
      baseCurrency: row.base_currency,
      totalValue: row.total_value,
      totalCost: row.total_cost,
      dayChange: row.day_change,
      dayChangePct,
      holdings,
    },
  })
}
