import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'
import { getDb } from '@/db'
import { activity } from '@/db/schema'
import { desc, gte } from 'drizzle-orm'

// No NODE_ENV bypass — financial data requires a valid session in both dev and prod.
async function requireAuth(): Promise<boolean> {
  const secret = process.env.SESSION_SECRET
  if (!secret) return false
  const jar = await cookies()
  const token = jar.get('maia_session')?.value
  if (!token) return false
  return verifySessionToken(token, secret)
}

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tStart = (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  })()

  const db = getDb()
  const rows = await db
    .select({
      id: activity.id,
      agent: activity.agent,
      type: activity.type,
      output: activity.output,
      status: activity.status,
      created_at: activity.created_at,
    })
    .from(activity)
    .where(gte(activity.created_at, tStart))
    .orderBy(desc(activity.created_at))
    .limit(50)

  const items = rows.map(r => ({
    id: r.id,
    agent: r.agent ?? 'MAIA',
    text: (r.output ?? r.type).slice(0, 120),
    status: r.status,
    time: new Date(r.created_at * 1000).toTimeString().slice(0, 5),
  }))

  return NextResponse.json({ items })
}
