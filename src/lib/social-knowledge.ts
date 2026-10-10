// Social (Instagram & Facebook) — slideshow generation. Claude (tool-use, so
// the API guarantees valid structured output — the same lesson learned on
// ATHENA's product extraction, where free-text JSON.parse broke on a
// multi-line field) + DALL-E/gpt-image-1 per slide + sharp text overlay.

import fs from 'fs/promises'
import path from 'path'
import { ZipArchive } from 'archiver'
import { askForTool, type ToolDef } from './claude'
import { generateImage } from './iris'
import { dataSubdir } from './data-dir'
import { applyHeroOverlay, dataUrlToBuffer } from './image-overlay'
import { updatePost, type SocialPost } from '../../tools/social-db'

const MODEL = 'claude-sonnet-4-6'

export interface SocialSlide {
  slideNumber: number
  type: 'hook' | 'content'
  text: string
  imagePrompt: string
}

export interface SlideshowGeneration {
  hook: string
  slides: SocialSlide[]
  caption: string
  hashtags: string
}

const SLIDESHOW_SYSTEM_PROMPT = `You are a social media content agent for Archie Payne, a trainee wealth management adviser at deVere Group in Switzerland. Turn ideas, news stories, or LinkedIn posts into Instagram and Facebook slideshow content.

Content goals: Build trust and personal brand, not sell products. Humanise Archie as a young adviser building his career. Show expertise without giving regulated financial advice. Frame insights as questions. Talk about problems expats and HNW individuals in Switzerland actually have.

Style — Luke Handley inspired:
- Hook slide: one punchy sentence, plain or lifestyle background, bold large text. No preamble. Just lands.
- Body slides: one idea per slide, short sentence or question, backed by a lifestyle image with bold white text overlay
- Caption: short, conversational, one or two paragraphs, ends with a direct question
- Never: "book a call", product names, jargon
- Always: end with a question that makes the reader think about their own situation

Generate 5–7 slides. Slide 1 always hook. Last slide always a soft CTA question ("What does your plan look like?"). No slide more than 15 words.

IMPORTANT — imagePrompt must never ask for text, words, typography, or lettering of any kind in the image. The slide's actual text is overlaid separately afterwards by a different process — if the image prompt itself requests "bold text" or similar, the image model will render literal decorative words that clash with the real overlay. Describe only the photographic scene: setting, lighting, mood, objects. Never mention text, words, or writing.`

const SLIDESHOW_TOOL: ToolDef = {
  name: 'submit_slideshow',
  description: 'Submit the generated Instagram/Facebook slideshow content.',
  input_schema: {
    type: 'object',
    properties: {
      hook: { type: 'string', description: 'One punchy hook sentence' },
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slideNumber: { type: 'integer' },
            type: { type: 'string', enum: ['hook', 'content'] },
            text: { type: 'string', description: 'Slide text, max 15 words' },
            imagePrompt: { type: 'string', description: 'DALL-E prompt — photorealistic, lifestyle, European, aspirational, no people, NEVER mention text/words/typography/lettering — describe only the photographic scene' },
          },
          required: ['slideNumber', 'type', 'text', 'imagePrompt'],
        },
      },
      caption: { type: 'string' },
      hashtags: { type: 'string' },
    },
    required: ['hook', 'slides', 'caption', 'hashtags'],
  },
}

export async function generateSlideshow(sourceType: 'linkedin' | 'idea' | 'news', sourceContent: string): Promise<SlideshowGeneration> {
  const userText = `Source type: ${sourceType}\n\nContent:\n${sourceContent}`
  return askForTool<SlideshowGeneration>(SLIDESHOW_SYSTEM_PROMPT, userText, SLIDESHOW_TOOL, 4096, MODEL)
}

const REDO_SLIDE_TOOL: ToolDef = {
  name: 'submit_slide',
  description: 'Submit the regenerated slide.',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Slide text, max 15 words' },
      imagePrompt: { type: 'string', description: 'DALL-E prompt — photorealistic, lifestyle, European, aspirational, no people, NEVER mention text/words/typography/lettering — describe only the photographic scene' },
    },
    required: ['text', 'imagePrompt'],
  },
}

export async function regenerateSlideText(currentSlide: SocialSlide, tweakNote: string | undefined): Promise<{ text: string; imagePrompt: string }> {
  const userText = `Current slide (number ${currentSlide.slideNumber}, type ${currentSlide.type}):\nText: ${currentSlide.text}\nImage prompt: ${currentSlide.imagePrompt}\n\n${tweakNote ? `Archie's note: ${tweakNote}` : 'Give a fresh take on this slide — same role in the slideshow, different wording/angle.'}`
  return askForTool<{ text: string; imagePrompt: string }>(SLIDESHOW_SYSTEM_PROMPT, userText, REDO_SLIDE_TOOL, 1024, MODEL)
}

// ─── Image generation ─────────────────────────────────────────────────────────

export function slideImagePath(postId: string, slideNumber: number): string {
  return path.join(dataSubdir('social'), postId, `slide_${slideNumber}.png`)
}

export function slideImageUrl(postId: string, slideNumber: number): string {
  return `/api/dashboard/social/posts/${postId}/slides/${slideNumber}`
}

async function generateOneSlideImage(postId: string, slide: SocialSlide): Promise<string> {
  const dataUrl = await generateImage(slide.imagePrompt)
  const baseImage = dataUrlToBuffer(dataUrl)
  const finalImage = await applyHeroOverlay(baseImage, slide.text)
  const filePath = slideImagePath(postId, slide.slideNumber)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, finalImage)
  return filePath
}

export async function regenerateOneSlideImage(postId: string, slide: SocialSlide): Promise<void> {
  await generateOneSlideImage(postId, slide)
}

// Generates every slide's image, one at a time, writing the growing
// imageUrls array back to the DB after EACH one completes — so the client's
// "Generating slide X of N…" indicator can poll GET /posts/[id] and observe
// real incremental progress instead of staring at nothing for a minute.
export async function generateAllSlideImages(postId: string, slides: SocialSlide[]): Promise<void> {
  const paths: string[] = []
  for (const slide of slides) {
    try {
      const filePath = await generateOneSlideImage(postId, slide)
      paths.push(filePath)
    } catch (err) {
      console.error(`[social] slide ${slide.slideNumber} image generation failed:`, err)
      paths.push('')   // keep positional alignment with slides even on failure
    }
    await updatePost(postId, { imageUrls: paths })
  }
}

// ─── Zip download ─────────────────────────────────────────────────────────────

export async function buildSlidesZip(post: SocialPost): Promise<Buffer> {
  const imageUrls: string[] = post.image_urls ? JSON.parse(post.image_urls) : []

  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } })
    const chunks: Buffer[] = []
    archive.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)

    for (let i = 0; i < imageUrls.length; i++) {
      const filePath = imageUrls[i]
      if (filePath) archive.file(filePath, { name: `slide_${i + 1}.png` })
    }
    void archive.finalize()
  })
}
