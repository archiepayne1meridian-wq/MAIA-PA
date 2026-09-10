// Seeds HERMES's scenario bank — the 4 migrated legacy personas plus the 11
// new prospecting scenarios (src/lib/hermes-scenarios-data.ts).
// Idempotent — re-running skips any scenario whose id already exists.
//
// Run: npx tsx --env-file=.env scripts/seed-hermes-scenarios.ts

import { getDb } from '../src/db'
import { hermes_scenarios } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { ALL_SEED_SCENARIOS } from '../src/lib/hermes-scenarios-data'

async function main() {
  const db = getDb()
  let inserted = 0
  let skipped = 0

  for (const scenario of ALL_SEED_SCENARIOS) {
    const existing = await db
      .select({ id: hermes_scenarios.id })
      .from(hermes_scenarios)
      .where(eq(hermes_scenarios.id, scenario.id))
      .limit(1)

    if (existing.length > 0) {
      skipped++
      continue
    }

    await db.insert(hermes_scenarios).values({
      id: scenario.id,
      name: scenario.name,
      angle: scenario.angle,
      opener: scenario.opener,
      fact_find_questions: JSON.stringify(scenario.fact_find_questions),
      enlarge_points: JSON.stringify(scenario.enlarge_points),
      disturb_points: JSON.stringify(scenario.disturb_points),
      product_pathway: scenario.product_pathway,
      product_questions: JSON.stringify(scenario.product_questions),
      close_script: scenario.close_script,
      soft_landing: scenario.soft_landing,
      objections: JSON.stringify(scenario.objections),
      active: 1,
    })
    inserted++
  }

  console.log(`HERMES scenarios seeded: ${inserted} inserted, ${skipped} already present.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
