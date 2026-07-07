// MUSE handler — intent detection, Slack delivery, harvest stub.
// Log all actions to activity with agent: 'MUSE'.

import { eq, and, gte, like } from 'drizzle-orm'
import { postMessage } from './slack'
import {
  getInsights,
  getPending,
  getAllEntryTitles,
  getPendingById,
  updatePending,
  updatePendingSlackTs,
  getPendingBySlackTs,
  saveEntry,
  saveLink,
  getEntryIdsByTitles,
  type MusePending,
} from '../../tools/muse'
import { CASSANDRA_SIGNALS, getTodaysBrief, savePost, getRecentPosts } from '../../tools/iris'
import { processInput, searchKnowledge } from './muse'
import { env } from './env'
import { getDb } from '@/db'
import { activity, mcq_attempts, quiz_sessions, muse_pending } from '@/db/schema'

// ─── Intent detection ─────────────────────────────────────────────────────────

type MuseIntent =
  | { type: 'search_sector'; sector: string; query: string }
  | { type: 'search_all'; query: string }
  | { type: 'file_entry'; content: string; sector?: string }
  | { type: 'brain_dump'; content: string }
  | { type: 'confirm'; pendingId: string; decision: 'keep' | 'discard' }
  | { type: 'status' }

export function detectMuseIntent(text: string): MuseIntent | null {
  const t = text.trim()
  if (!/^muse[,.]?\s+/i.test(t)) return null
  const body = t.replace(/^muse[,.]?\s*/i, '').trim()
  if (!body) return null

  // Status
  if (/^(what.?s pending|status|summary|pending|what do you know)\s*$/i.test(body)) {
    return { type: 'status' }
  }

  // Sector search: "search [sector] for [query]"
  const sectorSearch = body.match(
    /^search\s+(training|markets|products|regulations|sales[\s&]+prospecting|sales|expat\s+knowledge|expat|performance)\s+for\s+(.+)$/i,
  )
  if (sectorSearch) {
    return { type: 'search_sector', sector: sectorSearch[1]!.trim(), query: sectorSearch[2]!.trim() }
  }

  // Search all
  const searchAll = body.match(
    /^(?:search\s+everything\s+for|what\s+do\s+you\s+know\s+about|search\s+for|search\s+everything[:\s]+)([\s\S]+)$/i,
  )
  if (searchAll) {
    return { type: 'search_all', query: searchAll[1]!.trim() }
  }

  // Brain dump
  const brainDump = body.match(/^brain\s*dump[:\s]+([\s\S]+)$/i)
  if (brainDump) {
    return { type: 'brain_dump', content: brainDump[1]!.trim() }
  }

  // File entry
  const fileEntry = body.match(/^(?:file\s+this[:\s]+|add\s+this[:\s]+|save\s+this[:\s]+)([\s\S]+)$/i)
  if (fileEntry) {
    return { type: 'file_entry', content: fileEntry[1]!.trim() }
  }

  // Fallback: treat everything as a full search
  return { type: 'search_all', query: body }
}

// ─── Status handler ───────────────────────────────────────────────────────────

export async function handleMuseStatus(channel: string, slackUser?: string): Promise<void> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()
  await logRow(rowId, 'muse_status', 'status', slackUser)

  try {
    const { pending, recentEntries } = await getInsights()
    const pendingCount = pending.length
    const entryCount = recentEntries.length

    let msg = `🧠 *MUSE — Status*\n`
    msg += `*Pending confirmations:* ${pendingCount === 0 ? 'None — all clear' : `${pendingCount} awaiting your review`}\n`
    msg += `*Active entries:* ${entryCount === 0 ? 'Knowledge base is empty' : `${entryCount} recent entries`}\n`

    if (pendingCount > 0) {
      msg += '\n_Pending:_\n'
      for (const p of pending.slice(0, 3)) {
        msg += `• *${p.suggested_title}* (${p.suggested_sector})\n`
      }
    }

    msg += '\n_Filing and search will be available from Step 3._'

    await postMessage(channel, msg)
    await resolveRow(rowId, `status: ${pendingCount} pending, ${entryCount} entries`, startMs)
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    await errorRow(rowId, m, startMs)
    await postMessage(channel, `⚠ MUSE status error: ${m}`)
  }
}

// ─── Search handler ───────────────────────────────────────────────────────────

