import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { buildNexusContextSections } from '@/lib/nexus'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const sections = await buildNexusContextSections()
    return NextResponse.json({ sections })
  } catch (err) {
    console.error('[nexus/context] failed:', err)
    return NextResponse.json({ sections: [{ type: 'empty', title: 'CONTEXT', message: 'Failed to load.' }] })
  }
}
