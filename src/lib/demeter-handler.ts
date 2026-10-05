import { eq } from 'drizzle-orm'
import { formatBrief } from './demeter'
import {
  listHoldings,
  saveSnapshot,
  getLastSnapshot,
} from '../../tools/demeter-db'
import { computePortfolio, type Holding } from '../../tools/portfolio'
import { getPricedHoldings } from '../../tools/market-data'
import { getDb } from '@/db'
import { activity } from '@/db/schema'

// ─── Activity logging ─────────────────────────────────────────────────────────

async function logActivity(
  type: string,
  input: string,
  fn: () => Promise<string>,
): Promise<string> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()
  const now = Math.floor(Date.now() / 1000)

  await getDb().insert(activity).values({
    id: rowId,
    type,
    agent: 'DEMETER',
    input,
    status: 'pending',
    created_at: now,
  })

  try {
    const output = await fn()
    await getDb()
      .update(activity)
      .set({ output, status: 'success', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
    return output
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await getDb()
      .update(activity)
      .set({ output: msg, status: 'error', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
    throw err
  }
}

// ─── Portfolio brief (scheduled cron endpoint) ──────────────────────────────────

export async function buildBrief(): Promise<void> {
  await logActivity('demeter_brief', 'portfolio brief', async () => {
    const rows = await listHoldings()

    if (rows.length === 0) {
      return 'empty portfolio'
    }

    const holdingInputs: Holding[] = rows.map(r => ({
      ticker: r.ticker,
      name: r.name ?? undefined,
      quantity: r.quantity,
      avgCost: r.avg_cost,
      currency: r.currency,
    }))

    // Fetch prices; fall back to last snapshot if provider fails
    const { priced, unavailable } = await getPricedHoldings(holdingInputs, 'GBP')

    if (priced.length === 0) {
      const snap = await getLastSnapshot()
      return snap
        ? `prices unavailable, last known value £${snap.total_value.toFixed(2)}`
        : 'prices unavailable, no snapshot'
    }

    const config = { baseCurrency: 'GBP', concentrationThreshold: 25, dayMoveThreshold: 5 }
    const result = computePortfolio(priced, config, unavailable)
    await saveSnapshot(result)

    const brief = formatBrief(result)
    return `brief: ${rows.length} holdings, value ${result.totalValue} — ${brief.slice(0, 200)}`
  })
}
