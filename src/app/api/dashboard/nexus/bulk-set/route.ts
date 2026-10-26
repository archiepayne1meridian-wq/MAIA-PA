// POST /api/dashboard/nexus/bulk-set — "apply to all empty" toolbar actions.
// Body: { field: 'lead_channel' | 'country', value: string, preview?: boolean }
// preview:true returns the count without writing anything (for the "This
// will update N prospects. Continue?" confirm step); omitted/false applies
// it. Never touches a row where the field already has a value.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { countEmptyField, bulkSetFieldWhereEmpty } from '../../../../../../tools/nexus-db'

const VALID_FIELDS = ['lead_channel', 'country'] as const
type Field = typeof VALID_FIELDS[number]

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { field, value, preview } = await req.json().catch(() => ({})) as { field?: string; value?: string; preview?: boolean }
  if (!VALID_FIELDS.includes(field as Field) || !value?.trim()) {
    return NextResponse.json({ error: 'field (lead_channel | country) and value are required' }, { status: 400 })
  }

  try {
    if (preview) {
      const count = await countEmptyField(field as Field)
      return NextResponse.json({ count })
    }
    const updated = await bulkSetFieldWhereEmpty(field as Field, value.trim())
    return NextResponse.json({ updated })
  } catch (err) {
    console.error('[nexus/bulk-set] failed:', err)
    return NextResponse.json({ error: 'Bulk update failed' }, { status: 500 })
  }
}
