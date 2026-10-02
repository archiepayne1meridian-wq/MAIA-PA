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

export interface ToolDef {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

// Generic multi-tool loop: grants Claude a set of custom tools (not Claude's
// own built-in web_search) and dispatches to `executor` by tool name whenever
// it calls one, feeding the result back until Claude produces its final text
// answer. Used by CASSANDRA's chat follow-up handler to let Claude run fresh
// Brave searches / fetch articles on its own terms rather than always
// front-loading everything before the first reply.
export async function askWithTools(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  tools: ToolDef[],
  executor: (name: string, input: Record<string, unknown>) => Promise<string>,
  maxTokens = 1024,
  model?: string,
  maxRounds = 3,
): Promise<{ text: string; toolCalls: { name: string; input: Record<string, unknown>; resultPreview: string }[] }> {
  const client = getClient()
  const toolCalls: { name: string; input: Record<string, unknown>; resultPreview: string }[] = []
  const history: Anthropic.MessageParam[] = messages.map(m => ({ role: m.role, content: m.content }))

  for (let round = 0; round < maxRounds; round++) {
    const message = await client.messages.create({
      model: model ?? env.ANTHROPIC_MODEL(),
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: history,
      tools: tools.map(t => ({ type: 'custom' as const, name: t.name, description: t.description, input_schema: t.input_schema })),
    })

    const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const textBlocks = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')
    const text = textBlocks.map(b => b.text).join('\n').trim()

    if (!toolUse || message.stop_reason !== 'tool_use') {
      return { text, toolCalls }
    }

    const input = toolUse.input as Record<string, unknown>
    const result = await executor(toolUse.name, input)
    toolCalls.push({ name: toolUse.name, input, resultPreview: result.slice(0, 200) })

    history.push({ role: 'assistant', content: message.content })
    history.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: result }],
    })
  }

  // Ran out of rounds — ask one final time without tools so Claude must answer in prose.
  const final = await client.messages.create({
    model: model ?? env.ANTHROPIC_MODEL(),
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: history,
  })
  const finalText = final.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim()
  return { text: finalText, toolCalls }
}
