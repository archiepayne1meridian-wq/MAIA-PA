import { askWith } from './claude'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OracleWorkHistoryItem {
  employer: string
  role: string
  location: string
  country: string
  years: number
  date_from: string
  date_to: string
  pension_type: string
  salary_range_estimate: string
  pension_estimate: {
    currency: string
    low: number
    high: number
    notes: string
  }
}

export interface OracleAnalysis {
  prospect: {
    name: string | null
    current_role: string
    current_employer: string
    current_location: string
    nationality_estimate: string | null
    years_in_switzerland: number | null
  }
  work_history: OracleWorkHistoryItem[]
  pension_summary: {
    uk_pensions: {
      count: number
      total_low: number
      total_high: number
      currency: 'GBP'
      includes_db: boolean
      db_details: string | null
      state_pension_qualifying_years: number
      state_pension_status: string
      isa_likely: boolean
    }
    swiss_pensions: {
      pillar_2_employers: number
      vested_benefits_low: number
      vested_benefits_high: number
      currency: 'CHF'
      current_pillar_2_building: boolean
      pillar_3_possible: boolean
    }
    other_pensions: {
      country: string
      type: string
      estimated_value: string
      currency: string
      notes: string
    }[]
  }
  key_flags: {
    flag: string
    severity: 'high' | 'medium' | 'low'
    detail: string
  }[]
  conversation_angles: string[]
  hermes_scenario: string
  opening_line_suggestion: string
  fact_find_priorities: string[]
  disclaimer: string
}

// Real HERMES scenario ids — src/lib/hermes-scenarios-data.ts. Constraining the
// prompt to these exact slugs (rather than the looser names a human would use)
// is what makes the "clickable, opens HERMES to that scenario" deep link reliable.
const HERMES_SCENARIO_IDS = [
  'new-to-switzerland',
  'uk-connected',
  'leaving-switzerland',
  'restructuring-job-loss',
  'iht-pension-angle',
  'market-drop-volatility',
  'second-door-no-uk-pension',
  'investments-exclusive-access',
  'international-professional-non-uk',
  'cash-pile',
  'repatriation-to-uk',
] as const

const DISCLAIMER = 'All figures are estimates based on publicly available salary data and typical contribution rates. Actual values must be established in the fact find. This is an internal planning tool only — never share estimates with the prospect.'

