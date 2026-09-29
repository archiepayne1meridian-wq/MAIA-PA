import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getAllPreferences, addPreference, getPendingProposals, type RuleType } from '@/lib/preferences'

const VALID_RULE_TYPES: RuleType[] = ['exclude', 'include', 'style', 'behaviour']

// GET — all preferences grouped by category, plus any pending proposals.
export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [all, proposals] = await Promise.all([getAllPreferences(), getPendingProposals()])

  const grouped: Record<string, typeof all> = {}
  for (const pref of all) {
    (grouped[pref.category] ??= []).push(pref)
  }

  return NextResponse.json({ grouped, proposals })
}

// POST — add a new preference, saved as confirmed immediately.
export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    category?: string
    rule_type?: string
    rule_value?: string
    rule_key?: string
  }

  const category = body.category?.trim()
  const rule_type = body.rule_type?.trim() as RuleType | undefined
  const rule_value = body.rule_value?.trim()

  if (!category || !rule_type || !rule_value) {
    return NextResponse.json({ error: 'category, rule_type, and rule_value are required' }, { status: 400 })
  }
  if (!VALID_RULE_TYPES.includes(rule_type)) {
    return NextResponse.json({ error: `rule_type must be one of: ${VALID_RULE_TYPES.join(', ')}` }, { status: 400 })
  }

  // rule_key isn't user-facing in the "add preference" form — derive a short
  // slug from the value if one wasn't supplied, so every row still has one.
  const rule_key = body.rule_key?.trim() || rule_value.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)

  const id = await addPreference({ category, rule_type, rule_key, rule_value, source: 'manual' })
  return NextResponse.json({ id })
}
