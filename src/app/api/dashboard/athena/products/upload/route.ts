// POST /api/dashboard/athena/products/upload — multipart PDF upload.
// Single blocking request: extract → Claude extraction → persist product +
// cards → generate podcast audio (many sequential ElevenLabs calls, can take
// 30-90s — same "one long request" shape as /api/dashboard/apollo/transcribe,
// which Railway's persistent Node server handles fine, unlike a serverless
// platform's short timeout). Podcast failure doesn't fail the whole upload —
// the flashcards/MCQs are still useful without audio.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { extractText } from '@/lib/muse-file-extract'
import { extractProductFromText, generatePodcastAudio } from '@/lib/athena-knowledge'
import { createProduct, createCardsBulk, setProductPodcastAudio, getProductById, type AthenaTab } from '../../../../../../../tools/athena-db'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData().catch(() => null)
  const file = formData?.get('file')
  if (!formData || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 })
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext !== 'pdf') {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const documentText = await extractText(buffer, 'pdf')
    if (!documentText.trim()) {
      return NextResponse.json({ error: 'Could not extract any text from this PDF' }, { status: 400 })
    }

    const extraction = await extractProductFromText(documentText)

    const productId = await createProduct({
      name: extraction.name,
      summary: extraction.summary,
      salesAngles: extraction.salesAngles,
      mcqs: extraction.mcqs,
      podcastScript: extraction.podcastScript,
      sourceFilename: file.name,
      cardCount: extraction.flashcards.length,
    })

    await createCardsBulk(extraction.flashcards.map(c => ({
      tab: 'product' as AthenaTab,
      front: c.front,
      back: c.back,
      note: c.note,
      product_id: productId,
    })))

    let podcastReady = false
    try {
      const audioPath = await generatePodcastAudio(extraction.podcastScript, productId)
      if (audioPath) {
        await setProductPodcastAudio(productId, audioPath)
        podcastReady = true
      }
    } catch (err) {
      console.error('[athena/products/upload] podcast generation failed:', err)
    }

    const product = await getProductById(productId)
    return NextResponse.json({
      product: product ? {
        ...product,
        salesAngles: extraction.salesAngles,
        mcqs: extraction.mcqs,
        podcastStreamUrl: podcastReady ? `/api/dashboard/athena/podcasts/${productId}` : null,
      } : null,
      cardCount: extraction.flashcards.length,
      mcqCount: extraction.mcqs.length,
      podcastReady,
    })
  } catch (err) {
    console.error('[athena/products/upload] failed:', err)
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
