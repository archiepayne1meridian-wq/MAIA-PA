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
  maxTokens = 2048,
  model?: string,  // override for cheap tasks (e.g. Haiku for news digests)
): Promise<string> {
  const message = await getClient().messages.create({
    model: model ?? env.ANTHROPIC_MODEL(),
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userText }],
  })

  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude')
  return block.text
}

export interface WebSearchTrace {
  query: string | null
  results: { title: string; url: string }[]
}

// Same as askWith, but grants Claude the server-side web_search tool and
// returns the final text alongside a trace of what was searched. Tool-use
// turns return multiple content blocks (search calls, results, prose) —
// the text blocks are concatenated in order to reconstruct the reply.
export async function askWithWebSearch(
  systemPrompt: string,
  userText: string,
  maxTokens = 2048,
  model?: string,
): Promise<{ text: string; search: WebSearchTrace }> {
  const message = await getClient().messages.create({
    model: model ?? env.ANTHROPIC_MODEL(),
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userText }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  })

  // Tool-use turns can include multiple text blocks — the model narrates between
  // search calls ("let me try a more specific search...") before its real answer.
  // Only the last text block is the final answer; earlier ones are commentary.
  const textBlocks = message.content.filter((block): block is Anthropic.TextBlock => block.type === 'text')
  const text = (textBlocks[textBlocks.length - 1]?.text ?? '').trim()

  let query: string | null = null
  const results: { title: string; url: string }[] = []
  for (const block of message.content) {
    if (block.type === 'server_tool_use' && block.name === 'web_search') {
      const input = block.input as { query?: string }
      if (typeof input.query === 'string') query = input.query
    }
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === 'web_search_result') results.push({ title: r.title, url: r.url })
      }
    }
  }

  if (!text) throw new Error('Unexpected response from Claude: no text content after web search')

  return { text, search: { query, results } }
}
