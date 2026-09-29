// Shared formatting utilities — single source of truth for logic duplicated
// across the visualizer calculators and the Claude-response JSON extractors.

export function formatGBP(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
  }).format(amount)
}

export function formatCHF(amount: number): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency', currency: 'CHF', maximumFractionDigits: 0,
  }).format(amount)
}

// Signed percentage, e.g. "+12.5%" / "-3.0%" — matches the visualizers' convention.
export function fmtPct(n: number, dp = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%`
}

// Pulls the JSON substring out of a Claude response (fenced code block, or the
// outermost {...}). Returns the raw string — callers JSON.parse it themselves
// so they can attach their own error context.
export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenced?.[1]) return fenced[1].trim()
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) return raw.slice(first, last + 1)
  return raw.trim()
}
