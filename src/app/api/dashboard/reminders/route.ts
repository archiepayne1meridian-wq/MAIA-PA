import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getReminders, addReminder } from '../../../../../tools/reminders'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const reminders = await getReminders()
  return NextResponse.json({ reminders })
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { text, due_date } = await req.json().catch(() => ({})) as { text?: string; due_date?: string | null }
  if (!text?.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }
  const reminder = await addReminder(text.trim(), due_date ?? null)
  return NextResponse.json({ reminder })
}
