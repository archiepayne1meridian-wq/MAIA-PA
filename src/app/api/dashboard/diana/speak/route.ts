import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID

  if (!apiKey || !voiceId) {
    return NextResponse.json({ error: 'TTS unavailable' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({})) as { text?: string }
  if (!body.text?.trim()) {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: body.text.trim(),
          model_id: 'eleven_flash_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    )

    if (!res.ok) {
      console.error('[diana/speak] ElevenLabs error', res.status, await res.text())
      return NextResponse.json({ error: 'TTS unavailable' }, { status: 500 })
    }

    const audio = await res.arrayBuffer()
    return new Response(audio, {
      headers: { 'Content-Type': 'audio/mpeg' },
    })
  } catch (err) {
    console.error('[diana/speak] fetch error', err)
    return NextResponse.json({ error: 'TTS unavailable' }, { status: 500 })
  }
}
