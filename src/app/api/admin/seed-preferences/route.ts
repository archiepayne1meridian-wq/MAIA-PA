// Temporary admin route — seeds all confirmed MAIA preferences into production.
// MAIA_API_KEY-protected, same pattern as prior one-off seed routes (HERMES,
// MUSE templates, CII flashcards). Delete this file (and push the cleanup)
// once the seed is confirmed.
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { getDb } from '@/db'
import { maia_preferences } from '@/db/schema'
import { eq, and, count } from 'drizzle-orm'
import { preferences } from '../../../../../scripts/seed-preferences'

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? ''
  const apiKey = env.MAIA_API_KEY()

  if (!apiKey) {
    return NextResponse.json({ error: 'MAIA_API_KEY not configured' }, { status: 503 })
  }

  const expected = `Bearer ${apiKey}`
  const valid = (() => {
    try {
      const a = Buffer.from(expected, 'utf8')
      const b = Buffer.from(authHeader.padEnd(expected.length, '\0').slice(0, expected.length), 'utf8')
      return authHeader.length === expected.length && timingSafeEqual(a, b)
    } catch { return false }
  })()

  if (!valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getDb()
  let inserted = 0
  let skipped = 0
  const perCategory: Record<string, number> = {}

  for (const pref of preferences) {
    const existing = await db.select({ id: maia_preferences.id }).from(maia_preferences)
      .where(and(eq(maia_preferences.category, pref.category), eq(maia_preferences.rule_key, pref.rule_key)))
      .limit(1)

    if (existing.length > 0) { skipped++; continue }

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
    perCategory[pref.category] = (perCategory[pref.category] ?? 0) + 1
  }

  const [totalRow] = await db.select({ n: count() }).from(maia_preferences)

  return NextResponse.json({ inserted, skipped, perCategory, totalPreferences: totalRow?.n ?? 0 })
}
