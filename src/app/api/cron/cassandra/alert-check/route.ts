import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { checkMarketAlert } from '@/lib/cassandra-handler'

// POST /api/cron/cassandra/alert-check — weekend/off-hours coverage for the
// market-alert check. Weekday mid-session coverage already happens inside
// buildAfternoonRefresh (2pm cron); this route exists so a Sat/Sun schedule
// can call the same check without running the full afternoon-refresh
// article-gathering pipeline (brief_time is Mon-Fri only, so there's no
// morning-brief run on a weekend to piggyback on).

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
    checkMarketAlert().catch((err: unknown) =>
      console.error('[cron/cassandra/alert-check] handler error:', err),
    )
  })

  return new Response('', { status: 200 })
}
