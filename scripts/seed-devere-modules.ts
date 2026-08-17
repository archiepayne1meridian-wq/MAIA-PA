// Seeds the 8 deVere Products modules for ATHENA's "products" track.
// There is no standalone `modules` table — a module "exists" once it has at least
// one card tagged with its name and track. This script inserts one anchor card per
// module (a genuine, well-formed flashcard, not a placeholder) so all 8 modules show
// up in the UI immediately. Run scripts/seed-devere-flashcards.ts afterwards to fill
// each module out to a full deck.
//
// Idempotent — re-running skips any module that already has a card with the same front.
//
// Run: npx tsx scripts/seed-devere-modules.ts

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
process.loadEnvFile(path.join(process.cwd(), '.env'))

import { getDb } from '../src/db'
import { study_cards } from '../src/db/schema'
import { eq, and } from 'drizzle-orm'
import { addCards } from '../tools/study-db'

export interface DevereModule {
  name: string
  description: string
}

export const DEVERE_PRODUCTS_MODULES: DevereModule[] = [
  {
    name: 'Wealth Management Fundamentals',
    description: 'What wealth management actually is, the PEPSI order, and your role as a BDA.',
  },
  {
    name: 'UK Pensions — DC & DB',
    description: 'DC vs DB, the state pension, and the cross-border pension questions that open a call.',
  },
  {
    name: 'Wrappers — Where the Money Sits',
    description: 'What a client holds vs what it sits in, and what happens to each wrapper when they leave the UK.',
  },
  {
    name: 'The Portfolio Bond',
    description: 'Gross roll-up, the 5% allowance, time-apportionment relief, and the PPB residency rule.',
  },
  {
    name: 'Asset Classes',
    description: 'Returns, Liquidity, Security, Simplicity — the grid, and where each asset class actually sits on it.',
  },
  {
    name: 'Compounding & Charges',
    description: 'The Rule of 72, why time beats money, and what charges really cost over decades.',
  },
  {
    name: 'Global Taxes',
    description: "Why leaving the UK adds a tax system rather than removing one — IHT, residence, and the flags to listen for.",
  },
  {
    name: 'Why deVere',
    description: 'The three questions in order, institutional access, local licences, and whole-of-market advice.',
  },
]

export const ANCHOR_CARDS: Record<string, { front: string; back: string }> = {
  'Wealth Management Fundamentals': {
    front: 'In one sentence, what is wealth management — and how is that different from what a bank, accountant, or employer sees?',
    back: "Wealth management is coordinating someone's whole financial life against what they actually want, in a sensible order. A bank sees an account, an accountant a tax return, an employer one pension — nobody else sees the whole person.",
  },
  'UK Pensions — DC & DB': {
    front: 'What is the one-line distinction between DC and DB pensions?',
    back: 'DC = your pot, your risk, your flexibility. DB = their promise, their risk, no flexibility.',
  },
  'Wrappers — Where the Money Sits': {
    front: "What is the one idea behind wrappers?",
    back: "What you hold is not the same as what you hold it in. Every investment sits inside a wrapper, and the wrapper — not the investment — decides the tax treatment.",
  },
  'The Portfolio Bond': {
    front: 'In one line, what is a portfolio bond and who is it for?',
    back: "A tax wrapper for money that's already liquid — house-sale proceeds, an inheritance, savings — designed for internationally mobile clients. The provider owns the underlying assets; the client owns the contract.",
  },
  'Asset Classes': {
    front: 'What four things is every investment judged on?',
    back: 'Returns, Liquidity, Security, Simplicity — and nothing scores well on all four.',
  },
  'Compounding & Charges': {
    front: 'What is the Rule of 72?',
    back: '72 ÷ the annual growth rate ≈ the number of years for money to double. E.g. at 8%, money doubles roughly every 9 years.',
  },
  'Global Taxes': {
    front: "What is the one idea behind cross-border tax?",
    back: "You don't leave a tax system when you leave a country — you add one. UK rules that can survive leaving include tax on UK-source income, UK property CGT, and (since April 2025) inheritance tax based on residence history, not domicile.",
  },
  'Why deVere': {
    front: "What are the three questions a client has to answer, in order, before 'why this firm' matters?",
    back: '1) Why do anything at all — do I have a problem? 2) Why pay for advice? 3) Why this firm? Starting at question 3 rarely lands, because nothing underneath it has been established yet.',
  },
}

async function main() {
  const db = getDb()
  let inserted = 0
  let skipped = 0

  for (const mod of DEVERE_PRODUCTS_MODULES) {
    const anchor = ANCHOR_CARDS[mod.name]
    if (!anchor) throw new Error(`No anchor card defined for module: ${mod.name}`)

    const existing = await db
      .select({ id: study_cards.id })
      .from(study_cards)
      .where(and(eq(study_cards.module, mod.name), eq(study_cards.track, 'products'), eq(study_cards.front, anchor.front)))
      .limit(1)

    if (existing.length > 0) {
      skipped++
      continue
    }

    await addCards([{ module: mod.name, front: anchor.front, back: anchor.back, track: 'products' }])
    inserted++
  }

  console.log(`deVere Products modules seeded: ${inserted} anchor card(s) inserted, ${skipped} already present.`)
  console.log(`Modules: ${DEVERE_PRODUCTS_MODULES.map(m => m.name).join(', ')}`)
}

// Only run when executed directly — seed-devere-flashcards.ts imports DEVERE_PRODUCTS_MODULES
// from this file and must not trigger a second seeding pass as an import side effect.
// realpathSync normalizes symlinks (e.g. macOS /tmp → /private/tmp) so this matches reliably.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])
if (isMain) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
