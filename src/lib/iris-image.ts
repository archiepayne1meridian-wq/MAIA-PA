// LinkedIn hero images — automatic, Luke Handley-style lifestyle photo with
// bold white text overlay, generated after every new draft. Additive to
// src/lib/iris.ts (which already has generateImage() for a different,
// older, unused flow) rather than touching it — this is the new automatic
// per-post pipeline.

import fs from 'fs/promises'
import path from 'path'
import { generateImage } from './iris'
import { dataSubdir } from './data-dir'
import { applyHeroOverlay, firstLineWords, dataUrlToBuffer } from './image-overlay'

export function buildHeroImagePrompt(topic: string): string {
  return `Photorealistic lifestyle photography inspired by the theme: "${topic}". European setting, aspirational but understated, natural lighting, no people, no text, no logos, no watermarks. High-end editorial photography style suitable for a financial services LinkedIn post.`
}

export function linkedinImagePath(postId: string): string {
  return path.join(dataSubdir('linkedin'), postId, 'image.png')
}

// Generates the hero image for a post, overlays the hook text + watermark,
// and writes it to disk. Returns the streaming route path on success, or
// null on any failure — a broken image generation should never block the
// post itself from being usable.
export async function generateAndSaveHeroImage(postId: string, postCopy: string, topic: string): Promise<string | null> {
  try {
    const prompt = buildHeroImagePrompt(topic)
    const dataUrl = await generateImage(prompt)
    const baseImage = dataUrlToBuffer(dataUrl)
    const overlayText = firstLineWords(postCopy, 12)
    const finalImage = await applyHeroOverlay(baseImage, overlayText)

    const filePath = linkedinImagePath(postId)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, finalImage)

    return `/api/dashboard/iris/posts/${postId}/image`
  } catch (err) {
    console.error('[iris-image] hero image generation failed:', err)
    return null
  }
}
