import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { analyseLinkedIn, buildFinancialProfile, buildAnglesSummary, toDisplayName } from '@/lib/oracle'
import { saveAnalysis } from '../../../../../../tools/oracle'
import { findCase, createCase, updateCase, addCaseEvent } from '../../../../../../tools/muse-cases'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { linkedinText?: string }
  if (!body.linkedinText?.trim()) {
    return NextResponse.json({ error: 'linkedinText is required' }, { status: 400 })
  }

  let analysis
  try {
    analysis = await analyseLinkedIn(body.linkedinText.trim())
  } catch (err) {
    console.error('[oracle/analyse] analysis failed:', err)
    return NextResponse.json({ error: 'Analysis failed — try again' }, { status: 500 })
  }

  // File to MUSE as a Tier 2 prospect case — muse_cases has no privacy-tier column
  // (case content is never sent to any AI model by the existing case-system design,
  // so there's nothing to gate here the way muse_entries.privacy_tier gates knowledge).
  const displayName = toDisplayName(analysis.prospect.name)
  const financialProfile = buildFinancialProfile(analysis)

  const existing = await findCase(displayName, analysis.prospect.current_employer)
  let caseId: string
  if (existing) {
    await updateCase(existing.id, {
      company: analysis.prospect.current_employer,
      location: analysis.prospect.current_location,
      occupation: analysis.prospect.current_role,
      financial_profile: financialProfile,
      status: 'active',
    })
    caseId = existing.id
  } else {
    caseId = await createCase({
      display_name: displayName,
      company: analysis.prospect.current_employer,
      location: analysis.prospect.current_location,
      occupation: analysis.prospect.current_role,
      financial_profile: financialProfile,
      status: 'active',
    })
  }

  await addCaseEvent(caseId, {
    event_type: 'oracle_estimate',
    date: new Date().toISOString().slice(0, 10),
    summary: 'Pension estimate generated from LinkedIn work history',
    what_suggested: buildAnglesSummary(analysis),
  })

  const analysisId = await saveAnalysis({
    raw_linkedin_text: body.linkedinText.trim(),
    analysis,
    muse_case_id: caseId,
  })

  return NextResponse.json({ id: analysisId, museCaseId: caseId, museDisplayName: displayName, analysis })
}
