import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { hermes_script } from '@/db/schema'
import { eq } from 'drizzle-orm'

// ── POST /api/dashboard/hermes/reset ────────────────────────────────────────
// Deletes the singleton row — the next GET falls back to the locked defaults.

export async function POST() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  await db.delete(hermes_script).where(eq(hermes_script.id, 'singleton'))

  return NextResponse.json({ ok: true })
}
