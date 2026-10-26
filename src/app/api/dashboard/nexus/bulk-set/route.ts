// POST /api/dashboard/nexus/bulk-set — silently fills a blank field for
// every prospect missing one. Body: { field: 'lead_channel' | 'country', value: string }
// Never touches a row where the field already has a value. Called
// automatically on every Nexus page load — no button, no confirm dialog.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { bulkSetFieldWhereEmpty } from '../../../../../../tools/nexus-db'

const VALID_FIELDS = ['lead_channel', 'country'] as const
type Field = typeof VALID_FIELDS[number]

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { field, value } = await req.json().catch(() => ({})) as { field?: string; value?: string }
  if (!VALID_FIELDS.includes(field as Field) || !value?.trim()) {
    return NextResponse.json({ error: 'field (lead_channel | country) and value are required' }, { status: 400 })
  }

  try {
    const updated = await bulkSetFieldWhereEmpty(field as Field, value.trim())
    return NextResponse.json({ updated })
  } catch (err) {
    console.error('[nexus/bulk-set] failed:', err)
    return NextResponse.json({ error: 'Bulk update failed' }, { status: 500 })
  }
}
