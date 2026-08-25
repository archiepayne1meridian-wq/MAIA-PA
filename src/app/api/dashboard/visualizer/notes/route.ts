import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { listNotes, createNote } from '../../../../../../tools/visualizer-db'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const notes = await listNotes()
  return NextResponse.json({ notes })
}

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as {
    name?: string
    underlyingAsset?: string
    autocallBarrier?: number
    couponBarrier?: number
    capitalProtection?: number
    couponRate?: number
    termYears?: number
    observationFrequency?: string
    investmentAmount?: number
  }

  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const note = await createNote({
    name: body.name,
    underlyingAsset: body.underlyingAsset ?? '',
    autocallBarrier: body.autocallBarrier ?? 100,
    couponBarrier: body.couponBarrier ?? 70,
    capitalProtection: body.capitalProtection ?? 60,
    couponRate: body.couponRate ?? 10,
    termYears: body.termYears ?? 6,
    observationFrequency: body.observationFrequency ?? 'quarterly',
    investmentAmount: body.investmentAmount ?? 100000,
  })

  return NextResponse.json({ note })
}
