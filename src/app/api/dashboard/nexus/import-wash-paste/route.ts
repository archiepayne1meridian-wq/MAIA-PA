// POST /api/dashboard/nexus/import-wash-paste — replaces the .xlsx upload
// (import-wash-xlsx, left in place but no longer linked from the UI) with a
// direct paste: Archie copies rows straight out of the wash results sheet.
// Fixed 3-column format, no header row — First Name, Last Name, Result.
// Tab-separated (Excel's default copy format) or comma-separated both work.
// Same append-only upgrade rule as the old xlsx path (tools/nexus-db.ts's
// applyWashUpgrade) — a row that can't move forward (e.g. a Green re-sent as
// Red) is silently skipped, not downgraded.

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

// The paste format carries no date column — today's date is the correct
// "date washed" for a result being processed right now.
function todayFormatted(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

interface ParsedRow {
  firstName: string
  lastName: string
  washResult: string | null
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { text } = await req.json().catch(() => ({})) as { text?: string }
  if (!text?.trim()) {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }

  const rows: ParsedRow[] = text.trim().split('\n').map(row => {
    const cols = row.includes('\t') ? row.split('\t') : row.split(',')
    return {
      firstName: cols[0]?.trim() ?? '',
      lastName: cols[1]?.trim() ?? '',
      washResult: cols[2]?.trim() || null,
    }
  }).filter(r => r.firstName && r.lastName)

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid rows found — expected First Name, Last Name, Result per line' }, { status: 400 })
  }

  try {
    const existing = await getAllNamesLower()
    const dateWashed = todayFormatted()
    let updated = 0
    const unmatched: string[] = []
    const invalid: string[] = []

    for (const row of rows) {
      const washResult = row.washResult ? normaliseWash(row.washResult) : null
      if (!washResult) {
        invalid.push(`${row.firstName} ${row.lastName}`.trim())
        continue
      }

      const nameLower = `${row.firstName.toLowerCase()} ${row.lastName.toLowerCase()}`.trim()
      const match = existing.find(n => `${n.firstLower} ${n.lastLower}`.trim() === nameLower)

      if (!match) {
        unmatched.push(`${row.firstName} ${row.lastName}`.trim())
        continue
      }

      const applied = await applyWashUpgrade(match.id, { washResult, dateWashed })
      if (applied) updated++
    }

    return NextResponse.json({ updated, unmatched, invalid, totalRows: rows.length })
  } catch (err) {
    console.error('[nexus/import-wash-paste] failed:', err)
    const message = err instanceof Error ? err.message : 'Failed to process pasted rows'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