export async function handleMuseSearch(
  channel: string,
  query: string,
  sector?: string,
  slackUser?: string,
): Promise<void> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()
  await logRow(rowId, 'muse_search', query.slice(0, 400), slackUser)

  try {
    const { synthesis, results } = await searchKnowledge(query, sector)
    const scope = sector ? ` in ${sector}` : ' across all sectors'

    if (results.length === 0) {
      await postMessage(
        channel,
        `🔍 *MUSE — Search Results*\n*Query:* "${query}"${scope}\n\n${synthesis}`,
      )
      await resolveRow(rowId, 'no results', startMs)
      return
    }

    let msg = `🔍 *MUSE — Search Results*\n*Query:* "${query}"${scope}\n\n_${synthesis}_\n\n`
    results.forEach((r, i) => {
      const date = new Date(r.last_updated * 1000).toISOString().slice(0, 10)
      const snippet = r.summary.length > 120 ? r.summary.slice(0, 120) + '…' : r.summary
      msg += `${i + 1}. *${r.title}* — ${r.sector} — Updated ${date}\n`
      msg += `   ${snippet}\n`
      msg += `   _Why relevant: ${r.relevanceReason}_\n\n`
    })
    msg += 'Reply with a number to see the full entry.'

    await postMessage(channel, msg)
    await resolveRow(rowId, `${results.length} results`, startMs)
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    await errorRow(rowId, m, startMs)
    await postMessage(channel, `⚠ MUSE search error: ${m}`)
  }
}

// ─── File handler ────────────────────────────────────────────────────────────

export async function handleMuseFile(
  channel: string,
  content: string,
  sector?: string,
  slackUser?: string,
): Promise<void> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()
  await logRow(rowId, 'muse_file', content.slice(0, 400), slackUser)

  try {
    const { pendingIds, assessment } = await processInput(content, 'file', sector)

    if (assessment.isLowValue) {
      const reason = assessment.lowValueReason ?? "This doesn't add much to the knowledge base."
      await postMessage(
        channel,
        `🧠 *MUSE — Not filed*\n${reason}\n\n_Send more context if you'd like me to file it._`,
      )
      await resolveRow(rowId, `low_value: ${reason.slice(0, 200)}`, startMs)
      return
    }

    const pendingId = pendingIds[0]!
    const linksText =
      assessment.links.length > 0
        ? `_Key links: ${assessment.links.join(', ')}_`
        : '_No links to existing entries yet._'

    const msg =
      `🧠 *MUSE — New Entry*\n` +
      `*Sector:* ${assessment.sector} | *Depth:* ${assessment.depth}\n\n` +
      `*${assessment.title}*\n${assessment.summary}\n\n` +
      `${linksText}\n\n` +
      `Reply *keep* to file it, *discard* to drop it, or edit any detail.`

    const { ts } = await postMessage(channel, msg)
    await updatePendingSlackTs(pendingId, ts)

    await resolveRow(rowId, `pending: ${pendingId}`, startMs)
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    await errorRow(rowId, m, startMs)
    await postMessage(channel, `⚠ MUSE filing error: ${m}`)
  }
}

// ─── Brain dump handler ───────────────────────────────────────────────────────

export async function handleMuseBrainDump(
  channel: string,
  content: string,
  slackUser?: string,
): Promise<void> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()
  await logRow(rowId, 'muse_braindump', content.slice(0, 400), slackUser)

  try {
    const { pendingIds, assessment } = await processInput(content, 'brain_dump')

    if (assessment.isLowValue) {
      const reason = assessment.lowValueReason ?? "This doesn't add much to the knowledge base."
      await postMessage(
        channel,
        `🧠 *MUSE — Not filed*\n${reason}\n\n_Send more context if you'd like me to file it._`,
      )
      await resolveRow(rowId, `low_value: ${reason.slice(0, 200)}`, startMs)
      return
    }

    const pendingId = pendingIds[0]!
    const linksText =
      assessment.links.length > 0
        ? `_Key links: ${assessment.links.join(', ')}_`
        : '_No links to existing entries yet._'

    const msg =
      `🧠 *MUSE — New Entry (brain dump)*\n` +
      `*Sector:* ${assessment.sector} | *Depth:* ${assessment.depth}\n\n` +
      `*${assessment.title}*\n${assessment.summary}\n\n` +
      `${linksText}\n\n` +
      `Reply *keep* to file it, *discard* to drop it, or edit any detail.`

    const { ts } = await postMessage(channel, msg)
    await updatePendingSlackTs(pendingId, ts)

    await resolveRow(rowId, `pending: ${pendingId}`, startMs)
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    await errorRow(rowId, m, startMs)
    await postMessage(channel, `⚠ MUSE brain dump error: ${m}`)
  }
}

