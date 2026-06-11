import { findAdviceWords, type PortfolioResult, type HoldingResult } from '../../tools/portfolio'
import { askWith } from './claude'

// ─── Brief formatting ─────────────────────────────────────────────────────────

export function formatBrief(
  result: PortfolioResult,
  news?: string,
  opts: { strict?: boolean } = {},
): string {
  const { strict = false } = opts
  const lines: string[] = []

  // Header
  lines.push('*DEMETER — Portfolio Brief*')
  if (result.pricesUnavailable.length > 0) {
    lines.push(`⚠ Prices unavailable for ${result.pricesUnavailable.join(', ')} — figures may be incomplete.`)
  }
  lines.push('')

  // Summary row
  const value = fmt(result.totalValue, result.baseCurrency)
  const daySign = result.dayChange >= 0 ? '+' : ''
  const dayAmt = fmt(Math.abs(result.dayChange), result.baseCurrency)
  const dayPct = `${result.dayChange >= 0 ? '+' : ''}${result.dayChangePct}%`
  lines.push(`*Total value:* ${value}   *Day:* ${daySign}${dayAmt} (${dayPct})`)

  if (result.totalPnl !== null) {
    const pnlSign = result.totalPnl >= 0 ? '+' : ''
    lines.push(`*Total P&L:* ${pnlSign}${fmt(result.totalPnl, result.baseCurrency)}`)
  }
  lines.push('')

  // Holdings table
  if (result.holdings.length === 0) {
    lines.push('_No holdings tracked yet. Add some with "DEMETER, add <qty> <ticker>"._')
  } else {
    lines.push('*Holdings*')
    lines.push(holdingsTable(result.holdings, result.baseCurrency))
  }

  // Risk flags
  if (result.flags.length > 0) {
    lines.push('')
    lines.push('*Flags*')
    for (const flag of result.flags) {
      // Scan each flag — our code wrote it, should never contain advice words
      const violations = findAdviceWords(flag.message)
      if (violations.length > 0) {
        const msg = `[DEMETER] Advice words in flag for ${flag.ticker}: ${violations.join(', ')}`
        if (strict) throw new Error(msg)
        console.error(msg)
        continue // omit the offending flag rather than silently emit it
      }
      lines.push(`• ${flag.message}`)
    }
  }

  const ownProse = lines.join('\n')

  // Scan full own prose (excluding attributed news)
  const ownViolations = findAdviceWords(ownProse)
  if (ownViolations.length > 0) {
    const msg = `[DEMETER] Advice words detected in brief prose: ${ownViolations.join(', ')}`
    if (strict) throw new Error(msg)
    console.error(msg)
    // Continue — return the brief without the offending section already omitted above
  }

  // Append attributed news separately — not scanned (third-party content)
  if (news) {
    return ownProse + '\n\n*News*\n' + news
  }

  return ownProse
}

function fmt(amount: number, currency: string): string {
  const symbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : `${currency} `
  return `${symbol}${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function holdingsTable(hs: HoldingResult[], baseCurrency: string): string {
  return hs
    .map(h => {
      const value = fmt(h.value, baseCurrency)
      const daySign = h.dayChangePct >= 0 ? '+' : ''
      const pnlStr =
        h.pnl !== null
          ? `  P&L ${h.pnl >= 0 ? '+' : ''}${fmt(h.pnl, baseCurrency)}`
          : ''
      return `${h.ticker.padEnd(6)} ${String(h.quantity).padStart(12)}  ${value.padStart(12)}  ${h.allocation}%  ${daySign}${h.dayChangePct}%${pnlStr}`
    })
    .join('\n')
}

// ─── News summarisation ───────────────────────────────────────────────────────
// HARD STOP: this function is a stub until Step 13 (news Claude call).
// After go-ahead, replace the stub with the real implementation below.

const NEWS_SYSTEM = `You are DEMETER, a portfolio monitoring assistant. Summarise the following news items for ticker {{TICKER}} into 2–3 bullet points of material facts relevant to an investor who holds the stock.

Rules:
- Report facts only. No opinion, no recommendation, no "you should", no buy/sell signals.
- Keep each bullet to one sentence.
- If no material news: reply "No material news found."
- Output plain text, bullets starting with •.`

export async function summariseNews(ticker: string, items: string[]): Promise<string> {
  if (items.length === 0) return 'No material news found.'

  const system = NEWS_SYSTEM.replace('{{TICKER}}', ticker)
  const prompt = `Ticker: ${ticker}\n\nNews items:\n${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}`
  const raw = await askWith(system, prompt, 512)
  return raw.trim()
}
