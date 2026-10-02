// Thin client for the Perplexity API — CASSANDRA's deep-research backend for
// conversational follow-ups that need synthesis across multiple sources
// (quotes, differing angles, "what are people saying," a named person's
// stated position) rather than a quick news lookup. Brave Search (see
// tools/brave-search.ts) stays the backend for the broad morning scan and
// for simple "find more news on X" follow-ups.

import { env } from '@/lib/env'

export interface PerplexityResult {
  answer: string
  citations: string[]
}

const PERPLEXITY_MODEL = 'sonar'

export async function askPerplexity(query: string): Promise<PerplexityResult> {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.PERPLEXITY_API_KEY()}`,
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Answer concisely and factually. When quoting someone, use their exact words and name the source. Never invent quotes or statistics. No financial advice.',
        },
        { role: 'user', content: query },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Perplexity request failed (${res.status}): ${body.slice(0, 200)}`)
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string } }[]
    citations?: string[]
  }

  const answer = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!answer) throw new Error('Perplexity returned no answer content')

  return { answer, citations: data.citations ?? [] }
}