// ─── Confirm handler ──────────────────────────────────────────────────────────

export async function handleMuseConfirm(
  channel: string,
  pendingId: string,
  decision: 'keep' | 'discard',
  threadTs?: string,
  slackUser?: string,
): Promise<void> {
  const pending = await getPendingById(pendingId)
  if (!pending) {
    await postMessage(channel, `⚠ MUSE: pending item not found.`, threadTs)
    return
  }

  if (decision === 'discard') {
    await updatePending(pendingId, 'discarded')
    await postMessage(
      channel,
      `❌ *MUSE — Entry discarded.*\n_"${pending.suggested_title}"_ dropped.`,
      threadTs,
    )
    await insertActivity('muse_confirm', `${pendingId}: discard`, 'status: discarded', slackUser)
    return
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

  const linkConfirm =
    linkTitles.length > 0 ? `\n_Linked to: ${linkTitles.join(', ')}_` : ''

  // Step 6: IRIS surfacing + ATHENA feedback loop (fast DB queries, no Haiku)
  const irisSurfaced = await maybeQueueForIris(pending.suggested_title, pending.suggested_sector)
  const cisiModule =
    pending.suggested_sector === 'Training'
      ? detectCisiModule(pending.suggested_title, pending.suggested_content)
      : null

  let confirmMsg =
    `✅ *MUSE — Entry filed.*\n*"${pending.suggested_title}"* → ${pending.suggested_sector}${linkConfirm}`

  if (irisSurfaced) {
    confirmMsg += `\n\n📣 Also added to *IRIS topic queue* — want IRIS to draft a post on this?`
  }
  if (cisiModule) {
    confirmMsg += `\n\n📚 Looks like this covers *${cisiModule}*. Want me to push extra drill questions on this topic to ATHENA?`
  }

  await postMessage(channel, confirmMsg, threadTs)
  await insertActivity('muse_confirm', `${pendingId}: keep`, `entry: ${entryId}`, slackUser)
}

// ─── Thread routing ───────────────────────────────────────────────────────────

export async function getActiveMusePending(slackTs: string): Promise<MusePending | null> {
  return getPendingBySlackTs(slackTs)
}

export async function handleMuseThread(
  pending: MusePending,
  replyText: string,
  channel: string,
): Promise<void> {
  const lower = replyText.trim().toLowerCase()

  if (/^(keep|yes|file\s*it|confirm|ok)\s*$/i.test(lower)) {
    await handleMuseConfirm(channel, pending.id, 'keep', pending.slack_ts ?? undefined)
    return
  }

  if (/^(discard|no|drop\s*it|reject|nope)\s*$/i.test(lower)) {
    await handleMuseConfirm(channel, pending.id, 'discard', pending.slack_ts ?? undefined)
    return
  }

  // Edit instruction — stub in Step 2
  await postMessage(
    channel,
    `🧠 *MUSE — Edit instruction (stub)*\n_"${replyText}"_ noted. Edit and redraft will be active from Step 3.`,
    pending.slack_ts ?? undefined,
  )
}

// ─── Auto-harvest ─────────────────────────────────────────────────────────────

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

  const { pendingIds, assessment } = await processInput(content, 'brain_dump', 'Training')
  if (assessment.isLowValue || pendingIds.length === 0) return

  const pendingId = pendingIds[0]!
  const channel = env.SLACK_CHANNEL_ID()
  const msg =
    `🧠 *MUSE — Study Brief Suggested*\n` +
    `I noticed you've scored below 60% on *${moduleName}* ${lowCount} times recently. ` +
    `Want me to add a study brief to Training?\n\n` +
    `*${assessment.title}*\n${assessment.summary}\n\n` +
    `Reply *keep* to file it, *discard* to drop it.`

  const { ts } = await postMessage(channel, msg)
  await updatePendingSlackTs(pendingId, ts)
}

