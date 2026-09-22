// Tab 1 file upload — the only path in MUSE that ever stores a file's binary.
// CASSANDRA / APOLLO / ORACLE auto-filing routes never call this; they call
// saveEntry() directly (or via file-direct) with no fileData argument, so their
// entries keep has_file: 0 exactly as before this route existed.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { generateDirectFiling, autoTag, findRelatedEntries } from '@/lib/muse'
import { kindForFilename, extractText, MIME_BY_KIND } from '@/lib/muse-file-extract'
import {
  saveEntry, saveLink, getEntryIdsByTitles, getAllEntryTitles,
  updateEntryTags, updateEntryLinkedEntries, attachFileToEntry, getEntry,
} from '../../../../../../tools/muse'

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50MB
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'md', 'png', 'jpg', 'jpeg']

function inferDepth(content: string): 'simple' | 'medium' | 'detailed' {
  if (content.length < 1000) return 'simple'
  if (content.length < 4000) return 'medium'
  return 'detailed'
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: `Unsupported file type ".${ext}" — allowed: ${ALLOWED_EXTENSIONS.join(', ')}` }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `File too large — max 50MB, got ${(file.size / (1024 * 1024)).toFixed(1)}MB` }, { status: 400 })
  }

  const entryId = (form.get('entryId') as string | null)?.trim() || undefined
  const sector = (form.get('sector') as string | null)?.trim() || undefined
  const titleField = (form.get('title') as string | null)?.trim() || undefined
  const context = (form.get('context') as string | null)?.trim() || undefined
  const entryType = (form.get('entryType') as string | null)?.trim() || 'knowledge'
  const privacyTierRaw = form.get('privacyTier') as string | null
  const privacyTier: 1 | 2 = privacyTierRaw === '2' ? 2 : 1
  // Not in the original field list — added so the client's "Text only" / "Keep
  // file + text" storage toggle actually has something to submit. Defaults to
  // true (matches "Keep file + text" being the pre-selected pill in the UI).
  const keepFileRaw = form.get('keepFile') as string | null
  const keepFile = keepFileRaw !== 'false'

  const kind = kindForFilename(file.name)
  if (!kind) return NextResponse.json({ error: 'Unrecognised file type' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  let extractedText: string
  try {
    extractedText = await extractText(buffer, kind)
  } catch (err) {
    console.error('[muse/upload] text extraction failed:', err)
    return NextResponse.json({ error: `Couldn't extract text from "${file.name}"` }, { status: 500 })
  }

  const mimeType = file.type || MIME_BY_KIND[kind]

  try {
    // ── Attach to an existing entry ───────────────────────────────────────
    if (entryId) {
      const existing = await getEntry(entryId)
      if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

      if (keepFile) {
        await attachFileToEntry(entryId, { file_name: file.name, file_type: mimeType, file_size: file.size, file_data: buffer })
      }

      return NextResponse.json({
        entryId,
        title: existing.title,
        tags: JSON.parse(existing.tags || '[]') as string[],
        fileStored: keepFile,
        fileName: file.name,
      })
    }

    // ── Create a new entry ──────────────────────────────────────────────
    if (!sector) return NextResponse.json({ error: 'sector is required when creating a new entry' }, { status: 400 })

    const textForEntry = extractedText || context || `[Uploaded file: ${file.name} — no text extracted]`
    const existingTitles = await getAllEntryTitles()

    let finalTitle = titleField
    let summary = `Uploaded file: ${file.name}`
    let linkTitles: string[] = []
    if (!finalTitle && extractedText.trim()) {
      const meta = await generateDirectFiling(extractedText, context, existingTitles)
      finalTitle = meta.title
      summary = meta.summary
      linkTitles = meta.links
    }
    finalTitle = finalTitle || file.name.replace(/\.[^.]+$/, '')

    const now = Math.floor(Date.now() / 1000)
    const tags = autoTag(extractedText || context || '', finalTitle)

    const newEntryId = await saveEntry(
      {
        sector,
        title: finalTitle,
        summary,
        content: textForEntry,
        brief_depth: inferDepth(textForEntry),
        source: 'dashboard_upload',
        source_agent: null,
        status: 'active',
        date_filed: now,
        last_updated: now,
        privacy_tier: privacyTier,
        entry_type: entryType,
        source_scenario: null,
        has_file: keepFile ? 1 : 0,
        file_name: keepFile ? file.name : null,
        file_type: keepFile ? mimeType : null,
        file_size: keepFile ? file.size : null,
      },
      keepFile ? buffer : undefined,
    )

    await updateEntryTags(newEntryId, tags)

    if (linkTitles.length > 0) {
      const resolved = await getEntryIdsByTitles(linkTitles)
      await Promise.all(resolved.map(r => saveLink(newEntryId, r.id, 'related')))
    }
    const relatedIds = await findRelatedEntries(newEntryId, tags, 5)
    if (relatedIds.length > 0) {
      await updateEntryLinkedEntries(newEntryId, relatedIds)
    }

    return NextResponse.json({ entryId: newEntryId, title: finalTitle, tags, fileStored: keepFile, fileName: file.name })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    console.error('[muse/upload] failed:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
