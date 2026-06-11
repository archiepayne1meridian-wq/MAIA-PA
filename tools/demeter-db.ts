import { eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { holdings, portfolio_snapshots } from '@/db/schema'
import type { PortfolioResult } from './portfolio'

export interface HoldingRow {
  id: string
  ticker: string
  name: string | null
  quantity: number
  avg_cost: number
  currency: string
  added_at: number
  updated_at: number
}

// ─── Holdings CRUD ────────────────────────────────────────────────────────────

export async function addHolding(
  ticker: string,
  name: string | null,
  quantity: number,
  avgCost: number,
  currency: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const upper = ticker.toUpperCase()

  const existing = await getDb()
    .select({ id: holdings.id })
    .from(holdings)
    .where(eq(holdings.ticker, upper))
    .limit(1)

  if (existing.length > 0) {
    await getDb()
      .update(holdings)
      .set({ quantity, avg_cost: avgCost, currency, updated_at: now })
      .where(eq(holdings.ticker, upper))
  } else {
    await getDb().insert(holdings).values({
      id: crypto.randomUUID(),
      ticker: upper,
      name,
      quantity,
      avg_cost: avgCost,
      currency,
      added_at: now,
      updated_at: now,
    })
  }
}

export async function updateHolding(
  ticker: string,
  patch: Partial<{ quantity: number; avg_cost: number; name: string; currency: string }>,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  const result = await getDb()
    .update(holdings)
    .set({ ...patch, updated_at: now })
    .where(eq(holdings.ticker, ticker.toUpperCase()))
  return (result.changes ?? 0) > 0
}

export async function removeHolding(ticker: string): Promise<boolean> {
  const result = await getDb()
    .delete(holdings)
    .where(eq(holdings.ticker, ticker.toUpperCase()))
  return (result.changes ?? 0) > 0
}

export async function listHoldings(): Promise<HoldingRow[]> {
  return getDb().select().from(holdings)
}

export async function getHolding(ticker: string): Promise<HoldingRow | null> {
  const rows = await getDb()
    .select()
    .from(holdings)
    .where(eq(holdings.ticker, ticker.toUpperCase()))
    .limit(1)
  return rows[0] ?? null
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

export async function saveSnapshot(result: PortfolioResult): Promise<void> {
  await getDb().insert(portfolio_snapshots).values({
    id: crypto.randomUUID(),
    taken_at: result.timestamp,
    base_currency: result.baseCurrency,
    total_value: result.totalValue,
    total_cost: result.totalCost,
    day_change: result.dayChange,
    holdings_json: JSON.stringify(result.holdings),
  })
}

export async function getLastSnapshot(): Promise<{
  total_value: number
  day_change: number
  taken_at: number
} | null> {
  const rows = await getDb()
    .select({
      total_value: portfolio_snapshots.total_value,
      day_change: portfolio_snapshots.day_change,
      taken_at: portfolio_snapshots.taken_at,
    })
    .from(portfolio_snapshots)
    .orderBy(portfolio_snapshots.taken_at)
    .limit(1)
  return rows[0] ?? null
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

// avgCost is stored in GBP (base currency) regardless of each holding's price currency.
// P&L = value_GBP - quantity * avgCost_GBP — no FX conversion applied to cost.
export const REAL_HOLDINGS: {
  ticker: string
  name: string
  quantity: number
  avgCost: number   // GBP per unit (base currency)
  currency: string  // native price currency
}[] = [
  { ticker: 'MU',   name: 'Micron Technology',             quantity: 0.94790816,  avgCost: 281.44, currency: 'USD' },
  { ticker: 'VWRP', name: 'Vanguard FTSE All-World (Acc)', quantity: 10.06226739, avgCost: 129.72, currency: 'USD' },
  { ticker: 'VDPG', name: 'Vanguard FTSE Dev Asia Pac',    quantity: 8.84669248,  avgCost: 37.67,  currency: 'GBP' },
  { ticker: 'AMAT', name: 'Applied Materials',             quantity: 0.63494754,  avgCost: 314.51, currency: 'USD' },
  { ticker: 'IONQ', name: 'IonQ',                          quantity: 4.78269039,  avgCost: 42.24,  currency: 'USD' },
  { ticker: 'MSTR', name: 'Strategy (MicroStrategy)',      quantity: 1.74562033,  avgCost: 132.24, currency: 'USD' },
]

export async function seedRealHoldings(): Promise<void> {
  for (const h of REAL_HOLDINGS) {
    await addHolding(h.ticker, h.name, h.quantity, h.avgCost, h.currency)
  }
}
