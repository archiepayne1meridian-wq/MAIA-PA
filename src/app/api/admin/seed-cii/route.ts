// TEMPORARY — seeds the 181 CII flashcards (R01 + R06) to production. Delete
// this route once the seed has run and been verified; same pattern used for
// the earlier HERMES scenario and MUSE template seeds.

import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { getDb } from '@/db'
import { study_cards } from '@/db/schema'
import { eq, and, inArray, count } from 'drizzle-orm'
import { addCards } from '../../../../../tools/study-db'
import { R01_MODULES, R06_MODULES } from '@/lib/cii-flashcards-data'
import type { Exam } from '../../../../../tools/study-db'

const EXAMS: { exam: Exam; modules: Record<string, { front: string; back: string }[]> }[] = [
  { exam: 'R01', modules: R01_MODULES },
  { exam: 'R06', modules: R06_MODULES },
]

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization') ?? ''
  const apiKey = env.MAIA_API_KEY()

  if (!apiKey) {
    return new Response('Service unavailable — MAIA_API_KEY not configured', { status: 503 })
  }

  const expected = `Bearer ${apiKey}`
  const valid = (() => {
    try {
      const a = Buffer.from(expected, 'utf8')
      const b = Buffer.from(authHeader.padEnd(expected.length, '\0').slice(0, expected.length), 'utf8')
      return authHeader.length === expected.length && timingSafeEqual(a, b)
    } catch { return false }
  })()

  if (!valid) return new Response('Unauthorized', { status: 401 })

  const db = getDb()
  let totalInserted = 0
  let totalSkipped = 0
  const perModule: Record<string, number> = {}

  for (const { exam, modules } of EXAMS) {
    for (const [moduleName, cards] of Object.entries(modules)) {
      const existingRows = await db
        .select({ front: study_cards.front })
        .from(study_cards)
        .where(and(eq(study_cards.module, moduleName), eq(study_cards.track, 'qualification'), eq(study_cards.exam, exam)))
      const existingFronts = new Set(existingRows.map(r => r.front))

      const toInsert = cards.filter(c => !existingFronts.has(c.front))
      if (toInsert.length > 0) {
        await addCards(toInsert.map(c => ({ module: moduleName, front: c.front, back: c.back, track: 'qualification', exam })))
      }

      totalInserted += toInsert.length
      totalSkipped += cards.length - toInsert.length
      perModule[`[${exam}] ${moduleName}`] = toInsert.length
    }
  }

  const [countResult] = await db
    .select({ n: count() })
    .from(study_cards)
    .where(and(eq(study_cards.track, 'qualification'), inArray(study_cards.exam, ['R01', 'R06'])))
  const totalCiiCards = countResult?.n ?? 0

  return Response.json({ inserted: totalInserted, skipped: totalSkipped, perModule, totalCiiCards })
}
