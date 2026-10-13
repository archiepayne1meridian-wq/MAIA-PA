// POST /api/dashboard/transcribe-voice — short voice-input clips from the
// shared <ChatInput> mic button, across every chat agent (Iris, Mercury,
// Apollo debrief, Cassandra). Deliberately separate from
// /api/dashboard/apollo/transcribe, which handles full call recordings
// (up to 200MB, speaker-labelled transcript, saved as a new apollo_calls
// row) — this one just returns plain text for a <=60s clip, nothing saved.

import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { env } from '@/lib/env'

const MAX_SIZE_BYTES = 25 * 1024 * 1024 // Whisper's own API limit

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData().catch(() => null)
  const audio = formData?.get('audio')
  if (!formData || !(audio instanceof File)) {
    return NextResponse.json({ error: 'audio required' }, { status: 400 })
  }
  if (audio.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Clip too large' }, { status: 400 })
  }

  const ext = audio.name.split('.').pop()?.toLowerCase() || 'webm'
  const tmpPath = path.join(os.tmpdir(), `voice-input-${crypto.randomUUID()}.${ext}`)

  try {
    const buffer = Buffer.from(await audio.arrayBuffer())
    fs.writeFileSync(tmpPath, buffer)

    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY() })

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: 'whisper-1',
      language: 'en',
    })

    return NextResponse.json({ text: transcription.text ?? '' })
  } catch (err) {
    console.error('[transcribe-voice] failed:', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Transcription failed — ${message}` }, { status: 500 })
  } finally {
    fs.unlink(tmpPath, () => {})
  }
}
