import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { buildBrief } from '@/lib/demeter-handler'

export async function POST(request: Request): Promise<Response> {
  // Verify Bearer token using timing-safe comparison to prevent timing attacks
  const authHeader = request.headers.get('Authorization') ?? ''
  const apiKey = env.MAIA_API_KEY()

  if (!apiKey) {
    return new Response('Service unavailable — MAIA_API_KEY not configured', { status: 503 })
  }

  const expected = `Bearer ${apiKey}`
  const isValid = (() => {
    try {
      // Encode both strings to the same byte length for timingSafeEqual
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

  // Acknowledge immediately — don't block on Slack post
  setImmediate(() => {
    buildBrief(env.SLACK_CHANNEL_ID()).catch((err: unknown) =>
      console.error('[demeter/brief] handler error:', err),
    )
  })

  return new Response('', { status: 200 })
}
