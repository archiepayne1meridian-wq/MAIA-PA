// Standalone PDF text extractor, run as a child process from
// src/lib/muse-file-extract.ts. Kept out of the Next.js API route entirely —
// pdfjs-dist's legacy Node build resolves its worker via a runtime
// require.resolve() that Turbopack's dev-mode bundler corrupts when the
// module is loaded inside a Next.js route handler ("Cannot find package
// '[project]'"). Running it as a plain `node` process sidesteps the bundler
// altogether — verified to work standalone before wiring this in.
//
// Usage: node scripts/muse-pdf-extract.mjs <path-to-pdf>
// Prints {"text": "..."} to stdout on success, exits 1 with stderr on failure.

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

async function main() {
  const filePath = process.argv[2]
  if (!filePath) throw new Error('usage: muse-pdf-extract.mjs <path-to-pdf>')

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  const standardFontDataUrl = path.join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts') + '/'

  const data = new Uint8Array(fs.readFileSync(filePath))
  const pdf = await pdfjsLib.getDocument({ data, standardFontDataUrl }).promise

  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map(item => ('str' in item ? item.str : '')).join(' '))
  }

  process.stdout.write(JSON.stringify({ text: pages.join('\n\n').trim() }))
}

main().catch(err => {
  process.stderr.write(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
