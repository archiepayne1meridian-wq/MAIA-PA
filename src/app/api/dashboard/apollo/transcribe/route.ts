import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { env } from '@/lib/env'
import { getDb } from '@/db'
import { activity } from '@/db/schema'
import { saveCall } from '../../../../../../tools/apollo'

const ALLOWED_EXTENSIONS = ['mp3', 'mp4', 'm4a', 'wav', 'ogg', 'webm']
const MAX_SIZE_BYTES = 200 * 1024 * 1024 // 200MB

interface WhisperSegment {
  start: number
  end: number
  text: string
}

// Heuristic: the first speaker to ask a question is "Archie", the other is "Prospect".
// Whisper's verbose_json doesn't return per-speaker diarization — segments are just
// sequential text blocks — so this groups consecutive segments as if alternating
// turns whenever a question mark appears, which is the closest cheap signal we have
// without a dedicated diarization pass.
function formatTranscript(segments: WhisperSegment[]): string {
  if (segments.length === 0) return ''

  let determinedArchie: 'first' | 'second' | null = null
  const firstQuestionIndex = segments.findIndex(s => s.text.includes('?'))
  if (firstQuestionIndex === 0) determinedArchie = 'first'
  else if (firstQuestionIndex > 0) determinedArchie = 'second'

  const lines: string[] = []
  let currentSpeaker: 'A' | 'B' = 'A'
  let sawFirstQuestion = false

  for (const seg of segments) {
    if (!sawFirstQuestion && seg.text.includes('?')) {
      sawFirstQuestion = true
    }
    const mm = Math.floor(seg.start / 60).toString().padStart(2, '0')
    const ss = Math.floor(seg.start % 60).toString().padStart(2, '0')

    let label: string
    if (determinedArchie === 'first') {
      label = currentSpeaker === 'A' ? 'Archie' : 'Prospect'
    } else if (determinedArchie === 'second') {
      label = currentSpeaker === 'A' ? 'Prospect' : 'Archie'
    } else {
      label = currentSpeaker === 'A' ? 'Speaker 1' : 'Speaker 2'
    }

    lines.push(`[${mm}:${ss}] ${label}: ${seg.text.trim()}`)
    currentSpeaker = currentSpeaker === 'A' ? 'B' : 'A'
  }

  return lines.join('\n')
}

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
      { error: 'Unsupported format — use .mp3, .m4a, .wav, .mp4, .ogg, or .webm' },
      { status: 400 },
    )
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File too large — max 200MB' }, { status: 400 })
  }

  const tmpPath = path.join(os.tmpdir(), `apollo-${crypto.randomUUID()}.${ext}`)

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(tmpPath, buffer)

    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY() })

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      language: 'en',
    })

    const segments = (
      (transcription as unknown as { segments?: WhisperSegment[] }).segments ?? []
    )
    const formatted = segments.length > 0
      ? formatTranscript(segments)
      : (transcription.text ?? '')

    const duration = (transcription as unknown as { duration?: number }).duration ?? null

    const callId = await saveCall({
      call_date: new Date().toISOString().slice(0, 10),
      transcript: formatted,
    })

    await getDb().insert(activity).values({
      id: activityId,
      event_id: `apollo_transcribe_${Date.now()}`,
      type: 'transcribe',
      agent: 'APOLLO',
      input: file.name,
      output: `call ${callId} — ${segments.length} segments`,
      status: 'success',
      duration_ms: Date.now() - startMs,
      created_at: Math.floor(Date.now() / 1000),
    })

    return NextResponse.json({ callId, transcript: formatted, duration })
  } catch (err) {
    console.error('[apollo] transcription failed:', err)
    await getDb().insert(activity).values({
      id: activityId,
      event_id: `apollo_transcribe_${Date.now()}`,
      type: 'transcribe',
      agent: 'APOLLO',
      input: file.name,
      output: err instanceof Error ? err.message : String(err),
      status: 'error',
      duration_ms: Date.now() - startMs,
      created_at: Math.floor(Date.now() / 1000),
    }).catch(() => {})
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  } finally {
    fs.unlink(tmpPath, () => {})
  }
}
