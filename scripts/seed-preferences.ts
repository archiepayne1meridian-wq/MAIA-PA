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
import { PREFERENCES_SEED } from '../src/lib/preferences-seed-data'

async function main() {
  const db = getDb()
  let inserted = 0
  let skipped = 0

  for (const pref of PREFERENCES_SEED) {
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
