// ATHENA rebuild — R01 seed flashcards, product knowledge extraction, and
// two-voice podcast audio. Named separately from src/lib/athena.ts, which
// holds the original CISI-coach generation functions (generateCards,
// generateMCQs, flagWeakArea — the last one is a real APOLLO→ATHENA
// connection, still wired to the legacy quiz routes) — those stay untouched;
// this file is purely new, additive content for the R01/Product Knowledge
// rebuild. Always claude-sonnet-4-6, never Haiku — the "never use Haiku for
// content quality reasons" rule from context/athena.md, not just a default.

import fs from 'fs/promises'
import path from 'path'
import { askForTool, type ToolDef } from './claude'
import { env } from './env'
import { textToSpeechBuffer } from './elevenlabs'
import { createCardsBulk, countR01Cards, type AthenaTab } from '../../tools/athena-db'

const MODEL = 'claude-sonnet-4-6'
const HOST_VOICE = 'wCizWKvnaS3LOIUwHo98'   // Ava
const EXPERT_VOICE = 'Ln7FbpLNuLn2OdYq2w7S' // Simon

// ─── R01 seed cards ───────────────────────────────────────────────────────────

interface SeedCard { front: string; back: string; note: string }

const R01_SEED_PROMPT = `You are generating flashcards for the CII R01 Financial Services, Regulation and Ethics examination. Generate 40 high-quality flashcard pairs covering: the FCA's objectives and powers, the Financial Services and Markets Act 2000, the Principles for Businesses (PRIN), conduct of business rules, consumer duty, anti-money laundering requirements, GDPR basics for financial advisers, complaint handling (FOS), the compensation scheme (FSCS), and professional ethics. For each card, provide: front (the question, max 25 words), back (the direct answer, max 40 words), and a brief one-sentence "why this matters for an adviser" note.`

const R01_SEED_TOOL: ToolDef = {
  name: 'submit_r01_cards',
  description: 'Submit the 40 generated R01 flashcards.',
  input_schema: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            front: { type: 'string' },
            back: { type: 'string' },
            note: { type: 'string' },
          },
          required: ['front', 'back', 'note'],
        },
      },
    },
    required: ['cards'],
  },
}

// Forcing a tool call (rather than parsing free-text JSON) sidesteps a real
// failure hit during testing: large multi-field generations can come back
// with literal newlines inside a string value instead of an escaped \n,
// which breaks JSON.parse but is a non-issue for tool-call input — the API
// is responsible for producing valid structured content there, not us.
export async function generateR01SeedCards(): Promise<SeedCard[]> {
  const result = await askForTool<{ cards: SeedCard[] }>('', R01_SEED_PROMPT, R01_SEED_TOOL, 6000, MODEL)
  return result.cards
}

// Called on R01 tab mount. Returns the number of cards inserted (0 if the
// deck already has R01 cards — never re-seeds on top of existing material).
export async function seedR01IfEmpty(): Promise<number> {
  const existing = await countR01Cards()
  if (existing > 0) return 0
  const cards = await generateR01SeedCards()
  return createCardsBulk(cards.map(c => ({ tab: 'r01' as AthenaTab, front: c.front, back: c.back, note: c.note })))
}

// ─── Product knowledge extraction ────────────────────────────────────────────

export interface ProductFlashcard { front: string; back: string; note: string }
export interface ProductMCQ { question: string; options: [string, string, string, string]; correct: 0 | 1 | 2 | 3; explanation: string }

export interface ProductExtraction {
  name: string
  summary: string
  salesAngles: string[]
  flashcards: ProductFlashcard[]
  mcqs: ProductMCQ[]
  podcastScript: string
}

