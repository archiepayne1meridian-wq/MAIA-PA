// MAP (codename atlas) — Claude calls only. Pure DB access lives in tools/map-db.ts.

import { askWith } from './claude'
import { extractJson } from './format'

const SONNET = 'claude-sonnet-4-6'

const SUMMARY_PROMPT = `You are writing permanent intelligence for a wealth management prospector's territory map.

Given a company name, type, sector, and area, write exactly THREE lines. No paragraphs, no bullet points, no preamble.

Line 1 — WHAT THEY DO: One sentence. What this specific office does (not global company history). Is it a HQ, regional office, manufacturing site, research campus?

Line 2 — WHO'S THERE: One sentence. What type of people work there — seniority level, job functions, and likely nationalities. Be specific: "senior managers and finance directors, heavy expat mix, Brits and Australians common" is useful. "Professionals" is not.

Line 3 — OFFICE TYPE: Half a sentence. Regional HQ / European HQ / Global HQ / Satellite office / Manufacturing / Research campus / Trading floor. And whether decision-makers are on site.

Format your response as JSON:
{
  "what_they_do": "...",
  "who_is_there": "...",
  "office_type": "..."
}

Be direct. No filler. Under 25 words per field.`

// Returns the raw JSON string exactly as stored in map_companies.ai_summary —
// the caller (company-summary route) persists it as-is; the frontend parses
// it back out, with a plain-text fallback for any summary generated before
// this structured format existed.
export async function generateCompanySummary(
  name: string,
  type: string,
  sector: string | null,
  area: string | null,
): Promise<string> {
  const userText = `Company: ${name}\nType: ${type}\nSector: ${sector ?? 'Unknown'}\nArea: ${area ?? 'Geneva'}`
  const raw = await askWith(SUMMARY_PROMPT, userText, 200, SONNET)
  try {
    const parsed = JSON.parse(extractJson(raw)) as { what_they_do?: string; who_is_there?: string; office_type?: string }
    if (parsed.what_they_do && parsed.who_is_there && parsed.office_type) return JSON.stringify(parsed)
  } catch { /* fall through to raw text below */ }
  return raw.trim()
}