const ORACLE_SYSTEM = `You are analysing a LinkedIn work history to estimate what pension and
financial assets this person likely holds.

RULES:
- Use industry knowledge of typical salary ranges by role, seniority,
  and sector
- Use knowledge of pension contribution rates by country and employer type
- Be honest about uncertainty — always give ranges not precise figures
- Never invent specific details not inferable from the work history
- Flag anything that needs clarification in the fact find

UK PENSION RULES TO APPLY:
- DC pensions: employer + employee contributions, typical 5-15% combined
- DB pensions: public sector (NHS, teaching, civil service, military)
  and some legacy private sector roles pre-2000s
- State pension: 35 qualifying years needed for full amount (£221.20/wk 2024)
  Count UK working years to estimate qualifying years
- ISA: likely if worked in UK, frozen once non-resident
- Pension access age: 55 currently, 57 from 2028

UK INHERITANCE TAX (IHT) RULES TO APPLY:
- From 6 April 2025, UK IHT exposure is residence-based: someone UK tax
  resident for 10 of the last 20 tax years has their WORLDWIDE estate in
  scope for UK IHT (40% above the nil rate band of £325,000), regardless
  of domicile
- After leaving the UK, this exposure has a tail of 3-10 years depending
  on how long they were UK resident before leaving
- From April 2027, unused UK pension funds come inside the estate for IHT
  purposes for the first time — previously pensions sat outside the estate
- Always check total UK working/residency years from the work history. If
  they meet or are close to the 10-of-20-year threshold, this MUST be
  raised as a high severity key_flag — it is one of the most commercially
  important angles for an internationally mobile client

SWISS PENSION RULES TO APPLY:
- Pillar 1 (AHV): mandatory for Swiss residents, contributions build over time
  Full pension requires 44 years. Expats rarely qualify for full amount.
- Pillar 2 (BVG): mandatory occupational pension for employees earning over
  CHF 22,050/year. Both employer and employee contribute.
  When leaving an employer: funds transfer to vested benefits account
  When leaving Switzerland: can withdraw (tax applies by destination country)
  Current Swiss Pillar 2 cash interest: ~0.02% if left in default
- Pillar 3a: voluntary, up to CHF 7,258/year (2026), tax deductible

OTHER JURISDICTIONS:
- UAE/Gulf: no mandatory pension, gratuity payment on leaving employer
  (typically 21 days salary per year for first 5 years)
- South Africa: occupational pension funds, preservation funds on leaving
- Australia: superannuation — 11% employer contribution mandatory
- Germany: state pension (Deutsche Rentenversicherung) — contributions
  based on earnings
- France: multiple mandatory schemes (CNAV, ARRCO, AGIRC)
- Ireland: state pension + occupational schemes

ANALYSIS INSTRUCTIONS:
1. Parse every role — employer, location, duration, seniority
2. For each role identify: country, likely pension type, estimated salary range
3. Calculate estimated pension value for each role
4. Identify vested benefits (Swiss Pillar 2 from previous employers)
5. Flag any DB pensions (high value, complex — always flag)
5.5. Assess UK IHT residence exposure per the rules above — flag as high severity if the 10-of-20-year threshold is met or close to it
6. Estimate state pension qualifying years
7. Identify likely ISA/savings if UK-based early career
8. Note any gaps or ambiguities
9. Generate conversation angles based on what you found
10. Suggest which HERMES scenario fits best — pick exactly one id from this list:
    ${HERMES_SCENARIO_IDS.join(', ')}

Return JSON only — no preamble, no explanation outside the JSON.
JSON schema:
{
  "prospect": {
    "name": string | null,
    "current_role": string,
    "current_employer": string,
    "current_location": string,
    "nationality_estimate": string | null,
    "years_in_switzerland": number | null
  },
  "work_history": [{
    "employer": string, "role": string, "location": string, "country": string,
    "years": number, "date_from": string, "date_to": string,
    "pension_type": string, "salary_range_estimate": string,
    "pension_estimate": { "currency": string, "low": number, "high": number, "notes": string }
  }],
  "pension_summary": {
    "uk_pensions": {
      "count": number, "total_low": number, "total_high": number, "currency": "GBP",
      "includes_db": boolean, "db_details": string | null,
      "state_pension_qualifying_years": number, "state_pension_status": string,
      "isa_likely": boolean
    },
    "swiss_pensions": {
      "pillar_2_employers": number, "vested_benefits_low": number, "vested_benefits_high": number,
      "currency": "CHF", "current_pillar_2_building": boolean, "pillar_3_possible": boolean
    },
    "other_pensions": [{ "country": string, "type": string, "estimated_value": string, "currency": string, "notes": string }]
  },
  "key_flags": [{ "flag": string, "severity": "high" | "medium" | "low", "detail": string }],
  "conversation_angles": string[],
  "hermes_scenario": string,
  "opening_line_suggestion": string,
  "fact_find_priorities": string[],
  "disclaimer": "${DISCLAIMER}"
}`

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export async function analyseLinkedIn(linkedinText: string): Promise<OracleAnalysis> {
  const raw = await askWith(ORACLE_SYSTEM, linkedinText, 4096)
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`ORACLE analysis returned unparseable JSON: ${raw.slice(0, 200)}`)
  }
  if (!isRecord(parsed)) throw new Error('ORACLE analysis did not return an object')

  const p = parsed as Partial<OracleAnalysis>
  if (!p.prospect || !p.pension_summary) {
    throw new Error('ORACLE analysis missing required prospect/pension_summary fields')
  }

  const hermesScenario = typeof p.hermes_scenario === 'string' && (HERMES_SCENARIO_IDS as readonly string[]).includes(p.hermes_scenario)
    ? p.hermes_scenario
    : (p.hermes_scenario as string) ?? ''

  return {
    prospect: p.prospect,
    work_history: Array.isArray(p.work_history) ? p.work_history : [],
    pension_summary: p.pension_summary,
    key_flags: Array.isArray(p.key_flags) ? p.key_flags : [],
    conversation_angles: Array.isArray(p.conversation_angles) ? p.conversation_angles : [],
    hermes_scenario: hermesScenario,
    opening_line_suggestion: p.opening_line_suggestion ?? '',
    fact_find_priorities: Array.isArray(p.fact_find_priorities) ? p.fact_find_priorities : [],
    disclaimer: p.disclaimer ?? DISCLAIMER,
  }
}

// ─── MUSE filing helpers ────────────────────────────────────────────────────

// muse_cases.display_name is deliberately anonymised elsewhere in the codebase
// (first name + last initial, never a full surname — see tools/muse-cases.ts).
// ORACLE follows that same convention rather than filing the prospect's full
// LinkedIn name verbatim into a Tier 2 case record.
export function toDisplayName(fullName: string | null): string {
  if (!fullName?.trim()) return 'Unknown'
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

export function buildFinancialProfile(analysis: OracleAnalysis): string {
  const lines: string[] = []
  const uk = analysis.pension_summary.uk_pensions
  const ch = analysis.pension_summary.swiss_pensions

  if (uk.count > 0) {
    const dbNote = uk.includes_db ? ` | DB pension${uk.db_details ? ` (${uk.db_details})` : ''} (flag)` : ''
    lines.push(`UK pensions: ${uk.count} pot${uk.count !== 1 ? 's' : ''} estimated £${uk.total_low.toLocaleString()}-${uk.total_high.toLocaleString()} total${dbNote}`)
  }
  if (ch.pillar_2_employers > 0) {
    const buildingNote = ch.current_pillar_2_building ? ' | Currently building Pillar 2' : ''
    lines.push(`Swiss: ${ch.pillar_2_employers} vested benefits account${ch.pillar_2_employers !== 1 ? 's' : ''} estimated CHF ${ch.vested_benefits_low.toLocaleString()}-${ch.vested_benefits_high.toLocaleString()}${buildingNote}`)
  }
  for (const other of analysis.pension_summary.other_pensions) {
    lines.push(`${other.country}: ${other.type} — ${other.estimated_value}`)
  }
  if (uk.state_pension_qualifying_years > 0 || uk.state_pension_status) {
    lines.push(`State pension: ${uk.state_pension_status}`)
  }
  const topFlag = [...analysis.key_flags].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0]
  if (topFlag) lines.push(`Key flag: ${topFlag.flag}`)

  return lines.join('\n')
}

function severityRank(s: string): number {
  return s === 'high' ? 2 : s === 'medium' ? 1 : 0
}

export function buildAnglesSummary(analysis: OracleAnalysis): string {
  return analysis.conversation_angles.join(' | ')
}
