// Shared sharp-based hero-image text overlay — white bold centred text over a
// semi-transparent dark scrim, with a small "Archie Payne · deVere" watermark
// bottom-left. Used by both LinkedIn (IRIS) hero images and Social (slide
// images) — identical visual spec in both places.

import sharp from 'sharp'

const WATERMARK = 'Archie Payne · deVere'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// Greedy word-wrap by character count — good enough for a bold ~72px font on
// a 1024px canvas without pulling in a real text-measurement dependency.
function wrapWords(text: string, maxCharsPerLine: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

function buildOverlaySvg(overlayText: string, width: number, height: number, fontSize = 72): string {
  const maxCharsPerLine = Math.max(10, Math.round(width / (fontSize * 0.62)))
  const lines = wrapWords(overlayText, maxCharsPerLine).slice(0, 4)
  const lineHeight = fontSize * 1.22
  const textBlockHeight = lines.length * lineHeight
  const scrimPaddingY = 56
  const scrimHeight = Math.min(height, textBlockHeight + scrimPaddingY * 2)
  const scrimY = (height - scrimHeight) / 2
  const firstBaselineY = scrimY + scrimPaddingY + fontSize * 0.82

  const textElements = lines
    .map((line, i) => `<text x="${width / 2}" y="${firstBaselineY + i * lineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(line)}</text>`)
    .join('\n')

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${scrimY}" width="${width}" height="${scrimHeight}" fill="rgba(0,0,0,0.45)" />
    ${textElements}
    <text x="40" y="${height - 36}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600" fill="#ffffff" fill-opacity="0.85" text-anchor="start">${escapeXml(WATERMARK)}</text>
  </svg>`
}

// baseImage can be any format sharp understands (the raw image generation
// call has an SVG fallback path for when DALL-E/gpt-image-1 itself fails) —
// always normalised to a 1024x1024 PNG with the overlay composited on top.
export async function applyHeroOverlay(baseImage: Buffer, overlayText: string): Promise<Buffer> {
  const width = 1024
  const height = 1024
  const svg = buildOverlaySvg(overlayText, width, height)
  return sharp(baseImage)
    .resize(width, height, { fit: 'cover' })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer()
}

// Post copy/slide text → overlay text: first non-empty line, capped at
// maxWords words (LinkedIn/IG hooks are short standalone lines, not
// grammatical sentences necessarily ending in punctuation).
export function firstLineWords(text: string, maxWords: number): string {
  const line = text.split('\n').find(l => l.trim()) ?? text
  const words = line.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return words.join(' ')
  return `${words.slice(0, maxWords).join(' ')}…`
}

export function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.split(',')[1] ?? ''
  return Buffer.from(base64, 'base64')
}
