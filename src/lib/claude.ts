import Anthropic from '@anthropic-ai/sdk'
import { env } from './env'

const SYSTEM_PROMPT = `You are MAIA, a private AI command centre for a trainee financial adviser.
Answer clearly and concisely. You are not a financial adviser and do not give financial advice to clients.
You support the adviser only. Keep responses short and actionable.`

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY() })
  }
  return _client
}

export async function ask(userText: string): Promise<string> {
  return askWith(SYSTEM_PROMPT, userText, 1024)
}

export async function askWith(
  systemPrompt: string,
  userText: string,
  maxTokens = 2048
): Promise<string> {
  const message = await getClient().messages.create({
    model: env.ANTHROPIC_MODEL(),
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userText }],
  })

  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude')
  return block.text
}
