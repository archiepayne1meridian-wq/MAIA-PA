// MUSE handler — confirm/discard delivery for the dashboard, auto-harvest stub.
// Log all actions to activity with agent: 'MUSE'.

import { eq, and, gte, like } from 'drizzle-orm'
import {
  getPendingById,
  updatePending,
  saveEntry,
  saveLink,
  getEntryIdsByTitles,
} from '../../tools/muse'
import { CASSANDRA_SIGNALS, savePost, getRecentPosts } from '../../tools/iris'
import { processInput } from './muse'
import { trackRejection } from './preferences'
import { getDb } from '@/db'
import { activity, mcq_attempts, quiz_sessions, muse_pending } from '@/db/schema'

// ─── Confirm handler (POST /api/dashboard/muse/confirm) ──────────────────────

export interface MuseConfirmResult {
  status: 'approved' | 'discarded' | 'not_found'
  message: string
  entryId?: string
  irisSurfaced?: boolean
  cisiModule?: string | null
}

export async function handleMuseConfirm(
  pendingId: string,
  decision: 'keep' | 'discard',
): Promise<MuseConfirmResult> {
  const pending = await getPendingById(pendingId)
  if (!pending) {
    return { status: 'not_found', message: 'Pending item not found.' }
  }

  if (decision === 'discard') {
    await updatePending(pendingId, 'discarded')
    await insertActivity('muse_confirm', `${pendingId}: discard`, 'status: discarded')

    // Feeds MAIA's pattern-detection tracker — scoped to items sourced from
    // CASSANDRA specifically, per the "discard a CASSANDRA item" trigger. In
    // practice source_agent is currently always null here: CASSANDRA auto-files
    // straight to muse_entries via saveEntry (bypassing muse_pending/this confirm
    // flow entirely — see src/lib/cassandra.ts's fileCallAngleToMuse), so this
    // never fires today. Left wired correctly rather than removed, so it starts
    // working the moment CASSANDRA content ever does flow through the pending queue.
    if (pending.source_agent === 'CASSANDRA') {
      void trackRejection('cassandra_pending_item', 'cassandra', `Discarded a CASSANDRA-sourced MUSE pending item: "${pending.suggested_title}"`).catch(
        err => console.error('[muse] trackRejection failed:', err),
      )
    }
    return { status: 'discarded', message: `"${pending.suggested_title}" dropped.` }
  }

  // keep → save to muse_entries + create link rows
  const now = Math.floor(Date.now() / 1000)
  const entryId = await saveEntry({
    sector: pending.suggested_sector,
    title: pending.suggested_title,
    summary: pending.suggested_summary,
    content: pending.suggested_content,
    brief_depth: pending.suggested_depth,
    source: pending.source,
    source_agent: pending.source_agent,
    status: 'active',
    date_filed: now,
    last_updated: now,
  })

  // Resolve link titles to entry IDs and create muse_links rows
  const linkTitles = (() => {
    try {
      return JSON.parse(pending.suggested_links) as string[]
    } catch {
      return [] as string[]
    }
  })()

  if (linkTitles.length > 0) {
    const resolved = await getEntryIdsByTitles(linkTitles)
    await Promise.all(resolved.map(r => saveLink(entryId, r.id, 'related')))
  }

  await updatePending(pendingId, 'approved')

  // IRIS surfacing + ATHENA feedback loop (fast DB queries, no Haiku)
  const irisSurfaced = await maybeQueueForIris(pending.suggested_title, pending.suggested_sector)
  const cisiModule =
    pending.suggested_sector === 'Training'
      ? detectCisiModule(pending.suggested_title, pending.suggested_content)
      : null

  await insertActivity('muse_confirm', `${pendingId}: keep`, `entry: ${entryId}`)

  const linkConfirm = linkTitles.length > 0 ? ` (linked to: ${linkTitles.join(', ')})` : ''
  return {
    status: 'approved',
    message: `"${pending.suggested_title}" filed to ${pending.suggested_sector}${linkConfirm}.`,
    entryId,
    irisSurfaced,
    cisiModule,
  }
}

// ─── Auto-harvest ─────────────────────────────────────────────────────────────
// Suggests MUSE pending entries from other agents' activity (ATHENA weak-topic
// detection, CASSANDRA brief signals) — stored for Archie to confirm/discard
// from the dashboard MUSE workspace, same as any other pending item.

export function checkMuseHarvest(
  agent: string,
  eventType: string,
  data: Record<string, unknown>,
): void {
  runHarvest(agent, eventType, data).catch(err => {
    console.error('[muse] harvest error:', err)
  })
}

