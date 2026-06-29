import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySessionToken } from '@/lib/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  const token = jar.get('maia_session')?.value
  const secret = process.env.SESSION_SECRET
  if (!secret || !token || !verifySessionToken(token, secret)) {
    redirect('/login')
  }
  return <>{children}</>
}
