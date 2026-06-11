import { eq } from 'drizzle-orm'
import { postMessage } from './slack'
import { formatBrief } from './demeter'
import {
  addHolding,
  removeHolding,
  updateHolding,
  listHoldings,
  saveSnapshot,
  getLastSnapshot,
  seedRealHoldings,
  type HoldingRow,
} from '../../tools/demeter-db'
import { computePortfolio, round2, type Holding } from '../../tools/portfolio'
import { getPricedHoldings } from '../../tools/market-data'
import { getDb } from '@/db'
import { activity } from '@/db/schema'

// ─── Intent detection ─────────────────────────────────────────────────────────

export type DemeterIntent =
  | { type: 'brief' }
  | { type: 'add'; ticker: string; quantity: number; avgCost: number; currency: string }
  | { type: 'remove'; ticker: string }
  | { type: 'update'; ticker: string; quantity: number }
  | { type: 'list' }
  | { type: 'allocation' }
  | { type: 'news'; ticker: string }
  | { type: 'seed' }

export function detectDemeterIntent(text: string): DemeterIntent | null {
  const t = text.trim()
  const lower = t.toLowerCase()

  // "portfolio" / "how's my portfolio" / "how is my portfolio" / "my portfolio"
  if (/(?:^|\bdemeter[,.]?\s+)?(?:how(?:'s| is) my portfolio|my portfolio|^portfolio$)/i.test(t)) {
    return { type: 'brief' }
  }
  if (/^portfolio$/i.test(t.trim())) return { type: 'brief' }
  if (/how(?:'s| is) my portfolio/i.test(lower)) return { type: 'brief' }

  // "DEMETER, add <qty> <ticker> [at <cost>] [USD|GBP]"
  // "DEMETER, add <ticker> <qty>"
  const addMatch = t.match(
    /demeter[,.]?\s+add\s+(\d+(?:\.\d+)?)\s+([A-Za-z]+)(?:\s+at\s+(\d+(?:\.\d+)?)(?:\s+(USD|GBP|usd|gbp))?)?/i,
  )
  if (addMatch) {
    const [, qty, ticker, cost, currency] = addMatch
    return {
      type: 'add',
      ticker: ticker.toUpperCase(),
      quantity: parseFloat(qty),
      avgCost: cost ? parseFloat(cost) : 0,
      currency: (currency ?? 'USD').toUpperCase(),
    }
  }
  // "DEMETER, add <ticker> <qty>" (ticker first)
  const addMatch2 = t.match(
    /demeter[,.]?\s+add\s+([A-Za-z]{1,6})\s+(\d+(?:\.\d+)?)/i,
  )
  if (addMatch2) {
    const [, ticker, qty] = addMatch2
    return { type: 'add', ticker: ticker.toUpperCase(), quantity: parseFloat(qty), avgCost: 0, currency: 'USD' }
  }

  // "DEMETER, remove <ticker>"
  const removeMatch = t.match(/demeter[,.]?\s+remove\s+([A-Za-z]{1,10})/i)
  if (removeMatch) {
    return { type: 'remove', ticker: removeMatch[1].toUpperCase() }
  }

  // "DEMETER, update <ticker> to <qty>"
  const updateMatch = t.match(/demeter[,.]?\s+update\s+([A-Za-z]{1,10})\s+to\s+(\d+(?:\.\d+)?)/i)
  if (updateMatch) {
    return { type: 'update', ticker: updateMatch[1].toUpperCase(), quantity: parseFloat(updateMatch[2]) }
  }

  // "DEMETER, list holdings" / "list my holdings"
  if (/demeter[,.]?\s+list holdings/i.test(lower) || /\blist my holdings\b/i.test(lower)) {
    return { type: 'list' }
  }

  // "what's my allocation" / "allocation breakdown"
  if (/what(?:'s| is) my allocation/i.test(lower) || /^allocation(?:\s+breakdown)?$/i.test(lower.trim())) {
    return { type: 'allocation' }
  }

  // "DEMETER, news on <ticker>"
  const newsMatch = t.match(/demeter[,.]?\s+news\s+on\s+([A-Za-z]{1,10})/i)
  if (newsMatch) {
    return { type: 'news', ticker: newsMatch[1].toUpperCase() }
  }

  // "DEMETER, seed holdings" — one-time seed of real portfolio
  if (/demeter[,.]?\s+seed holdings/i.test(lower)) {
    return { type: 'seed' }
  }

  return null
}

// ─── Activity logging ─────────────────────────────────────────────────────────

async function logActivity(
  type: string,
  input: string,
  slackUser: string | undefined,
  fn: () => Promise<string>,
): Promise<string> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()
  const now = Math.floor(Date.now() / 1000)

  await getDb().insert(activity).values({
    id: rowId,
    type,
    agent: 'DEMETER',
    slack_user: slackUser,
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

// ─── Portfolio brief (shared between chat and scheduled endpoint) ──────────────

export async function buildBrief(channel: string, slackUser?: string): Promise<void> {
  await logActivity('demeter_brief', 'portfolio brief', slackUser, async () => {
    const rows = await listHoldings()

    if (rows.length === 0) {
      await postMessage(
        channel,
        'No holdings tracked yet. Add some with "DEMETER, add <qty> <ticker>".',
      )
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
    let result
    const { priced, unavailable } = await getPricedHoldings(holdingInputs, 'GBP')

    if (priced.length === 0) {
      const snap = await getLastSnapshot()
      const fallback = snap
        ? `No live prices available. Last known value: £${snap.total_value.toFixed(2)} (${new Date(snap.taken_at * 1000).toLocaleDateString('en-GB')})`
        : 'No live prices available and no snapshot on file yet.'
      await postMessage(channel, fallback)
      return 'prices unavailable, no snapshot'
    }

    const config = { baseCurrency: 'GBP', concentrationThreshold: 25, dayMoveThreshold: 5 }
    result = computePortfolio(priced, config, unavailable)
    await saveSnapshot(result)

    const brief = formatBrief(result)
    await postMessage(channel, brief)
    return `brief posted: ${rows.length} holdings, value ${result.totalValue}`
  })
}

// ─── Chat handlers ────────────────────────────────────────────────────────────

export async function handlePortfolioBrief(channel: string, slackUser?: string): Promise<void> {
  await buildBrief(channel, slackUser)
}

export async function handleAddHolding(
  ticker: string,
  quantity: number,
  avgCost: number,
  currency: string,
  channel: string,
  slackUser?: string,
): Promise<void> {
  await logActivity(
    'demeter_add',
    `ticker=${ticker} qty=${quantity} cost=${avgCost} ccy=${currency}`,
    slackUser,
    async () => {
      await addHolding(ticker, null, quantity, avgCost, currency)
      const costStr = avgCost > 0 ? ` at ${currency} ${avgCost}` : ''
      await postMessage(channel, `Added ${quantity} ${ticker}${costStr}.`)
      return `added ${ticker}`
    },
  )
}

export async function handleRemoveHolding(
  ticker: string,
  channel: string,
  slackUser?: string,
): Promise<void> {
  await logActivity('demeter_remove', `ticker=${ticker}`, slackUser, async () => {
    const removed = await removeHolding(ticker)
    if (removed) {
      await postMessage(channel, `Removed ${ticker} from your holdings.`)
      return `removed ${ticker}`
    } else {
      await postMessage(channel, `${ticker} not found in your holdings.`)
      return `${ticker} not found`
    }
  })
}

export async function handleUpdateHolding(
  ticker: string,
  quantity: number,
  channel: string,
  slackUser?: string,
): Promise<void> {
  await logActivity('demeter_update', `ticker=${ticker} qty=${quantity}`, slackUser, async () => {
    const updated = await updateHolding(ticker, { quantity })
    if (updated) {
      await postMessage(channel, `Updated ${ticker} to ${quantity} shares.`)
      return `updated ${ticker}`
    } else {
      await postMessage(channel, `${ticker} not found. Use "DEMETER, add" to create it.`)
      return `${ticker} not found`
    }
  })
}

export async function handleListHoldings(channel: string, slackUser?: string): Promise<void> {
  await logActivity('demeter_list', 'list', slackUser, async () => {
    const rows = await listHoldings()
    if (rows.length === 0) {
      await postMessage(channel, 'No holdings tracked. Add some with "DEMETER, add <qty> <ticker>".')
      return 'empty'
    }
    const lines = rows.map(
      r =>
        `${r.ticker.padEnd(6)} ${String(r.quantity).padStart(12)}  ${r.currency}${r.avg_cost > 0 ? `  cost ${r.avg_cost}` : ''}`,
    )
    await postMessage(channel, `*Holdings (${rows.length})*\n${lines.join('\n')}`)
    return `listed ${rows.length}`
  })
}

export async function handleAllocation(channel: string, slackUser?: string): Promise<void> {
  await logActivity('demeter_allocation', 'allocation', slackUser, async () => {
    const rows = await listHoldings()
    if (rows.length === 0) {
      await postMessage(channel, 'No holdings tracked yet.')
      return 'empty'
    }
    const holdingInputs: Holding[] = rows.map(r => ({
      ticker: r.ticker,
      name: r.name ?? undefined,
      quantity: r.quantity,
      avgCost: r.avg_cost,
      currency: r.currency,
    }))
    const { priced, unavailable } = await getPricedHoldings(holdingInputs, 'GBP')
    if (priced.length === 0) {
      await postMessage(channel, 'Prices unavailable — cannot compute allocation right now.')
      return 'prices unavailable'
    }
    const result = computePortfolio(priced, { baseCurrency: 'GBP', concentrationThreshold: 25, dayMoveThreshold: 5 }, unavailable)
    const lines = result.holdings
      .sort((a, b) => b.allocation - a.allocation)
      .map(h => `${h.ticker.padEnd(6)} ${h.allocation.toFixed(1).padStart(6)}%`)
    await postMessage(channel, `*Allocation (${result.baseCurrency})*\n${lines.join('\n')}`)
    return `allocation for ${rows.length} holdings`
  })
}

export async function handleNewsStub(ticker: string, channel: string, slackUser?: string): Promise<void> {
  await postMessage(channel, `News summaries for ${ticker} are coming soon — pending Claude integration.`)
}

export async function handleSeedHoldings(channel: string, slackUser?: string): Promise<void> {
  await logActivity('demeter_seed', 'seed real holdings', slackUser, async () => {
    await seedRealHoldings()
    const rows = await listHoldings()
    await postMessage(channel, `Seeded ${rows.length} real holdings. Reply "DEMETER, list holdings" to verify.`)
    return `seeded ${rows.length}`
  })
}
