// VICTORIA — tally parsing, scorecard formatting, and (stub) narrative.
// parseTally: deterministic-first; Claude fallback only after Step 4 go-ahead.
// formatScorecard: always deterministic — never let the model total or trend numbers.

import type { DailyMetrics, WeeklyTotals, ComparisonItem, TargetItem, TrendDirection } from '../../tools/kpi'

// ── Config types (parsed from context/victoria.md at runtime) ─────────────────

export interface VictoriaConfig {
  metrics: string[]
  targets: Record<string, number | null>
  nudgeTime: string    // e.g. "18:00"
  scorecardDay: string // e.g. "Friday"
}

// ── Tally parsing (deterministic first) ──────────────────────────────────────
//
// Extracts numbers from natural language against the configured metric list.
// Understands aliases (e.g. "meeting" → meetings_booked, "dials" → calls).
// Returns only the metrics it found — partial tallies are fine.

const METRIC_ALIASES: Record<string, string[]> = {
  calls:           ['call', 'calls', 'dial', 'dials', 'ring', 'rings', 'phoned', 'phone'],
  connects:        ['connect', 'connects', 'connection', 'connections', 'spoke', 'reached', 'got through', 'answered'],
  meetings_booked: ['meeting booked', 'meetings booked', 'booked', 'appointment booked',
                    'appointments booked', 'set', 'meeting set', 'scheduled'],
  meetings_held:   ['meeting held', 'meetings held', 'meeting happened', 'had a meeting', 'met with',
                    'meeting done', 'meetings done', 'completed meeting'],
  follow_ups:      ['follow up', 'follow ups', 'follow-up', 'follow-ups', 'followed up', 'chased'],
  new_prospects:   ['new prospect', 'new prospects', 'lead', 'leads', 'new lead', 'new leads',
                    'prospect added', 'prospects added'],
  active_clients:  ['active client', 'active clients', 'client', 'clients'],
}

// Sort aliases longest-first to match greedily (e.g. "meetings booked" before "meetings")
const SORTED_ALIASES = Object.entries(METRIC_ALIASES).map(([metric, aliases]) => ({
  metric,
  patterns: [...aliases].sort((a, b) => b.length - a.length),
}))

export function parseTallyDeterministic(text: string, metrics: string[]): DailyMetrics {
  const lower = text.toLowerCase()
  const result: DailyMetrics = {}

  for (const { metric, patterns } of SORTED_ALIASES) {
    if (!metrics.includes(metric)) continue

    for (const alias of patterns) {
      // Match: "<number> <alias>" or "<alias> <number>" or "<number> <alias>s"
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const patterns_rx = [
        new RegExp(`(\\d+)\\s+${escaped}(?:s|ed)?`, 'i'),
        new RegExp(`${escaped}(?:s|ed)?\\s*[:\\-]?\\s*(\\d+)`, 'i'),
      ]
      for (const rx of patterns_rx) {
        const m = lower.match(rx)
        if (m) {
          const num = parseInt(m[1] ?? m[2] ?? '0', 10)
          if (!isNaN(num) && !(metric in result)) {
            result[metric] = num
          }
          break
        }
      }
      if (metric in result) break
    }
  }

  return result
}

// Stub: Claude fallback throws until Step 4 go-ahead.
export async function parseTallyWithClaude(
  _text: string,
  _metrics: string[],
): Promise<DailyMetrics> {
  throw new Error('[victoria] parseTally Claude fallback not yet enabled — awaiting go-ahead')
}

// Main entry point: try deterministic; if fewer than half the expected metrics
// are found AND the text seems to contain numbers, mark as needing Claude fallback.
export function parseTally(text: string, metrics: string[]): {
  parsed: DailyMetrics
  needsClaude: boolean
  found: string[]
} {
  const parsed = parseTallyDeterministic(text, metrics)
  const found = Object.keys(parsed)

  // Needs Claude if: text has digits but we found nothing, or found very little
  // relative to what the text seems to mention
  const hasNumbers = /\d/.test(text)
  const needsClaude = hasNumbers && found.length === 0

  return { parsed, needsClaude, found }
}

