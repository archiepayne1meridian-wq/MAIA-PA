import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getDb } from '@/db'
import { iris_posts } from '@/db/schema'
import { eq } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY() })

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    draftId?: string
    feedback?: string
  }

  if (!body.draftId || !body.feedback?.trim()) {
    return NextResponse.json({ error: 'draftId and feedback are required' }, { status: 400 })
  }

  const db = getDb()
  const [post] = await db.select().from(iris_posts).where(eq(iris_posts.id, body.draftId)).limit(1)
  if (!post) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const systemPrompt = `You are IRIS, a LinkedIn content writer for a trainee financial adviser in Malta (MFSA-regulated). You write factual, professional LinkedIn posts — no financial advice, no recommendations, just insights and news relays.

You are given an existing draft and refinement feedback. Rewrite the draft incorporating the feedback while maintaining the same pillar, topic, and professional tone.

Rules:
- Maximum 1,300 characters
- No emojis unless the original used them
- No calls to action like "comment below" or "DM me"
- No financial advice, no recommendations
- Output ONLY the refined post copy — nothing else`

  const userContent = `Original draft:\n${post.copy}\n\nRefinement feedback:\n${body.feedback.trim()}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })

  const newCopy = message.content.find(b => b.type === 'text')?.text?.trim() ?? ''

  if (!newCopy) {
    return NextResponse.json({ error: 'Failed to generate refined copy' }, { status: 500 })
  }

  await db.update(iris_posts).set({ copy: newCopy }).where(eq(iris_posts.id, body.draftId))

  return NextResponse.json({ copy: newCopy })
}
