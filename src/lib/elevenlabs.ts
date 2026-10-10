// Shared ElevenLabs text-to-speech helper. /api/dashboard/diana/speak and
// /api/dashboard/maia/speak each already call the API directly for their own
// single-voice streaming responses — this helper is for routes that need the
// audio as base64 bundled into a JSON payload alongside other data (DIANA's
// /start, /message, /end), rather than as the sole response body.

const MODEL_ID = 'eleven_flash_v2_5'

export async function textToSpeechBuffer(text: string, voiceId: string): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey || !text.trim()) return null

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })

    if (!res.ok) {
      console.error('[elevenlabs] TTS error', res.status, await res.text())
      return null
    }

    const buf = await res.arrayBuffer()
    return Buffer.from(buf)
  } catch (err) {
    console.error('[elevenlabs] fetch error', err)
    return null
  }
}

export async function textToSpeechBase64(text: string, voiceId: string): Promise<string | null> {
  const buf = await textToSpeechBuffer(text, voiceId)
  return buf ? buf.toString('base64') : null
}
