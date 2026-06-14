// CASSANDRA — brief formatter and news digestor.
//
// formatBrief: deterministic. Runs the advice-word guard on CASSANDRA's own prose only.
// digestNews:  Claude call. HARD STOP stub until explicitly enabled — throws if called.

import type { IndexQuote, FxQuote } from '../../tools/market-data'
import type { FeedItem } from '../../tools/feeds'

// Advice words: whole-word, case-insensitive. Applied to CASSANDRA's prose only.
// Must NOT trip on: "holdings", "operating", "buyback", "threshold", "withholding"
const ADVICE_WORD_RE = /\b(buy|sell|hold|consider|recommend(?:ation)?|should|trim|rating|price target|add to)\b/i

function guardProse(text: string, section: string): string | null {
  const match = ADVICE_WORD_RE.exec(text)
  if (match) {
    console.error(
      `[cassandra] Advice-word guard tripped in "${section}" on word "${match[0]}" — omitting section.`,
    )
    return null
  }
  return text
}

function fmtPct(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

export function formatBrief(
  indices: IndexQuote[],
  fx: FxQuote[],
  regulatory: FeedItem[],
  news: FeedItem[],
  digests: Map<string, string>,  // item.link → one-liner; empty map until digestNews is live
  skipped: string[],
): string {
  const sections: string[] = []

  // ── Markets ──────────────────────────────────────────────────────────────
  if (indices.length > 0) {
    const lines = indices.map(q => `${q.symbol} ${q.level.toLocaleString('en-GB')} ${fmtPct(q.dayChangePct)}`).join(' · ')
    const prose = `*Markets*\n${lines}`
    const guarded = guardProse(prose, 'Markets')
    if (guarded) sections.push(guarded)
  }

  // ── FX ───────────────────────────────────────────────────────────────────
  if (fx.length > 0) {
    const lines = fx.map(q => `${q.pair} ${q.rate.toFixed(4)} ${fmtPct(q.dayChangePct)}`).join(' · ')
    const prose = `*FX*\n${lines}`
    const guarded = guardProse(prose, 'FX')
    if (guarded) sections.push(guarded)
  }

  // ── Regulatory ───────────────────────────────────────────────────────────
  if (regulatory.length > 0) {
    const lines = regulatory.map(item => {
      const digest = digests.get(item.link)
      const text   = digest ?? item.title
      return `• ${text} — <${item.link}|${item.source}>`
    }).join('\n')
    const prose = `*Regulatory*\n${lines}`
    const guarded = guardProse(prose, 'Regulatory')
    if (guarded) sections.push(guarded)
  }

  // ── Headlines ────────────────────────────────────────────────────────────
  if (news.length > 0) {
    const lines = news.map(item => {
      const digest = digests.get(item.link)
      const text   = digest ?? item.title
      return `• ${text} — <${item.link}|${item.source}>`
    }).join('\n')
    const prose = `*Headlines*\n${lines}`
    const guarded = guardProse(prose, 'Headlines')
    if (guarded) sections.push(guarded)
  }

  if (sections.length === 0) {
    return '⚠ CASSANDRA: no data available for this brief.'
  }

  let msg = `*CASSANDRA — Morning Brief*\n\n` + sections.join('\n\n')

  if (skipped.length > 0) {
    msg += `\n\n_⚠ Some sources unavailable: ${skipped.join(', ')}_`
  }

  return msg
}

// HARD STOP — digestNews is not yet enabled.
// Wire it only after explicit "go ahead" from the user (Step 6).
export async function digestNews(
  _items: FeedItem[],
  _section: string,
): Promise<Map<string, string>> {
  throw new Error('[cassandra] digestNews not yet enabled — awaiting go-ahead')
}