// ── Echo-confirm formatter ────────────────────────────────────────────────────

// Returns the echo-and-confirm message to send back to the user before storing.
export function formatEchoConfirm(
  metrics: DailyMetrics,
  isOverwrite: boolean,
  metricLabels: Record<string, string> = {},
): string {
  if (Object.keys(metrics).length === 0) {
    return `_VICTORIA: couldn't read any numbers from that — try something like "8 calls, 2 meetings booked, 5 follow-ups"._`
  }

  const parts = Object.entries(metrics)
    .map(([k, v]) => `${v} ${metricLabels[k] ?? k.replace(/_/g, ' ')}`)
    .join(' · ')

  const prefix = isOverwrite ? '*Overwriting today\'s log:* ' : '*Logged for today:* '
  return `${prefix}${parts}\n_Looks right? Reply "yes" to confirm, or send a correction._`
}

// ── Scorecard rendering (deterministic) ──────────────────────────────────────

export interface ScorecardData {
  weekStart: Date
  totals: WeeklyTotals
  comparison: ComparisonItem[]
  targets: TargetItem[]
  trends: Record<string, TrendDirection>
  daysCounted: number
}

const TREND_ARROW: Record<TrendDirection, string> = { up: '↑', down: '↓', flat: '→' }

function metricLabel(metric: string): string {
  return metric.replace(/_/g, ' ')
}

export function formatScorecard(data: ScorecardData): string {
  const { weekStart, totals, comparison, targets, trends, daysCounted } = data
  const weekLabel = weekStart.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })

  const lines: string[] = [
    `*VICTORIA — Weekly Scorecard* · w/c ${weekLabel} · ${daysCounted} day${daysCounted !== 1 ? 's' : ''} logged`,
    '',
  ]

  // Build rows for each tracked metric
  for (const [metric, total] of Object.entries(totals)) {
    const label = metricLabel(metric)
    const trendDir = trends[metric] ?? 'flat'
    const arrow = TREND_ARROW[trendDir]

    const comp = comparison.find(c => c.metric === metric)
    let changeStr = ''
    if (comp?.isBaseline) {
      changeStr = ' · _first week_'
    } else if (comp && comp.delta !== null) {
      const sign = comp.delta > 0 ? '+' : ''
      const pctStr = comp.pct !== null ? ` (${comp.pct > 0 ? '+' : ''}${comp.pct}%)` : ''
      changeStr = ` · ${sign}${comp.delta}${pctStr}`
    }

    const targetItem = targets.find(t => t.metric === metric)
    let targetStr = ''
    if (targetItem && targetItem.status !== 'no_target' && targetItem.target !== null) {
      const icon = targetItem.status === 'on_track' ? '✓' : '·'
      targetStr = `  ${icon} target ${targetItem.target}`
    }

    lines.push(`${arrow} *${label}:* ${total}${changeStr}${targetStr}`)
  }

  lines.push('')

  // Supportive note for down metrics (constructive, never shaming)
  const downMetrics = comparison
    .filter(c => !c.isBaseline && (c.delta ?? 0) < 0)
    .map(c => metricLabel(c.metric))

  if (downMetrics.length > 0 && downMetrics.length <= 2) {
    lines.push(`_${downMetrics.join(' and ')} quieter this week — worth a push next week._`)
  } else if (daysCounted < 3) {
    lines.push(`_Week still early — ${daysCounted} day${daysCounted !== 1 ? 's' : ''} in so far._`)
  }

  return lines.join('\n')
}

// Stub: scorecardNarrative throws until Step 4 go-ahead.
export async function scorecardNarrative(_data: ScorecardData): Promise<string> {
  throw new Error('[victoria] scorecardNarrative not yet enabled — awaiting go-ahead')
}
