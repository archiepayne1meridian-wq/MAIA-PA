// Restores the 18 real deVere BDA training documents to MUSE.
//
// These were originally bulk-filed from source PDFs in an earlier session (this script's
// first version). That version and the source PDFs no longer exist on disk. Rather than
// re-run an AI extraction pass against nothing, this restores the exact same 18 entries
// verbatim from a captured snapshot (scripts/data/devere-training-entries.json) — taken
// directly from muse_entries immediately before scripts/reset-targeted.ts wiped the table,
// so "restore" means byte-for-byte the same content, not a re-generated approximation.
//
// Idempotent — skips any title that already exists (active) so re-running is safe.
//
// Run: npx tsx --env-file=.env scripts/muse-bulk-file.ts

import path from 'path'
process.loadEnvFile(path.join(process.cwd(), '.env'))

import fs from 'fs'
import { getDb } from '../src/db'
import { muse_entries } from '../src/db/schema'
import { eq, and } from 'drizzle-orm'

interface TrainingEntry {
  sector: string
  title: string
  summary: string
  content: string
  brief_depth: string
  source: string
  source_agent: string | null
  date_filed: number
  last_updated: number
}

async function main() {
  const dataPath = path.join(process.cwd(), 'scripts', 'data', 'devere-training-entries.json')
  const entries = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as TrainingEntry[]

  const db = getDb()
  let inserted = 0
  let skipped = 0

  for (const e of entries) {
    const existing = await db
      .select({ id: muse_entries.id })
      .from(muse_entries)
      .where(and(eq(muse_entries.title, e.title), eq(muse_entries.status, 'active')))
      .limit(1)

    if (existing.length > 0) {
      skipped++
      continue
    }

    const now = Math.floor(Date.now() / 1000)
    await db.insert(muse_entries).values({
      id: crypto.randomUUID(),
      sector: e.sector,
      title: e.title,
      summary: e.summary,
      content: e.content,
      brief_depth: e.brief_depth,
      source: e.source,
      source_agent: e.source_agent,
      status: 'active',
      date_filed: e.date_filed ?? now,
      last_updated: e.last_updated ?? now,
      created_at: now,
    })
    inserted++
  }

  console.log(`✅ MUSE training docs restored: ${inserted} inserted, ${skipped} already present.`)

  const bySector = new Map<string, number>()
  for (const e of entries) bySector.set(e.sector, (bySector.get(e.sector) ?? 0) + 1)
  console.log(`Sectors: ${[...bySector.entries()].map(([s, n]) => `${s} (${n})`).join(', ')}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
