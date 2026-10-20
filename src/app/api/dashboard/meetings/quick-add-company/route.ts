// POST /api/dashboard/meetings/quick-add-company — "this company isn't on
// the map yet — add it?" nudge from the Meetings page. The quick-add form
// only collects name/sector/area (no map coordinates in hand on this page),
// so new rows default to central Geneva — same spot MapCanvas centres the
// whole view on — until someone edits the pin's real location from the Map
// page later.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { addCompany, getAllCompanyNameVariants } from '../../../../../../tools/map-db'

const GENEVA_CENTER = { lat: 46.2044, lng: 6.1432 }

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { name, sector, area } = await req.json().catch(() => ({})) as {
    name?: string; sector?: string | null; area?: string | null
  }
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  try {
    const id = await addCompany({
      name: name.trim(),
      sector: sector?.trim() || null,
      area: area?.trim() || null,
      lat: GENEVA_CENTER.lat,
      lng: GENEVA_CENTER.lng,
    })
    return NextResponse.json({ id })
  } catch (err) {
    console.error('[meetings/quick-add-company] failed:', err)
    const msg = err instanceof Error ? err.message : 'Add company failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const name = req.nextUrl.searchParams.get('name')?.trim().toLowerCase()
  if (!name) return NextResponse.json({ exists: false })

  const variants = await getAllCompanyNameVariants()
  const exists = variants.some(v => v.variant.toLowerCase() === name || v.variant.toLowerCase().includes(name) || name.includes(v.variant.toLowerCase()))
  return NextResponse.json({ exists })
}
