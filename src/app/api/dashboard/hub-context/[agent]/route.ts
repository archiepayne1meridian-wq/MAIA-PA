// Right-panel context data for the new three-column dashboard shell.
// Section-building logic lives in src/lib/hub-context-sections.ts (shared
// with the agent rail's live preview line) — this file is just the dispatch.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { buildNexusContextSections } from '@/lib/nexus'
import {
  type Section, hubSections, newsSections, callsSections, linkedinSections,
  practiceSections, studySections, EMPTY_AGENT_SECTIONS,
} from '@/lib/hub-context-sections'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { agent } = await params

  try {
    let sections: Section[]
    switch (agent) {
      case 'hub': sections = await hubSections(); break
      case 'news': sections = await newsSections(); break
      case 'calls': sections = await callsSections(); break
      case 'linkedin': sections = await linkedinSections(); break
      case 'practice': sections = await practiceSections(); break
      case 'study': sections = await studySections(); break
      case 'prospects': sections = await buildNexusContextSections(); break
      default: sections = EMPTY_AGENT_SECTIONS[agent] ?? [{ type: 'empty', title: 'CONTEXT', message: 'Unknown agent.' }]
    }
    return NextResponse.json({ sections })
  } catch (err) {
    console.error(`[hub-context/${agent}] failed:`, err)
    return NextResponse.json({ sections: [{ type: 'empty', title: 'CONTEXT', message: 'Failed to load.' }] })
  }
}
