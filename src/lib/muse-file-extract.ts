// Server-side text extraction for MUSE file uploads. Runs in the Next.js API
// route (Node.js), not the browser — separate from the client-side PDF
// extraction already used by the paste/drop flow in MuseWorkspace.tsx.

import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export type UploadFileKind = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'txt' | 'md' | 'image' | 'other'

const EXT_KIND: Record<string, UploadFileKind> = {
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',
  pptx: 'pptx',
  txt: 'txt',
  md: 'md',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
}

export function kindForFilename(filename: string): UploadFileKind | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_KIND[ext] ?? null
}

// Runs as a genuinely separate `node` process (scripts/muse-pdf-extract.mjs)
// rather than importing pdfjs-dist directly into this route. pdfjs-dist's
// legacy Node build resolves its worker via a runtime require.resolve() that
// Turbopack's dev-mode bundler corrupts when loaded inside a Next.js route
// handler ("Setting up fake worker failed: Cannot find package '[project]'").
// A plain `node` invocation sidesteps the bundler entirely — verified to work
// standalone. serverExternalPackages in next.config.ts wasn't sufficient on
// its own to fix this.
async function extractPdf(buffer: Buffer): Promise<string> {
  const tmpFile = path.join(os.tmpdir(), `muse-upload-${crypto.randomUUID()}.pdf`)
  await fs.writeFile(tmpFile, buffer)
  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'muse-pdf-extract.mjs')
    const { stdout } = await execFileAsync('node', [scriptPath, tmpFile], { maxBuffer: 1024 * 1024 * 50 })
    const parsed = JSON.parse(stdout) as { text: string }
    return parsed.text
  } finally {
    await fs.unlink(tmpFile).catch(() => { /* best effort cleanup */ })
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value.trim()
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'buffer' })
  return wb.SheetNames
    .map(name => {
      const sheet = wb.Sheets[name]
      const csv = XLSX.utils.sheet_to_csv(sheet)
      return `### ${name}\n${csv}`
    })
    .join('\n\n')
    .trim()
}

// Returns '' for kinds with no text extraction (pptx, image, other) — the
// caller stores the file itself in that case, per the "images/other: store
// file only" rule.
export async function extractText(buffer: Buffer, kind: UploadFileKind): Promise<string> {
  switch (kind) {
    case 'pdf': return extractPdf(buffer)
    case 'docx': return extractDocx(buffer)
    case 'xlsx': return extractXlsx(buffer)
    case 'txt':
    case 'md': return buffer.toString('utf-8').trim()
    default: return ''
  }
}

export const MIME_BY_KIND: Record<UploadFileKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  image: 'image', // resolved from the actual File.type at upload time, this is only a fallback
  other: 'application/octet-stream',
}
