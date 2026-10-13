// POST /api/dashboard/home/chat — lightweight, non-persistent chat for the
// home page's bottom input bar. Unlike /api/dashboard/conversations/hub
// (which appends every turn to a permanent maia_conversations thread), this
// is single-turn: classify what Archie wants, act on it, and hand back a
// transient reply — no history kept here.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { askWith } from '@/lib/claude'
import { extractJson } from '@/lib/format'
import { addReminder } from '../../../../../../tools/reminders'
import { addGoal } from '../../../../../../tools/goals'

const SONNET = 'claude-sonnet-4-6'

// Today's date has to be injected explicitly — without it, Claude guesses at
// a training-era default when resolving a relative due_date like "tomorrow",
// which can land the reminder on the wrong year entirely.
function buildHomeSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10)
  return `You are MAIA, Archie's personal assistant at deVere and Partners Switzerland.

Today's date: ${today}

When Archie sends a message, determine what he wants:
- If he wants to add a reminder or to-do → respond with JSON: { "action": "add_reminder", "text": "...", "due_date": "YYYY-MM-DD or null" }. Resolve relative dates ("tomorrow", "Friday") against today's date above.
- If he wants to add a goal → respond with JSON: { "action": "add_goal", "text": "...", "term": "short" | "long" }
- If he's just asking a question or chatting → respond with JSON: { "action": "reply", "text": "your response here" }

Keep "reply" responses brief and direct — max 2-3 sentences, British English, no filler.
Always respond with valid JSON only. No prose, no markdown.`
}

interface HomeChatAction {
  action?: 'add_reminder' | 'add_goal' | 'reply'
  text?: string
  due_date?: string | null
  term?: 'short' | 'long'
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { message } = await req.json().catch(() => ({})) as { message?: string }
  if (!message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  try {
    const raw = await askWith(buildHomeSystemPrompt(), message.trim(), 300, SONNET)

    let parsed: HomeChatAction
    try {
      parsed = JSON.parse(extractJson(raw)) as HomeChatAction
    } catch {
      parsed = { action: 'reply', text: 'Got it.' }
    }

    if (parsed.action === 'add_reminder' && parsed.text?.trim()) {
      await addReminder(parsed.text.trim(), parsed.due_date ?? null)
      return NextResponse.json({ action: 'add_reminder', message: `Added: "${parsed.text.trim()}"` })
    }

    if (parsed.action === 'add_goal' && parsed.text?.trim()) {
      const term = parsed.term === 'long' ? 'long_term' : 'short_term'
      await addGoal(parsed.text.trim(), term)
      return NextResponse.json({ action: 'add_goal', message: `Added to ${term === 'long_term' ? 'long' : 'short'} term goals: "${parsed.text.trim()}"` })
    }

    return NextResponse.json({ action: 'reply', message: parsed.text ?? 'Got it.' })
  } catch (err) {
    console.error('[home/chat] failed:', err)
    return NextResponse.json({ error: 'Failed to process that' }, { status: 500 })
  }
}