function buildProductPrompt(documentText: string): string {
  return `You are building a product knowledge base for Archie, a wealth management trainee at deVere Group. He is talking to high-net-worth individuals in Switzerland. From the following product document, extract and generate:

name: Product name (short, 2–5 words)
summary: A 3–4 sentence plain-English summary of what this product is and who it is for
salesAngles: An array of 4–6 punchy sales angles written the way Archie would say them on a cold call. Bias toward angles like "this is something institutional investors use that isn't available at your high street bank", "our high-net-worth clients utilise this heavily", "it gives you access to markets you simply can't get through a pension or ISA". Be specific to this product.
flashcards: An array of 15 flashcard objects {front, back, note} covering what the product is, how it works, who it suits, tax treatment, key risks, and typical client profile
mcqs: An array of 8 MCQ objects {question, options: string[4], correct: 0|1|2|3, explanation} — exam-style questions about this product
podcastScript: A lively two-voice podcast script (speakers: "HOST" and "EXPERT") that explains this product from scratch and weaves in the sales angles naturally. Aim for 600–900 words of dialogue. Make it sound like a real conversation, not a lecture. End with the HOST summarising the three things Archie should remember when pitching this product. Format every line as "HOST: ..." or "EXPERT: ..." — one turn per line.

DOCUMENT:
${documentText}`
}

const PRODUCT_EXTRACTION_TOOL: ToolDef = {
  name: 'submit_product_extraction',
  description: 'Submit the extracted product knowledge base content.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      summary: { type: 'string' },
      salesAngles: { type: 'array', items: { type: 'string' } },
      flashcards: {
        type: 'array',
        items: {
          type: 'object',
          properties: { front: { type: 'string' }, back: { type: 'string' }, note: { type: 'string' } },
          required: ['front', 'back', 'note'],
        },
      },
      mcqs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            correct: { type: 'integer' },
            explanation: { type: 'string' },
          },
          required: ['question', 'options', 'correct', 'explanation'],
        },
      },
      podcastScript: { type: 'string' },
    },
    required: ['name', 'summary', 'salesAngles', 'flashcards', 'mcqs', 'podcastScript'],
  },
}

export async function extractProductFromText(documentText: string): Promise<ProductExtraction> {
  return askForTool<ProductExtraction>('', buildProductPrompt(documentText), PRODUCT_EXTRACTION_TOOL, 8000, MODEL)
}

// ─── Podcast audio ────────────────────────────────────────────────────────────

interface ScriptLine { speaker: 'HOST' | 'EXPERT'; text: string }

function parsePodcastScript(script: string): ScriptLine[] {
  const lines: ScriptLine[] = []
  for (const raw of script.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(HOST|EXPERT)\s*:\s*(.+)$/i)
    if (m) lines.push({ speaker: m[1]!.toUpperCase() as 'HOST' | 'EXPERT', text: m[2]!.trim() })
  }
  return lines
}

// Podcasts live next to the DB file — DATABASE_URL is './maia.db' locally and
// '/data/maia.db' on Railway's volume, so deriving from it gives the right
// path in both places with no separate env var to keep in sync.
function podcastsDir(): string {
  return path.join(path.dirname(path.resolve(/* turbopackIgnore: true */ process.cwd(), env.DATABASE_URL())), 'podcasts')
}

export function podcastPath(productId: string): string {
  return path.join(podcastsDir(), `${productId}.mp3`)
}

// Generates each line's audio separately (alternating Ava/Simon) and
// concatenates the raw MP3 buffers — per spec, not a re-encode/mux. Returns
// the written file path, or null if the script had no parseable lines or
// every TTS call failed.
export async function generatePodcastAudio(script: string, productId: string): Promise<string | null> {
  const lines = parsePodcastScript(script)
  if (lines.length === 0) return null

  const buffers: Buffer[] = []
  for (const line of lines) {
    const voiceId = line.speaker === 'HOST' ? HOST_VOICE : EXPERT_VOICE
    const buf = await textToSpeechBuffer(line.text, voiceId)
    if (buf) buffers.push(buf)
  }
  if (buffers.length === 0) return null

  const dir = podcastsDir()
  await fs.mkdir(dir, { recursive: true })
  const filePath = podcastPath(productId)
  await fs.writeFile(filePath, Buffer.concat(buffers))
  return filePath
}
