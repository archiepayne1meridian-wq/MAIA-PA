// One-off: seeds the 43 genuinely-new prospects from the 408-row Prospects
// agent upgrade spec (the other 365 of 408 already existed in nexus_prospects —
// deduped by first_name+last_name case-insensitive before this file was written).
//
// Run: npx tsx --env-file=.env scripts/seed-nexus-batch2.ts

import path from 'path'
import fs from 'fs'
process.loadEnvFile(path.join(process.cwd(), '.env'))

import { addProspectsBulk, getAllNamesLower } from '../tools/nexus-db'

const DEDUPED_PATH = '/private/tmp/claude-501/-Users-archiepayne-Documents-MAIA-PA/cd94f915-6a90-42bf-a9b3-8de999d782fe/scratchpad/deduped.json'

interface RawRow {
  first_name: string
  last_name: string
  job_role: string
  company: string
  linkedin_url: string
  wash_result: string
  date_washed: string | null
}

function mapWashResult(raw: string): string | null {
  const lower = raw.trim().toLowerCase()
  if (lower === 'green') return 'Green'
  if (lower === 'red') return 'Red'
  if (lower === 'dnc' || lower === 'do not contact') return 'Do Not Contact'
  return null
}

async function main() {
  const rows = JSON.parse(fs.readFileSync(DEDUPED_PATH, 'utf-8')) as RawRow[]
  // Re-check against current DB state at run time, not just the earlier dedup
  // pass — belt and braces in case anything changed in between.
  const existing = await getAllNamesLower()
  const existingKeys = new Set(existing.map(n => `${n.firstLower}|${n.lastLower}`))
  const trulyNew = rows.filter(r => !existingKeys.has(`${r.first_name.trim().toLowerCase()}|${r.last_name.trim().toLowerCase()}`))

  const inserted = await addProspectsBulk(trulyNew.map(r => ({
    first_name: r.first_name || null,
    last_name: r.last_name || null,
    job_role: r.job_role || null,
    company: r.company || null,
    linkedin_url: r.linkedin_url || null,
    wash_result: mapWashResult(r.wash_result),
    batch: `prospects-upgrade-${new Date().toISOString().slice(0, 10)}`,
  })))

  console.log(`[seed-nexus-batch2] inserted=${inserted} skipped=${rows.length - trulyNew.length} total_candidates=${rows.length}`)
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
