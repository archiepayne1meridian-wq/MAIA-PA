// IRIS morning draft cron — triggered by GitHub Actions daily at 7am UTC.
// Protected by MAIA_API_KEY Bearer token (same pattern as every other cron
// route in this repo — see CLAUDE.md's Secrets section).

import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { buildMorningDraft } from '@/lib/iris-handler'

export async function GET(request: Request): Promise<Response> {
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

  try {
    const result = await buildMorningDraft()
    return Response.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/iris/morning-draft] handler error:', err)
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
