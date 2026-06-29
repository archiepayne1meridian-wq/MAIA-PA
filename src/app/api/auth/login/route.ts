import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, createSessionToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const hash = process.env.DASHBOARD_PASSWORD_HASH
  const secret = process.env.SESSION_SECRET

  if (!hash || !secret) {
    console.error('[auth] DASHBOARD_PASSWORD_HASH or SESSION_SECRET missing')
    return NextResponse.redirect(new URL('/login?error=1', req.url))
  }

  let password: string | null = null
  const ct = req.headers.get('content-type') ?? ''

  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const form = await req.formData()
    const val = form.get('password')
    if (typeof val === 'string') password = val
  } else {
    try {
      const body = await req.json() as Record<string, unknown>
      if (typeof body.password === 'string') password = body.password
    } catch { /* ignore */ }
  }

  if (!password) {
    return NextResponse.redirect(new URL('/login?error=1', req.url))
  }

  const valid = await verifyPassword(password, hash)
  if (!valid) {
    return NextResponse.redirect(new URL('/login?error=1', req.url))
  }

  const token = createSessionToken(secret)
  const res = NextResponse.redirect(new URL('/dashboard', req.url))
  res.cookies.set('maia_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60,
    path: '/',
  })
  return res
}
