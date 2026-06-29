import { NextRequest, NextResponse } from 'next/server'
import { verifySessionTokenEdge } from '@/lib/session'

export async function proxy(req: NextRequest) {
  // Skip auth gate in local dev — only enforce on Railway (production).
  if (process.env.NODE_ENV !== 'production') return NextResponse.next()

  const secret = process.env.SESSION_SECRET
  const token = req.cookies.get('maia_session')?.value

  if (!secret || !token || !(await verifySessionTokenEdge(token, secret))) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

// Guards /dashboard/* only. /api/* routes are never intercepted —
// Slack HMAC and cron Bearer auth remain the sole gate for those endpoints.
export const config = {
  matcher: ['/dashboard/:path*'],
}
