// POST /api/dashboard/meetings/save — matches the debriefed prospect by name
// (fuzzy, then AI fallback — same two-pass matcher the NEXUS wash parser
// uses) and appends the structured notes to nexus_prospects.notes. If no
// confident match, returns candidates for the frontend to show a manual
// disambiguation dropdown instead of guessing.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { findProspectMatch, aiMatchNames } from '@/lib/nexus'
import { formatNotesForCrm } from '@/lib/meetings'
import { getAllNamesLower, getProspectById, updateProspect } from '../../../../../../tools/nexus-db'
import { getMeetingSession } from '../../../../../../tools/meetings-db'

const MAX_CANDIDATES = 8

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { sessionId, prospectId } = await req.json().catch(() => ({})) as { sessionId?: string; prospectId?: string }
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  }
  const session = await getMeetingSession(sessionId)
  const notes = session?.notes
  if (!notes) {
    return NextResponse.json({ error: 'Meeting session not found' }, { status: 404 })
  }

  try {
    let targetId = prospectId ?? null

    if (!targetId) {
      const existing = await getAllNamesLower()
      const name = notes.prospectName?.trim()

      if (name) {
        const ruleMatch = findProspectMatch(name, existing)
        if (ruleMatch) {
          targetId = ruleMatch.id
        } else {
          const [aiResult] = await aiMatchNames([name], existing)
          if (aiResult?.prospectId) targetId = aiResult.prospectId
        }
      }

      if (!targetId) {
        const tokens = (name ?? '').toLowerCase().split(/\s+/).filter(Boolean)
        const candidates = tokens.length > 0
          ? existing.filter(p => tokens.some(t => p.firstLower.includes(t) || p.lastLower.includes(t)))
          : []

        // Zero candidates isn't "ambiguous" (pick one of several) — it's
        // "no match in the CRM at all". Distinct response so the frontend
        // doesn't render an empty, unusable dropdown.
        if (candidates.length === 0) {
          return NextResponse.json({ noMatch: true })
        }

        return NextResponse.json({
          needsDisambiguation: true,
          candidates: candidates.slice(0, MAX_CANDIDATES).map(p => ({ id: p.id, name: p.name, company: p.company })),
        })
      }
    }

    const prospect = await getProspectById(targetId)
    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
    }

    const appended = prospect.notes ? `${prospect.notes}\n\n${formatNotesForCrm(notes)}` : formatNotesForCrm(notes)
    const fields: { notes: string; company?: string } = { notes: appended }
    if (notes.employerMentioned && !prospect.company) fields.company = notes.employerMentioned

    await updateProspect(targetId, fields)
    return NextResponse.json({ saved: true, prospectId: targetId, prospectName: prospect.first_name ? `${prospect.first_name} ${prospect.last_name ?? ''}`.trim() : null })
  } catch (err) {
    console.error('[meetings/save] failed:', err)
    const msg = err instanceof Error ? err.message : 'Save failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
