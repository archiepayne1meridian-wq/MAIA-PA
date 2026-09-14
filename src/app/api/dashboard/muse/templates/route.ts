import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { listTemplates, createTemplate, type MuseTemplateInput } from '../../../../../../tools/muse'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const templates = await listTemplates()
  return NextResponse.json({ templates })
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as Partial<MuseTemplateInput>

  if (!body.name?.trim() || !body.category?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: 'name, category, and body are required' }, { status: 400 })
  }

  const id = await createTemplate({
    name: body.name.trim(),
    category: body.category.trim(),
    scenario: body.scenario ?? null,
    angle: body.angle ?? null,
    subject: body.subject ?? null,
    body: body.body,
    medium: body.medium ?? 'email',
  })

  return NextResponse.json({ id })
}
