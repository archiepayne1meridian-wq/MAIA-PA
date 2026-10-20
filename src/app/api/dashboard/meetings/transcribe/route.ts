// POST /api/dashboard/meetings/transcribe — Whisper transcription only, same
// pattern as apollo/transcribe. No DB write here: a Meetings session is
// ephemeral client-side state until "Save to CRM" / "Book follow-up call" —
// see src/lib/meetings.ts's header comment.

import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { env } from '@/lib/env'
import { getDb } from '@/db'
import { activity } from '@/db/schema'

const ALLOWED_EXTENSIONS = ['mp3', 'm4a', 'wav', 'ogg']
const MAX_SIZE_BYTES = 200 * 1024 * 1024 // 200MB

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startMs = Date.now()
  const activityId = crypto.randomUUID()

  const formData = await req.formData().catch(() => null)
  const file = formData?.get('audio')
  if (!formData || !(file instanceof File)) {
    return NextResponse.json({ error: 'audio file required' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: 'Unsupported format — use .mp3, .m4a, .wav, or .ogg' },
      { status: 400 },
    )
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File too large — max 200MB' }, { status: 400 })
  }

  const tmpPath = path.join(os.tmpdir(), `meetings-${crypto.randomUUID()}.${ext}`)

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(tmpPath, buffer)

    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY() })

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: 'whisper-1',
      language: 'en',
    })

    await getDb().insert(activity).values({
      id: activityId,
      event_id: `meetings_transcribe_${Date.now()}`,
      type: 'transcribe',
      agent: 'MEETINGS',
      input: file.name,
      output: `${transcription.text.length} chars transcribed`,
      status: 'success',
      duration_ms: Date.now() - startMs,
      created_at: Math.floor(Date.now() / 1000),
    })

    return NextResponse.json({ transcript: transcription.text })
  } catch (err) {
    console.error('[meetings] transcription failed:', err)
    const message = err instanceof Error ? err.message : String(err)
    await getDb().insert(activity).values({
      id: activityId,
      event_id: `meetings_transcribe_${Date.now()}`,
      type: 'transcribe',
      agent: 'MEETINGS',
      input: file.name,
      output: message,
      status: 'error',
      duration_ms: Date.now() - startMs,
      created_at: Math.floor(Date.now() / 1000),
    }).catch(() => {})
    return NextResponse.json({ error: `Transcription failed — ${message}` }, { status: 500 })
  } finally {
    fs.unlink(tmpPath, () => {})
  }
}
