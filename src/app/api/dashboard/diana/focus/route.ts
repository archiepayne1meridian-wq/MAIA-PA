// GET /api/dashboard/diana/focus — today's focus card data. Reads the same
// maia_preferences keys APOLLO writes after a real call (todays_focus,
// weak_stage) — DIANA's own /end route writes the same keys after a practice
// session, so either source feeds this card.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getPreferences } from '@/lib/preferences'
import { stageDisplayLabel, type CallStage } from '@/lib/diana'

const VALID_STAGES: CallStage[] = ['ringing', 'opener', 'reasonable_ask', 'fact_find', 'enlarge', 'disturb', 'close', 'completed', 'lost']

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const prefs = await getPreferences('diana')
    const focus = prefs.find(p => p.rule_key === 'todays_focus')?.rule_value ?? null
    const weakStageRaw = prefs.find(p => p.rule_key === 'weak_stage')?.rule_value ?? null
    const weakStage = weakStageRaw && VALID_STAGES.includes(weakStageRaw as CallStage) ? weakStageRaw as CallStage : null

    return NextResponse.json({
      focus,
      weakStage,
      weakStageLabel: weakStage ? stageDisplayLabel(weakStage) : null,
      hasData: focus !== null,
    })
  } catch (err) {
    console.error('[diana/focus] failed:', err)
    return NextResponse.json({ focus: null, weakStage: null, weakStageLabel: null, hasData: false })
  }
}
