import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { handleWeeklyPlan } from '@/lib/maia-handler'

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

  const channel = env.SLACK_CHANNEL_ID()

  setImmediate(() => {
    handleWeeklyPlan(channel).catch((err: unknown) =>
      console.error('[cron/maia/weekly-plan] error:', err),
    )
  })

  return new Response('', { status: 200 })
}
