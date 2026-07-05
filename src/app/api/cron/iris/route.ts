// IRIS cron endpoint — triggered by GitHub Actions Mon–Fri at 6am and 12pm CET.
// Protected by MAIA_API_KEY Bearer token (same pattern as all other cron routes).
// HARD STOP: stub draft active. Step 2 wires generateDraft + generateImage.

import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { buildScheduledDraft } from '@/lib/iris-handler'

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization') ?? ''
  const apiKey = env.MAIA_API_KEY()

  if (!apiKey) {
    return new Response('Service unavailable — MAIA_API_KEY not configured', { status: 503 })
  }

  const expected = `Bearer ${apiKey}`
  const valid = (() => {
    try {
      const a = Buffer.from(expected, 'utf8')
      const b = Buffer.from(authHeader.padEnd(expected.length, '\0').slice(0, expected.length), 'utf8')
      return authHeader.length === expected.length && timingSafeEqual(a, b)
    } catch { return false }
  })()

  if (!valid) return new Response('Unauthorized', { status: 401 })

  const body = await request.json().catch(() => ({})) as { slot?: string }
  const slot = body.slot === 'evening' ? 'evening' : 'morning'

  const channel = env.SLACK_CHANNEL_ID()

  setImmediate(() => {
    buildScheduledDraft(slot, channel).catch((err: unknown) =>
      console.error('[cron/iris] handler error:', err),
    )
  })

  return new Response('', { status: 200 })
}
