// POST /api/dashboard/nexus/infer-employment-types — classifies up to 20
// unclassified prospects (employment_type null, job_role set) per call,
// caching each result to the DB immediately. Called once per NexusWorkspace
// page load; already-classified rows (AI-inferred or manually overridden)
// are never re-run — see tools/nexus-db.ts's getUnclassifiedProspects.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { inferEmploymentType } from '@/lib/nexus-employment'
import { getUnclassifiedProspects, setEmploymentType } from '../../../../../../tools/nexus-db'

const BATCH_SIZE = 20
const CONCURRENCY = 5

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function POST() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const unclassified = await getUnclassifiedProspects(BATCH_SIZE)
    if (unclassified.length === 0) {
      return NextResponse.json({ classified: 0 })
    }

    let classified = 0
    await mapWithConcurrency(unclassified, CONCURRENCY, async p => {
      try {
        const type = await inferEmploymentType(p.job_role)
        await setEmploymentType(p.id, type)
        classified++
      } catch (err) {
        console.error(`[nexus/infer-employment-types] failed for prospect ${p.id}:`, err)
      }
    })

    return NextResponse.json({ classified })
  } catch (err) {
    console.error('[nexus/infer-employment-types] failed:', err)
    return NextResponse.json({ error: 'Classification failed' }, { status: 500 })
  }
}
