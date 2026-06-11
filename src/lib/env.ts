const REQUIRED = [
  'ANTHROPIC_API_KEY',
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'SLACK_CHANNEL_ID',
  'DATABASE_URL',
  'NEXT_PUBLIC_BASE_URL',
] as const

export function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required env var: ${name}`)
  return val
}

export function validateEnv(): void {
  const missing = REQUIRED.filter((k) => !process.env[k])
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }
}

export const env = {
  ANTHROPIC_API_KEY: () => requireEnv('ANTHROPIC_API_KEY'),
  ANTHROPIC_MODEL: () => process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
  SLACK_BOT_TOKEN: () => requireEnv('SLACK_BOT_TOKEN'),
  SLACK_SIGNING_SECRET: () => requireEnv('SLACK_SIGNING_SECRET'),
  SLACK_CHANNEL_ID: () => requireEnv('SLACK_CHANNEL_ID'),
  DATABASE_URL: () => requireEnv('DATABASE_URL'),
  NEXT_PUBLIC_BASE_URL: () => requireEnv('NEXT_PUBLIC_BASE_URL'),
  MAIA_API_KEY: () => process.env.MAIA_API_KEY,
}
