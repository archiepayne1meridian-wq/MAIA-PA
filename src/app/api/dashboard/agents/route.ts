import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'
import { buildDashboardData } from '@/app/dashboard/data'

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
  const { agents } = await buildDashboardData()
  return NextResponse.json({ agents })
}
