import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY() })

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    module?: string
    content?: string
  }

  if (!body.content?.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const module_ = body.module ?? 'General'
  const systemPrompt = `You are ATHENA, a CISI exam study coach. The user provides raw notes or content from a CISI module. Your job is to synthesise a concise, structured study brief that the student can paste into Google NotebookLM or their flashcard app.

Format:
- Start with a clear heading: "## ${module_} — Key Concepts"
- Use short bullet points grouped under sub-headings
- Emphasise definitions, key figures, regulatory distinctions, and exam traps
- Maximum 400 words
- Plain text only (no markdown code blocks, no asterisks for bold — use UPPERCASE for emphasis if needed)
- End with a 2-sentence "Exam tip:" reminder

Do not add preamble. Output the brief directly.`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: 'user', content: body.content.trim() }],
  })

  const bodyText = message.content.find(b => b.type === 'text')?.text ?? ''

  return NextResponse.json({
    title: `${module_} — Study Brief`,
    body: bodyText,
  })
}
