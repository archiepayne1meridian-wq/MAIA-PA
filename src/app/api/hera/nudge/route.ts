import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { buildWeeklyReview } from '@/lib/hera-handler'

// POST /api/hera/nudge — weekly reflection review, saved to weekly_reviews
// (read by the HERA dashboard). Bearer auth via MAIA_API_KEY (timingSafeEqual).
// 200-first + setImmediate pattern.

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization') ?? ''
  const apiKey = env.MAIA_API_KEY()

  if (!apiKey) {
    return new Response('Service unavailable — MAIA_API_KEY not configured', { status: 503 })
  }

  const expected = `Bearer ${apiKey}`
  const isValid = (() => {
    try {
      const a = Buffer.from(expected, 'utf8')
      const b = Buffer.from(authHeader.padEnd(expected.length, '\0').slice(0, expected.length), 'utf8')
      return (
        authHeader.length === expected.length &&
        timingSafeEqual(a, b)
      )
    } catch {
      return false
    }
  })()

  if (!isValid) {
    return new Response('Unauthorized', { status: 401 })
  }

  setImmediate(() => {
    buildWeeklyReview().catch((err: unknown) =>
      console.error('[hera/nudge] weekly review error:', err),
    )
  })

  return new Response('', { status: 200 })
}