async function runHarvest(
  agent: string,
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (agent === 'ATHENA' && eventType === 'quiz_complete') {
    await runAthenaHarvest(data)
  } else if (agent === 'CASSANDRA' && eventType === 'brief_saved') {
    await runCassandraHarvest(data)
  }
}

async function runAthenaHarvest(data: Record<string, unknown>): Promise<void> {
  const moduleId = data.moduleId as string
  const moduleName = (data.moduleName as string) || moduleId
  const sessionScore = data.score as number
  const sessionTotal = data.total as number

  // Skip immediately if this session wasn't low
  if (!moduleId || sessionTotal === 0 || sessionScore / sessionTotal >= 0.6) return

  // Count completed sessions for this module scoring < 60% in last 14 days
  const since = Math.floor(Date.now() / 1000) - 14 * 86400
  const rows = await getDb()
    .select({
      session_id: mcq_attempts.session_id,
      correct: mcq_attempts.correct,
    })
    .from(mcq_attempts)
    .innerJoin(quiz_sessions, eq(mcq_attempts.session_id, quiz_sessions.id))
    .where(and(eq(mcq_attempts.module, moduleId), gte(quiz_sessions.completed_at, since)))

  const bySession = new Map<string, { hits: number; total: number }>()
  for (const r of rows) {
    const e = bySession.get(r.session_id) ?? { hits: 0, total: 0 }
    e.hits += r.correct
    e.total += 1
    bySession.set(r.session_id, e)
  }

  let lowCount = 0
  for (const { hits, total } of bySession.values()) {
    if (total > 0 && hits / total < 0.6) lowCount++
  }

  if (lowCount < 3) return

  // Dedup: skip if there's already an awaiting pending item mentioning this module
  const existing = await getDb()
    .select({ id: muse_pending.id })
    .from(muse_pending)
    .where(and(eq(muse_pending.status, 'awaiting'), like(muse_pending.suggested_content, `%${moduleId}%`)))
    .limit(1)
  if (existing.length > 0) return

  const content =
    `Study brief needed: ${moduleName} — ${lowCount} sessions below 60% in the last 14 days. ` +
    `Generate a concise study brief for this CISI topic to help a trainee financial adviser improve.`

  await processInput(content, 'brain_dump', 'Training')
}

async function runCassandraHarvest(data: Record<string, unknown>): Promise<void> {
  const briefText = data.briefText as string
  if (!briefText) return

  const SECTOR_MAP: Record<string, string> = {
    'IPO': 'Funds & Macro',
    'Rate decision': 'Funds & Macro',
    'Earnings': 'Funds & Macro',
    'Crypto': 'Funds & Macro',
    'Regulatory change': 'Regulations',
  }

  let harvested = 0

  for (const signal of CASSANDRA_SIGNALS) {
    if (harvested >= 2) break

    const m = signal.pattern.exec(briefText)
    if (!m) continue

    const snippet = briefText
      .slice(Math.max(0, m.index - 30), Math.min(briefText.length, m.index + 200))
      .replace(/\n/g, ' ')
      .trim()

    const sector = SECTOR_MAP[signal.label] ?? 'Funds & Macro'
    const content = `${signal.label} signal from today's CASSANDRA market brief: ${snippet}`

    const { pendingIds } = await processInput(content, 'brain_dump', sector)
    if (pendingIds.length === 0) continue
    harvested++
  }
}

// ─── Step 6 helpers ───────────────────────────────────────────────────────────

async function maybeQueueForIris(title: string, sector: string): Promise<boolean> {
  if (sector !== 'Funds & Macro' && sector !== 'Regulations') return false

  const recentPosts = await getRecentPosts(7)
  const titleWords = title
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length >= 4)
  const alreadyQueued = recentPosts.some(p =>
    titleWords.some(w => p.topic.toLowerCase().includes(w)),
  )
  if (alreadyQueued) return false

  await savePost({
    slot: '',
    pillar: 1,
    topic: title,
    copy: '',
    image_prompt: null,
    image_url: null,
    format: null,
    status: 'suggested',
  })
  return true
}

function detectCisiModule(title: string, content: string): string | null {
  const text = `${title} ${content}`
  const match = text.match(/\b(CF\d+|R0[1-9]|J0[0-9]|J1[0-9]|AF\d+)\b/i)
  return match ? match[1]!.toUpperCase() : null
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function insertActivity(type: string, input: string, output: string): Promise<void> {
  try {
    await getDb().insert(activity).values({
      id: crypto.randomUUID(),
      event_id: `${type}_${Date.now()}`,
      type,
      agent: 'MUSE',
      input: input.slice(0, 500),
      output: output.slice(0, 500),
      status: 'success',
      created_at: Math.floor(Date.now() / 1000),
    })
  } catch {
    // Non-fatal
  }
}
