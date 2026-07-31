import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { processReflection } from '@/lib/hera-handler'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { text } = await req.json().catch(() => ({})) as { text?: string }

  if (!text?.trim()) {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }

  try {
    const { response } = await processReflection(text.trim(), 'text')
    return NextResponse.json({ response })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reflection error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
