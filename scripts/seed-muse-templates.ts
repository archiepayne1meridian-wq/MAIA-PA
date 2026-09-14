// Seeds MUSE's 22-template library (10 email + 12 LinkedIn), from
// src/lib/muse-templates-data.ts. Idempotent — re-running skips any template
// whose name already exists.
//
// Run: npx tsx --env-file=.env scripts/seed-muse-templates.ts

import { getDb } from '../src/db'
import { muse_templates } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { TEMPLATE_SEEDS } from '../src/lib/muse-templates-data'

async function main() {
  const db = getDb()
  let inserted = 0
  let skipped = 0

  for (const t of TEMPLATE_SEEDS) {
    const existing = await db
      .select({ id: muse_templates.id })
      .from(muse_templates)
      .where(eq(muse_templates.name, t.name))
      .limit(1)

    if (existing.length > 0) {
      skipped++
      continue
    }

    await db.insert(muse_templates).values({
      id: crypto.randomUUID(),
      name: t.name,
      category: t.category,
      scenario: t.scenario,
      angle: null,
      subject: t.subject ?? null,
      body: t.body,
      medium: t.medium,
    })
    inserted++
  }

  console.log(`MUSE templates seeded: ${inserted} inserted, ${skipped} already present.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
