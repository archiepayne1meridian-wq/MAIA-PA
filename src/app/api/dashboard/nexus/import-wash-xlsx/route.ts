// POST /api/dashboard/nexus/import-wash-xlsx — compliance's daily wash
// results, delivered as a real .xlsx file. Column layout varies run to run,
// so headers are detected flexibly rather than assumed fixed. Upgrades are
// append-only (tools/nexus-db.ts's applyWashUpgrade) — a row that can't move
// forward (e.g. a Green being re-sent as Red) is silently skipped, not
// downgraded.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getAllNamesLower, applyWashUpgrade } from '../../../../../../tools/nexus-db'

function normaliseWash(raw: string): 'Green' | 'Red' | 'Do Not Contact' | null {
  const s = raw.trim().toLowerCase()
  if (s === 'green') return 'Green'
  if (s === 'red' || s === 'rewash') return 'Red'
  if (s === 'dnc' || s === 'do not contact') return 'Do Not Contact'
  return null
}

function findHeader(headers: string[], candidates: string[]): string | null {
  const lowerToOriginal = new Map(headers.map(h => [h.toLowerCase().trim(), h]))
  for (const c of candidates) {
    const hit = lowerToOriginal.get(c.toLowerCase())
    if (hit) return hit
  }
  return null
}

// A genuinely date-typed Excel cell comes back from sheet_to_json as a JS
// Date (reading the workbook with cellDates: true below) — left as a raw
// serial number or an auto-formatted string, it would silently store
// garbage like "46306" or US-style "10/11/26" instead of the DD/MM/YYYY the
// compliance files actually use. A date typed as plain text in the sheet
// comes back as a string already and is used as-is, matching "store dates
// as they come from the wash files".
function formatDateCell(value: unknown): string {
  if (value instanceof Date) {
    const dd = String(value.getDate()).padStart(2, '0')
    const mm = String(value.getMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}/${value.getFullYear()}`
  }
  return String(value ?? '').trim()
}

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
  if (ext !== 'xlsx' && ext !== 'xls') {
    return NextResponse.json({ error: 'Only .xlsx files are accepted' }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const sheet = wb.Sheets[wb.SheetNames[0]!]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[]
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No rows found in file' }, { status: 400 })
    }

    const headers = Object.keys(rows[0]!)
    const firstNameCol = findHeader(headers, ['First Name', 'FirstName'])
    const lastNameCol = findHeader(headers, ['Last Name', 'LastName'])
    const fullNameCol = findHeader(headers, ['Full Name', 'Name'])
    const resultCol = findHeader(headers, ['Wash Result', 'Result', 'Status'])
    const reasonCol = findHeader(headers, ['Wash Reason', 'Reason', 'Notes'])
    const dateCol = findHeader(headers, ['Date Washed', 'Date'])
    const rewashCol = findHeader(headers, ['Rewash After'])

    if (!resultCol) {
      return NextResponse.json({ error: 'Could not find a wash result column (expected "Wash Result", "Result", or "Status")' }, { status: 400 })
    }
    if (!(firstNameCol && lastNameCol) && !fullNameCol) {
      return NextResponse.json({ error: 'Could not find name columns (expected "First Name" + "Last Name", or "Full Name"/"Name")' }, { status: 400 })
    }

    const existing = await getAllNamesLower()
    let updated = 0
    const unmatched: string[] = []

    for (const row of rows) {
      const cell = (col: string | null): string => (col ? String(row[col] ?? '').trim() : '')
      const dateCell = (col: string | null): string => (col ? formatDateCell(row[col]) : '')

      let first: string, last: string
      if (firstNameCol && lastNameCol) {
        first = cell(firstNameCol)
        last = cell(lastNameCol)
      } else {
        const parts = cell(fullNameCol).split(/\s+/).filter(Boolean)
        first = parts[0] ?? ''
        last = parts.slice(1).join(' ')
      }
      if (!first && !last) continue

      const washResult = normaliseWash(cell(resultCol))
      if (!washResult) continue

      const nameLower = `${first.toLowerCase()} ${last.toLowerCase()}`.trim()
      const match = existing.find(n => `${n.firstLower} ${n.lastLower}`.trim() === nameLower)

      if (!match) {
        unmatched.push(`${first} ${last}`.trim())
        continue
      }

      const applied = await applyWashUpgrade(match.id, {
        washResult,
        washReason: cell(reasonCol) || null,
        dateWashed: dateCell(dateCol) || null,
        rewashAfter: dateCell(rewashCol) || null,
      })
      if (applied) updated++
    }

    return NextResponse.json({ updated, unmatched })
  } catch (err) {
    console.error('[nexus/import-wash-xlsx] failed:', err)
    const message = err instanceof Error ? err.message : 'Failed to process file'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
