import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { deleteProspectsByBatch } from '../../../../../tools/nexus-db'

// POST /api/admin/delete-nexus-batch — one-off cleanup for a specific bad
// import batch (hard delete, bypassing the normal soft-delete-only rule,
// because the rows being removed are parser garbage, not real prospects
// with history). Bearer auth via MAIA_API_KEY. Temporary — delete this route
// once the batch has been confirmed removed, per the standing
// "temporary admin seed/cleanup routes, deleted after use" rule.

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

  const body = await request.json().catch(() => ({})) as { batch?: string }
  if (!body.batch) {
    return Response.json({ error: 'batch required' }, { status: 400 })
  }

  const deleted = await deleteProspectsByBatch(body.batch)
  return Response.json({ batch: body.batch, deleted })
}
