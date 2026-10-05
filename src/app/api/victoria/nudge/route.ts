import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { buildScorecard } from '@/lib/victoria-handler'

// POST /api/victoria/nudge — weekly scorecard, saved to kpi_weekly (read by
// the VICTORIA dashboard). Bearer auth via MAIA_API_KEY (timingSafeEqual).
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
    buildScorecard().catch((err: unknown) =>
      console.error('[victoria/nudge] scorecard error:', err),
    )
  })

  return new Response('', { status: 200 })
}
