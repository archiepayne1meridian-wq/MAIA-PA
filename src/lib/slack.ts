import { createHmac, timingSafeEqual } from 'crypto'
import { env } from './env'

const SLACK_API = 'https://slack.com/api'

export function verifySlackSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
): boolean {
  const ts = parseInt(timestamp, 10)
  if (isNaN(ts)) return false

  // Reject if timestamp is older than 5 minutes
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300
  if (ts < fiveMinutesAgo) return false

  const sigBase = `v0:${timestamp}:${rawBody}`
  const hmac = createHmac('sha256', env.SLACK_SIGNING_SECRET())
  hmac.update(sigBase)
  const computed = `v0=${hmac.digest('hex')}`

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}

async function slackPost(method: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN()}`,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json() as { ok: boolean; error?: string }
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`)
  return data
}

export async function postMessage(
  channel: string,
  text: string,
  threadTs?: string,
  blocks?: unknown[],
): Promise<{ ts: string }> {
  const body: Record<string, unknown> = { channel, text }
  if (threadTs) body.thread_ts = threadTs
  if (blocks) body.blocks = blocks
  return slackPost('chat.postMessage', body) as Promise<{ ts: string }>
}

export async function updateMessage(
  channel: string,
  ts: string,
  text: string,
  blocks?: unknown[],
): Promise<void> {
  const body: Record<string, unknown> = { channel, ts, text }
  if (blocks) body.blocks = blocks
  await slackPost('chat.update', body)
}
