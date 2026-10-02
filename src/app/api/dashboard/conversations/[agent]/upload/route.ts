// Generic file-drop acknowledgment for the hub chat input bars. Honest, not
// fake: it confirms receipt and names what will happen once that agent's real
// file handling is connected (next phase) — it never pretends to analyse,
// transcribe, or parse anything itself. The one exception is 'calls', which
// already has a real pipeline on its own dedicated page (/dashboard/apollo) —
// this route points there rather than duplicating it.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { appendMessages, type ConversationMessage } from '../../../../../../../tools/maia-conversations'

const ACCEPTED_EXTENSIONS: Record<string, string[]> = {
  calls: ['mp3', 'mp4', 'm4a', 'wav', 'ogg'],
  linkedin: ['png', 'jpg', 'jpeg', 'webp'],
  news: ['pdf', 'png', 'jpg'],
  study: ['pdf', 'docx'],
  prospects: ['csv', 'xlsx'],
}
const DEFAULT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'pdf']

function ackMessage(agent: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const isAudio = ['mp3', 'mp4', 'm4a', 'wav', 'ogg'].includes(ext)
  const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(ext)
  const isSpreadsheet = ['csv', 'xlsx'].includes(ext)
  const isDoc = ['pdf', 'docx'].includes(ext)

  if (agent === 'calls' && isAudio) return `Got "${fileName}" — head to the Calls page to transcribe and analyse it.`
  if (agent === 'linkedin' && isImage) return `Got "${fileName}" — once LinkedIn's image analysis is connected I'll suggest using it as inspiration or attach it to a draft.`
  if (agent === 'news' && (isImage || ext === 'pdf')) return `Got "${fileName}" — once News's document analysis is connected I'll summarise it and suggest a call angle.`
  if (agent === 'study' && isDoc) return `Got "${fileName}" — once Study's extraction is connected I'll pull it into flashcards.`
  if (agent === 'prospects' && isSpreadsheet) return `Got "${fileName}" — once Prospects is connected I'll parse it into the grid.`
  return `Got "${fileName}" — noted, but this agent's file handling isn't connected yet.`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { agent } = await params

  const formData = await req.formData().catch(() => null)
  const file = formData?.get('file')
  if (!formData || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 })
  }

  const allowed = ACCEPTED_EXTENSIONS[agent] ?? DEFAULT_EXTENSIONS
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!allowed.includes(ext)) {
    return NextResponse.json({ error: `Unsupported format for this agent — use ${allowed.map(e => `.${e}`).join(', ')}` }, { status: 400 })
  }

  const now = Math.floor(Date.now() / 1000)
  const userMessage: ConversationMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    type: 'text',
    content: `📎 ${file.name}`,
    timestamp: now,
  }
  const maiaMessage: ConversationMessage = {
    id: crypto.randomUUID(),
    role: 'maia',
    type: 'text',
    content: ackMessage(agent, file.name),
    timestamp: now,
  }

  await appendMessages(agent as Parameters<typeof appendMessages>[0], [userMessage, maiaMessage])

  return NextResponse.json({ messages: [userMessage, maiaMessage] })
}