async function runCassandraHarvest(data: Record<string, unknown>): Promise<void> {
  const briefText = data.briefText as string
  if (!briefText) return

  const SECTOR_MAP: Record<string, string> = {
    'IPO': 'Markets',
    'Rate decision': 'Markets',
    'Earnings': 'Markets',
    'Crypto': 'Markets',
    'Regulatory change': 'Regulations',
  }

  const channel = env.SLACK_CHANNEL_ID()
  let harvested = 0

  for (const signal of CASSANDRA_SIGNALS) {
    if (harvested >= 2) break

    const m = signal.pattern.exec(briefText)
    if (!m) continue

    const snippet = briefText
      .slice(Math.max(0, m.index - 30), Math.min(briefText.length, m.index + 200))
      .replace(/\n/g, ' ')
      .trim()

    const sector = SECTOR_MAP[signal.label] ?? 'Markets'
    const content = `${signal.label} signal from today's CASSANDRA market brief: ${snippet}`

    const { pendingIds, assessment } = await processInput(content, 'brain_dump', sector)
    if (assessment.isLowValue || pendingIds.length === 0) continue

    const pendingId = pendingIds[0]!
    const msg =
      `🧠 *MUSE — Market Signal Detected*\n` +
      `*Signal:* ${signal.label} | *Sector:* ${sector}\n\n` +
      `*${assessment.title}*\n${assessment.summary}\n\n` +
      `Reply *keep* to file it, *discard* to drop it.`

    const { ts } = await postMessage(channel, msg)
    await updatePendingSlackTs(pendingId, ts)
    harvested++
  }
}

// Re-export for Slack thread save
export { updatePendingSlackTs }

// ─── Morning insight delivery (Step 6) ───────────────────────────────────────

export async function handleMuseMorningInsight(): Promise<void> {
  const channel = env.SLACK_CHANNEL_ID()

  const [pending, todaysBrief, allTitles] = await Promise.all([
    getPending(),
    getTodaysBrief(),
    getAllEntryTitles(),
  ])

  const pendingCount = pending.length
  const relevantEntries: { title: string; sector: string }[] = []

  if (todaysBrief) {
    const briefLower = todaysBrief.toLowerCase()
    for (const entry of allTitles) {
      const words = entry.title
        .split(/\W+/)
        .filter(w => w.length >= 4)
        .map(w => w.toLowerCase())
      if (words.some(w => briefLower.includes(w))) {
        relevantEntries.push({ title: entry.title, sector: entry.sector })
        if (relevantEntries.length >= 5) break
      }
    }
  }

  if (pendingCount === 0 && relevantEntries.length === 0) return

  const date = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  })

  let msg = `🧠 *MUSE — Morning Note*\n${date}`

  if (pendingCount > 0) {
    msg += `\n\n📋 *Pending:* ${pendingCount} confirmation${pendingCount === 1 ? '' : 's'} waiting`
  }

  if (relevantEntries.length > 0) {
    msg += '\n\n📚 *Relevant to today\'s brief:*\n'
    for (const e of relevantEntries) {
      msg += `• ${e.title} → ${e.sector}\n`
    }
  }

  msg += '\nReply to any pending item or say _"MUSE, status"_ for full summary.'

  await postMessage(channel, msg)
}

// ─── Step 6 helpers ───────────────────────────────────────────────────────────

async function maybeQueueForIris(title: string, sector: string): Promise<boolean> {
  if (sector !== 'Markets' && sector !== 'Regulations') return false

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
    slack_ts: null,
  })
  return true
}

function detectCisiModule(title: string, content: string): string | null {
  const text = `${title} ${content}`
  const match = text.match(/\b(CF\d+|R0[1-9]|J0[0-9]|J1[0-9]|AF\d+)\b/i)
  return match ? match[1]!.toUpperCase() : null
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function logRow(id: string, type: string, input: string, slackUser?: string): Promise<void> {
  await getDb().insert(activity).values({
    id,
    event_id: `${type}_${Date.now()}`,
    type,
    agent: 'MUSE',
    slack_user: slackUser,
    input: input.slice(0, 500),
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })
}

async function resolveRow(id: string, output: string, startMs: number): Promise<void> {
  await getDb()
    .update(activity)
    .set({ output: output.slice(0, 500), status: 'success', duration_ms: Date.now() - startMs })
    .where(eq(activity.id, id))
}

async function errorRow(id: string, message: string, startMs: number): Promise<void> {
  await getDb()
    .update(activity)
    .set({ output: message.slice(0, 500), status: 'error', duration_ms: Date.now() - startMs })
    .where(eq(activity.id, id))
}

async function insertActivity(type: string, input: string, output: string, slackUser?: string): Promise<void> {
  try {
    await getDb().insert(activity).values({
      id: crypto.randomUUID(),
      event_id: `${type}_${Date.now()}`,
      type,
      agent: 'MUSE',
      slack_user: slackUser,
      input: input.slice(0, 500),
      output: output.slice(0, 500),
      status: 'success',
      created_at: Math.floor(Date.now() / 1000),
    })
  } catch {
    // Non-fatal
  }
}
