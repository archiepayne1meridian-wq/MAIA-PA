// MAP (codename atlas) — Claude calls only. Pure DB access lives in tools/map-db.ts.

import { askWith } from './claude'

const SONNET = 'claude-sonnet-4-6'

const SUMMARY_SYSTEM_PROMPT = `You are a research assistant for a wealth management trainee at deVere Group in Geneva.

Given a company name, type, and sector, write a concise intelligence brief covering:
1. What the company does (2 sentences max)
2. Who typically works there — seniority mix, nationalities, expat presence
3. Why this is relevant for cross-border financial planning (pension exposure, international mobility, UK/AU/SA connections)
4. Any Swiss office context — is this a HQ or satellite? Other Swiss locations?
5. One tactical note — what angle works for prospecting here

Keep it tight. 150 words max. No bullet points — write in short punchy sentences.
Do not make up specific facts you don't know — say "likely" or "typically" where uncertain.`

export async function generateCompanySummary(
  name: string,
  type: string,
  sector: string | null,
  area: string | null,
): Promise<string> {
  const userText = `Company: ${name}\nType: ${type}\nSector: ${sector ?? 'Unknown'}\nGeneva area: ${area ?? 'Geneva'}`
  const raw = await askWith(SUMMARY_SYSTEM_PROMPT, userText, 300, SONNET)
  return raw.trim()
}
