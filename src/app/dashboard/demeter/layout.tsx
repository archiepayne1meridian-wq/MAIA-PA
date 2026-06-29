import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySessionToken } from '@/lib/auth'

// No NODE_ENV bypass — financial data requires a valid session in dev and prod.
export default async function DemeterLayout({ children }: { children: React.ReactNode }) {
  const jar    = await cookies()
  const token  = jar.get('maia_session')?.value
  const secret = process.env.SESSION_SECRET
  if (!secret || !token || !verifySessionToken(token, secret)) {
    redirect('/login')
  }
  return <>{children}</>
}
