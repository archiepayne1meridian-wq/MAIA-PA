import bcrypt from 'bcryptjs'
import { createHmac, timingSafeEqual } from 'crypto'

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function createSessionToken(secret: string): string {
  const payload = Date.now().toString()
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export function verifySessionToken(token: string, secret: string): boolean {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return false
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const ts = parseInt(payload, 10)
  if (isNaN(ts) || Date.now() - ts > 24 * 60 * 60 * 1000) return false

  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}
