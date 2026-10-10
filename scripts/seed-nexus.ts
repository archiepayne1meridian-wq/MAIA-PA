// Seeds Archie's real prospect list (379 rows from NEXUS_Prospect_Tracker.xlsx,
// Master List sheet) into nexus_prospects.
//
// Idempotent on re-run — skips any (firstName, lastName) pair already present,
// so running it twice doesn't duplicate rows.
//
// Run: npx tsx --env-file=.env scripts/seed-nexus.ts

import path from 'path'
process.loadEnvFile(path.join(process.cwd(), '.env'))

import { getDb } from '../src/db'
import { nexus_prospects } from '../src/db/schema'
import { eq, and } from 'drizzle-orm'
import { NEXUS_SEED } from '../src/lib/nexus-seed-data'

async function main() {
  const db = getDb()
  let inserted = 0
  let skipped = 0
  const batch = `initial-seed-${new Date().toISOString().slice(0, 10)}`

  for (const p of NEXUS_SEED) {
    const existing = await db.select({ id: nexus_prospects.id }).from(nexus_prospects)
      .where(and(eq(nexus_prospects.first_name, p.firstName), eq(nexus_prospects.last_name, p.lastName)))
      .limit(1)

    if (existing.length > 0) {
      skipped++
      continue
    }

    await db.insert(nexus_prospects).values({
      id: crypto.randomUUID(),
      first_name: p.firstName || null,
      last_name: p.lastName || null,
      job_role: p.jobRole || null,
      company: p.company || null,
      linkedin_url: p.linkedinUrl || null,
      wash_result: p.washResult,
      batch,
    })
    inserted++
  }

  console.log(`[seed-nexus] inserted=${inserted} skipped=${skipped} total=${NEXUS_SEED.length}`)
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
