import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { activity } from '@/db/schema'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    title?: string
    url?: string
    source?: string
  }

  const db = getDb()
  await db.insert(activity).values({
    id: randomUUID(),
    type: 'iris_suggestion',
    agent: 'IRIS',
    slack_user: 'web',
    input: JSON.stringify({ title: body.title, url: body.url, source: body.source }),
    output: null,
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })

  return NextResponse.json({ ok: true })
}
