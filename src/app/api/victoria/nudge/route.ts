import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { buildEveningNudge, buildScorecard } from '@/lib/victoria-handler'

// POST /api/victoria/nudge
// Body (optional JSON): { "mode": "nudge" | "scorecard" }
// Defaults to "nudge" if mode is absent.
// Bearer auth via MAIA_API_KEY (timingSafeEqual). 200-first + setImmediate pattern.

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

  let mode: 'nudge' | 'scorecard' = 'nudge'
  try {
    const body = await request.json()
    if (body?.mode === 'scorecard') mode = 'scorecard'
  } catch {
    // No body or non-JSON — default to 'nudge'
  }

  const channel = env.SLACK_CHANNEL_ID()

  setImmediate(() => {
    const fn = mode === 'scorecard' ? buildScorecard : buildEveningNudge
    fn(channel).catch((err: unknown) =>
      console.error(`[victoria/nudge] ${mode} handler error:`, err),
    )
  })

  return new Response('', { status: 200 })
}
