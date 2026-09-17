// Seeds ATHENA's CII qualification track — R01 (Financial Services, Regulation
// and Ethics) and R06 (Financial Planning Practice). 15+ cards per module,
// drawn from public CII syllabus content and the UK tax/regulatory facts
// already established elsewhere in this codebase (deVere training material,
// e.g. pension access age rising to 57 in 2028, IHT on pensions from April
// 2027, the October 2024 QROPS 25% Overseas Transfer Charge).
//
// There is no standalone "modules" table — a module exists once it has at
// least one card tagged with its name, track:'qualification' and the relevant
// exam. Idempotent — re-running skips any card whose front text already
// exists for its module+track+exam.
//
// Run: npx tsx --env-file=.env scripts/seed-cii-flashcards.ts

import path from 'path'
process.loadEnvFile(path.join(process.cwd(), '.env'))

import { getDb } from '../src/db'
import { study_cards } from '../src/db/schema'
import { eq, and } from 'drizzle-orm'
import { addCards } from '../tools/study-db'
import type { Exam } from '../tools/study-db'
import { R01_MODULES, R06_MODULES, type CardSeed } from '../src/lib/cii-flashcards-data'


const EXAMS: { exam: Exam; modules: Record<string, CardSeed[]> }[] = [
  { exam: 'R01', modules: R01_MODULES },
  { exam: 'R06', modules: R06_MODULES },
]

async function main() {
  const db = getDb()
  let totalInserted = 0
  let totalSkipped = 0

  for (const { exam, modules } of EXAMS) {
    for (const [moduleName, cards] of Object.entries(modules)) {
      const existingRows = await db
        .select({ front: study_cards.front })
        .from(study_cards)
        .where(and(eq(study_cards.module, moduleName), eq(study_cards.track, 'qualification'), eq(study_cards.exam, exam)))
      const existingFronts = new Set(existingRows.map(r => r.front))

      const toInsert = cards.filter(c => !existingFronts.has(c.front))
      const skipped = cards.length - toInsert.length

      if (toInsert.length > 0) {
        await addCards(toInsert.map(c => ({ module: moduleName, front: c.front, back: c.back, track: 'qualification', exam })))
      }

      totalInserted += toInsert.length
      totalSkipped += skipped
      console.log(`[${exam}] ${moduleName}: +${toInsert.length} card(s)${skipped > 0 ? `, ${skipped} already present` : ''}`)
    }
  }

  console.log(`\nTotal: ${totalInserted} inserted, ${totalSkipped} skipped.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
