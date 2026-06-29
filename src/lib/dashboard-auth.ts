import { cookies } from 'next/headers'
import { verifySessionToken } from './auth'

// No NODE_ENV bypass — financial data requires a valid session in both dev and prod.
export async function requireDashboardAuth(): Promise<boolean> {
  const secret = process.env.SESSION_SECRET
  if (!secret) return false
  const jar = await cookies()
  const token = jar.get('maia_session')?.value
  if (!token) return false
  return verifySessionToken(token, secret)
}
