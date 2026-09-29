// Seeds every MAIA preference Archie has stated across this build session —
// CASSANDRA filter rules, IRIS voice/style rules, DIANA roleplay behaviour,
// HERMES call-script behaviour, and cross-agent general rules.
//
// Idempotent — re-running skips any (category, rule_key) pair that already
// exists, so it's safe to run again after adding new preferences to the list.
//
// Run: npx tsx --env-file=.env scripts/seed-preferences.ts

import path from 'path'
process.loadEnvFile(path.join(process.cwd(), '.env'))

import { getDb } from '../src/db'
import { maia_preferences } from '../src/db/schema'
import { eq, and, count } from 'drizzle-orm'

interface PreferenceSeed {
  category: string
  rule_type: 'exclude' | 'include' | 'style' | 'behaviour'
  rule_key: string
  rule_value: string
}

export const preferences: PreferenceSeed[] = [
  // CASSANDRA exclusions
  { category: 'cassandra', rule_type: 'exclude', rule_key: 'crypto',
    rule_value: 'Never include cryptocurrency, bitcoin, blockchain, NFT, or digital asset news' },
  { category: 'cassandra', rule_type: 'exclude', rule_key: 'fca_hearings',
    rule_value: 'Never include FCA hearings, enforcement actions, fines, or individual bans — new rules only' },
  { category: 'cassandra', rule_type: 'exclude', rule_key: 'individual_stocks',
    rule_value: 'Never include individual stock picks, earnings per share, analyst ratings, or IPO filings' },
  { category: 'cassandra', rule_type: 'include', rule_key: 'broad_market',
    rule_value: 'Include broad market moves — crashes, corrections, sector-wide drops, bond market moves' },
  { category: 'cassandra', rule_type: 'include', rule_key: 'swiss_companies',
    rule_value: 'Always include restructuring, mergers, job cuts at major Swiss employers — Novartis, Roche, UBS, Nestle, ABB, Trafigura, Philip Morris, Lonza' },
  { category: 'cassandra', rule_type: 'include', rule_key: 'uk_pension_tax',
    rule_value: 'Always include UK pension changes, IHT changes, tax legislation affecting expats' },
  { category: 'cassandra', rule_type: 'include', rule_key: 'iht_2027',
    rule_value: 'April 2027 IHT on pension death benefits is always relevant — include any updates' },

  // IRIS preferences
  { category: 'iris', rule_type: 'exclude', rule_key: 'crypto_posts',
    rule_value: 'Never generate posts about cryptocurrency, bitcoin, blockchain, or digital assets' },
  { category: 'iris', rule_type: 'style', rule_key: 'post_format',
    rule_value: 'Always: 3-line hook that makes people stop scrolling, bullet points or short punchy lines, one question at the end' },
  { category: 'iris', rule_type: 'style', rule_key: 'voice',
    rule_value: 'Direct, punchy, conversational. Never corporate. Never "I am excited to share". Sounds like Archie talking not writing.' },
  { category: 'iris', rule_type: 'style', rule_key: 'sports_topics',
    rule_value: 'Golf, padel, F1, football (Chelsea) — always welcome as hooks with a financial twist' },
  { category: 'iris', rule_type: 'behaviour', rule_key: 'no_advice',
    rule_value: 'Never give financial advice. Always create discussion. Always present both sides.' },
  { category: 'iris', rule_type: 'behaviour', rule_key: 'target_audience',
    rule_value: 'Target: people living in Switzerland with assets in another country. Every post should make them think it affects them.' },

  // DIANA preferences
  { category: 'diana', rule_type: 'behaviour', rule_key: 'resistance',
    rule_value: 'Prospects must be vague and resistant. One sentence answers only. Never volunteers information unprompted.' },
  { category: 'diana', rule_type: 'behaviour', rule_key: 'scenario_match',
    rule_value: 'Scenario should match today CASSANDRA angle when available' },

  // HERMES preferences
  { category: 'hermes', rule_type: 'behaviour', rule_key: 'no_product_names',
    rule_value: 'Never name a product on the call. Lead to the need, never to the solution.' },
  { category: 'hermes', rule_type: 'behaviour', rule_key: 'funnel',
    rule_value: 'Always funnel: week → day → time. Stephen Smith named in close.' },

  // General preferences
  { category: 'general', rule_type: 'behaviour', rule_key: 'anonymisation',
    rule_value: 'Never store client full surnames. Always first name + last initial + company only.' },
  { category: 'general', rule_type: 'behaviour', rule_key: 'privacy_tier',
    rule_value: 'Tier 2 MUSE entries never sent to any AI model under any circumstances.' },
  { category: 'general', rule_type: 'exclude', rule_key: 'advice_language',
    rule_value: 'Never use advice language in any agent output. Always discussion, never recommendation.' },
]

async function main() {
  const db = getDb()
  let inserted = 0
  let skipped = 0

  for (const pref of preferences) {
    const existing = await db.select({ id: maia_preferences.id }).from(maia_preferences)
      .where(and(eq(maia_preferences.category, pref.category), eq(maia_preferences.rule_key, pref.rule_key)))
      .limit(1)

    if (existing.length > 0) {
      skipped++
      continue
    }

    await db.insert(maia_preferences).values({
      id: crypto.randomUUID(),
      category: pref.category,
      rule_type: pref.rule_type,
      rule_key: pref.rule_key,
      rule_value: pref.rule_value,
      confirmed: 1,
      source: 'manual',
    })
    inserted++
  }

  const [totalRow] = await db.select({ n: count() }).from(maia_preferences)
  console.log(`[seed-preferences] inserted=${inserted} skipped=${skipped} totalPreferences=${totalRow?.n ?? 0}`)
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
