// Every MAIA preference Archie has stated across this build session — CASSANDRA
// filter rules, IRIS voice/style rules, DIANA roleplay behaviour, HERMES
// call-script behaviour, and cross-agent general rules.
//
// Pure data, no imports, no side effects — deliberately separate from
// scripts/seed-preferences.ts (which does `process.loadEnvFile()` at module
// load for local CLI runs) so this can be safely imported into a Next.js API
// route without dragging that env-file read into the production build, where
// no .env file exists (Railway injects env vars directly). Same pattern as
// src/lib/cii-flashcards-data.ts.

export interface PreferenceSeed {
  category: string
  rule_type: 'exclude' | 'include' | 'style' | 'behaviour'
  rule_key: string
  rule_value: string
}

export const PREFERENCES_SEED: PreferenceSeed[] = [
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
  // Config value, not a voice rule — excluded from the generation prompt by
  // key (see generateDraft's prefs filter in src/lib/iris.ts).
  { category: 'iris', rule_type: 'behaviour', rule_key: 'morning_generation_time',
    rule_value: '07:00' },

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
