// CASSANDRA handler — intent detection, on-demand handlers, scheduled brief
// builder, News conversation thread wiring.
// Logs all actions to `activity` with agent='CASSANDRA'.
// Saves each brief to `research_briefs` (compat row for older readers —
// IRIS's getTodaysBrief, DIANA's getTodayAngle, maia-context's todayAngle via
// tools/hermes-db's getTodayCallAngle, maia-voice's spoken summary) and to
// `cassandra_items` (one row per qualifying article per day — the new
// per-article source of truth for the News thread + context panel).

import * as fs from 'fs'
import * as path from 'path'
import { eq, desc, and, gte, lt } from 'drizzle-orm'
import {
  gatherAndFilterArticles, formatBriefText, toHeadlinesJsonCompat,
  fileNewsSummaryToMuse, answerCassandraFollowUp, CATEGORY_LABEL,
  checkForMarketAlert, formatMarketAlertText, formatWeeklySummary,
  compoundWeeklyChange, RATE_DECISION_RE, tagCompaniesInArticles,
  type CassandraArticle, type ChatTurn, type WeeklyIndexMove,
  type CassandraRelevance, type CassandraCategory,
} from './cassandra'
import { getIndexQuotes, getFxQuotes, type IndexSpec, type IndexQuote } from '../../tools/market-data'
import { checkMuseHarvest } from './muse-handler'
import { getDb } from '@/db'
import { activity, research_briefs, cassandra_items, cassandra_seen_articles } from '@/db/schema'
import { getConversation, appendMessage, appendMessages, type ConversationMessage } from '../../tools/maia-conversations'

// ─── Config parsing (indices/FX only — RSS feed config is dead, Brave replaced it) ──

interface CassandraConfig {
  indices: IndexSpec[]
  fxPairs: string[]
}

function parseCassandraConfig(content: string): CassandraConfig {
  const lines = content.split('\n').map(l => l.replace(/#.*$/, '').trimEnd())
  const config: CassandraConfig = { indices: [], fxPairs: [] }
  let currentSection = ''

  for (const raw of lines) {
    const line = raw.trimStart()
    if (!line) continue

    const kvMatch = line.match(/^(\w[\w_]*):\s*(.*)$/)
    if (kvMatch && !raw.startsWith('  ') && !raw.startsWith('\t')) {
      currentSection = kvMatch[1] ?? ''
      continue
    }

    const listMatch = line.match(/^-\s+(.+)$/)
    if (listMatch) {
      const val = listMatch[1]!.trim()
      if (currentSection === 'indices') {
        const colonIdx = val.indexOf(':')
        if (colonIdx > 0) config.indices.push({ symbol: val.slice(0, colonIdx).trim(), label: val.slice(colonIdx + 1).trim() })
        else config.indices.push({ symbol: val, label: val })
      }
      if (currentSection === 'fx_pairs') config.fxPairs.push(val)
    }
  }
  return config
}

function loadConfig(): CassandraConfig {
  const configPath = path.join(process.cwd(), 'context', 'cassandra.md')
  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    return parseCassandraConfig(content)
  } catch (err) {
    console.warn('[cassandra] context/cassandra.md not found, using defaults:', err)
    return {
      indices: [{ symbol: 'SPY', label: 'S&P 500' }, { symbol: 'QQQ', label: 'Nasdaq' }, { symbol: 'ISF.L', label: 'FTSE 100' }],
      fxPairs: ['GBP/USD', 'EUR/USD', 'EUR/GBP'],
    }
  }
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function isToday(timestamp: number): boolean {
  return new Date(timestamp * 1000).toISOString().slice(0, 10) === todayDateString()
}

function fmtTimeAmPm(d: Date): string {
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')}${ampm}`
}

// ─── cassandra_items persistence ──────────────────────────────────────────────

async function getTodaysItemUrls(date: string): Promise<Set<string>> {
  const rows = await getDb().select({ url: cassandra_items.url }).from(cassandra_items).where(eq(cassandra_items.date, date))
  return new Set(rows.map(r => r.url))
}

// Union of today's already-persisted URLs and the cross-day "seen" set —
// the exclude list every fetch cycle filters candidates against.
async function buildExcludeUrls(date: string): Promise<Set<string>> {
  const [todays, seen] = await Promise.all([getTodaysItemUrls(date), getSeenUrls()])
  return new Set([...todays, ...seen])
}

// ─── Cross-day "already seen" tracking ────────────────────────────────────────
// cassandra_items.date scopes dedup to a single day, so an article could
// otherwise resurface and get re-fetched/re-shown the next day. This table
// tracks every URL ever displayed, for 30 days, independent of which day's
// cassandra_items row it landed in.

const SEEN_RETENTION_SECS = 30 * 86400

async function getSeenUrls(): Promise<Set<string>> {
  const cutoff = Math.floor(Date.now() / 1000) - SEEN_RETENTION_SECS
  const rows = await getDb().select({ url: cassandra_seen_articles.url }).from(cassandra_seen_articles)
    .where(gte(cassandra_seen_articles.created_at, cutoff))
  return new Set(rows.map(r => r.url))
}

// Upsert — a URL already marked seen within the retention window just gets
// its created_at refreshed rather than erroring on the unique constraint.
async function markUrlsSeen(urls: string[]): Promise<void> {
  if (urls.length === 0) return
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(cassandra_seen_articles)
    .values(urls.map(url => ({ id: crypto.randomUUID(), url, created_at: now })))
    .onConflictDoUpdate({ target: cassandra_seen_articles.url, set: { created_at: now } })
}

// Prunes rows older than the retention window — run once per fetch cycle.
async function cleanExpiredSeenArticles(): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - SEEN_RETENTION_SECS
  await getDb().delete(cassandra_seen_articles).where(lt(cassandra_seen_articles.created_at, cutoff))
}

// Returns generated ids aligned 1:1 with `articles`, for building news_card
// messages (metadata.itemId) right after. Also marks each persisted URL as
// seen, so it won't resurface in a future fetch cycle within the retention
// window.
async function persistCassandraItems(articles: CassandraArticle[], date: string): Promise<string[]> {
  if (articles.length === 0) return []
  const db = getDb()
  const now = Math.floor(Date.now() / 1000)
  const ids = articles.map(() => crypto.randomUUID())
  await db.insert(cassandra_items).values(
    articles.map((a, i) => ({
      id: ids[i]!,
      date,
      title: a.title,
      source: a.source,
      url: a.url,
      published: a.published,
      summary: a.summary,
      key_quote: a.keyQuote,
      content_angle: a.contentAngle,
      relevance: a.relevance,
      category: a.category,
      used_on_call: 0,
      used_in_post: 0,
      created_at: now,
    })),
  )
  await markUrlsSeen(articles.map(a => a.url))
  return ids
}

// ─── News conversation thread messages ────────────────────────────────────────

function buildNewsBriefMessage(articles: CassandraArticle[]): ConversationMessage {
  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const content = articles.length === 0
    ? 'Nothing significant today worth using on calls.\nStandard calls — lead with the IHT April 2027 angle, still relevant.'
    : `Good morning Archie. Here's what's worth knowing today.\n${articles.length} item${articles.length === 1 ? '' : 's'} — ${dateLabel}`
  return {
    id: crypto.randomUUID(),
    role: 'maia',
    type: 'news_brief',
    content,
    metadata: { count: articles.length, dateLabel },
    timestamp: Math.floor(Date.now() / 1000),
  }
}

function buildNewsCardMessages(articles: CassandraArticle[], itemIds: string[]): ConversationMessage[] {
  const now = Math.floor(Date.now() / 1000)
  return articles.map((a, i) => ({
    id: crypto.randomUUID(),
    role: 'maia',
    type: 'news_card',
    content: a.summary,
    metadata: {
      itemId: itemIds[i],
      title: a.title,
      source: a.source,
      url: a.url,
      published: a.published,
      keyQuote: a.keyQuote,
      contentAngle: a.contentAngle,
      relevance: a.relevance,
      category: a.category,
      categoryLabel: CATEGORY_LABEL[a.category],
    },
    timestamp: now,
  }))
}

// ─── Shared pipeline run (gather + persist, no side effects beyond that) ─────

async function runPipeline(excludeUrls: Set<string>): Promise<{
  articles: CassandraArticle[]
  skippedQueries: string[]
  itemIds: string[]
  indices: Awaited<ReturnType<typeof getIndexQuotes>>
  fx: Awaited<ReturnType<typeof getFxQuotes>>
}> {
  const config = loadConfig()
  const [indices, fx, { articles, skippedQueries }] = await Promise.all([
    getIndexQuotes(config.indices).catch(err => {
      console.error('[cassandra] Index quotes failed:', err)
      return [] as Awaited<ReturnType<typeof getIndexQuotes>>
    }),
    getFxQuotes(config.fxPairs).catch(err => {
      console.error('[cassandra] FX quotes failed:', err)
      return [] as Awaited<ReturnType<typeof getFxQuotes>>
    }),
    gatherAndFilterArticles(excludeUrls),
  ])
  const itemIds = await persistCassandraItems(articles, todayDateString())
  void tagCompaniesInArticles(articles).catch(err => console.error('[cassandra] company tagging failed:', err))
  return { articles, skippedQueries, itemIds, indices, fx }
}

// ─── Weekly summary (Monday morning briefs only) ──────────────────────────────

async function buildWeeklySummary(): Promise<string | null> {
  const sevenDaysAgoSecs = Math.floor(Date.now() / 1000) - 7 * 86400

  const rows = await getDb().select().from(research_briefs)
    .where(and(eq(research_briefs.type, 'morning'), gte(research_briefs.created_at, sevenDaysAgoSecs)))
    .orderBy(research_briefs.created_at)

  const byLabel = new Map<string, number[]>()
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.markets_json) as { indices?: IndexQuote[] }
      for (const q of parsed.indices ?? []) {
        const arr = byLabel.get(q.label) ?? []
        arr.push(q.dayChangePct)
        byLabel.set(q.label, arr)
      }
    } catch { /* malformed row — skip */ }
  }
  const moves: WeeklyIndexMove[] = [...byLabel.entries()].map(([label, pcts]) => ({
    label, weeklyChangePct: compoundWeeklyChange(pcts),
  }))

  const itemRows = await getDb().select().from(cassandra_items).where(gte(cassandra_items.created_at, sevenDaysAgoSecs))
  const rateDecisionNotes = itemRows
    .filter(r => RATE_DECISION_RE.test(`${r.title} ${r.summary}`))
    .map(r => `${r.title} (${r.source})`)

  return formatWeeklySummary(moves, rateDecisionNotes)
}

// ─── Market alert (POST /api/cron/cassandra/alert-check, plus called from the
// existing afternoon refresh) ──────────────────────────────────────────────────
// Reuses today's already-gathered cassandra_items for the rate-decision check
// rather than running a fresh search — context/cassandra.md's RSS feed lists
// are dead code (see notes there), so there's no live feed to watch "rate" +
// "decision" keywords on; this works off whatever the normal Brave+Haiku
// pipeline already surfaced today instead.

function dbArticleToCassandraArticle(r: typeof cassandra_items.$inferSelect): CassandraArticle {
  return {
    title: r.title, source: r.source, url: r.url, published: r.published,
    summary: r.summary, keyQuote: r.key_quote,
    contentAngle: r.content_angle,
    relevance: r.relevance as CassandraRelevance,
    category: r.category as CassandraCategory,
  }
}

async function alreadyAlertedToday(): Promise<boolean> {
  const [latest] = await getDb().select().from(research_briefs)
    .where(eq(research_briefs.type, 'market_alert'))
    .orderBy(desc(research_briefs.created_at)).limit(1)
  return latest ? isToday(latest.created_at) : false
}

export async function checkMarketAlert(): Promise<{ fired: boolean }> {
  if (await alreadyAlertedToday()) return { fired: false }

  const config = loadConfig()
  const indices = await getIndexQuotes(config.indices).catch(err => {
    console.error('[cassandra] checkMarketAlert index fetch failed:', err)
    return [] as IndexQuote[]
  })
  const triggeredIndices = checkForMarketAlert(indices)

  const today = todayDateString()
  const todaysItems = await getDb().select().from(cassandra_items).where(eq(cassandra_items.date, today))
  const rateDecisionItems = todaysItems.filter(r => RATE_DECISION_RE.test(`${r.title} ${r.summary}`))

  if (triggeredIndices.length === 0 && rateDecisionItems.length === 0) {
    return { fired: false }
  }

  const text = formatMarketAlertText(triggeredIndices, rateDecisionItems.map(dbArticleToCassandraArticle))

  await getDb().insert(research_briefs).values({
    id: crypto.randomUUID(),
    type: 'market_alert',
    markets_json: JSON.stringify({ indices: triggeredIndices }),
    headlines_json: '[]',
    summary: text,
    created_at: Math.floor(Date.now() / 1000),
  })

  const alertMsg: ConversationMessage = {
    id: crypto.randomUUID(),
    role: 'maia',
    type: 'text',
    content: text,
    metadata: { source: 'market_alert' },
    timestamp: Math.floor(Date.now() / 1000),
  }
  await appendMessage('news', alertMsg)

  return { fired: true }
}

// ─── Scheduled morning brief (POST /api/cron/cassandra/brief, existing POST /api/cassandra/brief) ──

export async function buildScheduledBrief(): Promise<void> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()

  await getDb().insert(activity).values({
    id: rowId,
    event_id: `cassandra_scheduled_${Date.now()}`,
    type: 'scheduled_brief',
    agent: 'CASSANDRA',
    input: 'scheduled',
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })

  try {
    await cleanExpiredSeenArticles()
    const excludeUrls = await buildExcludeUrls(todayDateString())
    const { articles, skippedQueries, itemIds, indices, fx } = await runPipeline(excludeUrls)
    const text = formatBriefText(indices, fx, articles, skippedQueries)

    // Monday only — Tue-Fri get null (fetched fresh, not carried over from a
    // prior row, since this brief's own markets_json needs to land first).
    const isMonday = new Date().getDay() === 1
    const weeklySummary = isMonday ? await buildWeeklySummary().catch(err => {
      console.error('[cassandra] buildWeeklySummary failed:', err)
      return null
    }) : null

    await getDb().insert(research_briefs).values({
      id: crypto.randomUUID(),
      type: 'morning',
      markets_json: JSON.stringify({ indices, fx }),
      headlines_json: toHeadlinesJsonCompat(articles),
      summary: text,
      weekly_summary: weeklySummary,
      created_at: Math.floor(Date.now() / 1000),
    })

    void checkMuseHarvest('CASSANDRA', 'brief_saved', { briefText: text })
    void fileNewsSummaryToMuse(articles).catch(err => console.error('[cassandra] fileNewsSummaryToMuse failed:', err))

    const briefMsg = buildNewsBriefMessage(articles)
    const cardMsgs = buildNewsCardMessages(articles, itemIds)
    await appendMessages('news', [briefMsg, ...cardMsgs])

    await getDb().update(activity).set({ output: `brief posted — ${articles.length} items`, status: 'success', duration_ms: Date.now() - startMs }).where(eq(activity.id, rowId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cassandra] buildScheduledBrief failed:', err)
    await getDb().update(activity).set({ output: msg, status: 'error', duration_ms: Date.now() - startMs }).where(eq(activity.id, rowId))
  }
}

// ─── Afternoon refresh (POST /api/cron/cassandra/refresh) ────────────────────
// Only surfaces items not already in today's thread. Drops nothing, posts no
// message, if there's nothing new — per spec.

export async function buildAfternoonRefresh(): Promise<void> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()

  await getDb().insert(activity).values({
    id: rowId,
    event_id: `cassandra_afternoon_${Date.now()}`,
    type: 'afternoon_refresh',
    agent: 'CASSANDRA',
    input: 'scheduled',
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })

  try {
    await cleanExpiredSeenArticles()
    const excludeUrls = await buildExcludeUrls(todayDateString())
    const { articles } = await gatherAndFilterArticles(excludeUrls)

    if (articles.length === 0) {
      await getDb().update(activity).set({ output: 'no new items', status: 'success', duration_ms: Date.now() - startMs }).where(eq(activity.id, rowId))
      return
    }

    const itemIds = await persistCassandraItems(articles, todayDateString())
    const separator: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'maia',
      type: 'text',
      content: `── Afternoon update · ${fmtTimeAmPm(new Date())} ──`,
      timestamp: Math.floor(Date.now() / 1000),
    }
    const cardMsgs = buildNewsCardMessages(articles, itemIds)
    await appendMessages('news', [separator, ...cardMsgs])

    await getDb().update(activity).set({ output: `${articles.length} new items`, status: 'success', duration_ms: Date.now() - startMs }).where(eq(activity.id, rowId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cassandra] buildAfternoonRefresh failed:', err)
    await getDb().update(activity).set({ output: msg, status: 'error', duration_ms: Date.now() - startMs }).where(eq(activity.id, rowId))
  }

  // Mid-session market-alert check — "has a 2%+ index move or a BoE/SNB rate
  // decision happened since this morning's brief" — runs after the refresh
  // above regardless of whether it found new articles, since a sharp market
  // move doesn't depend on a fresh article turning up.
  try {
    await checkMarketAlert()
  } catch (err) {
    console.error('[cassandra] checkMarketAlert (from afternoon refresh) failed:', err)
  }
}

// ─── Dashboard first-load fallback — only runs if the 7am cron hasn't fired yet ──

export async function ensureTodaysBriefInThread(): Promise<ConversationMessage[]> {
  const existing = await getConversation('news')
  const alreadyToday = existing.some(m => m.type === 'news_brief' && isToday(m.timestamp))
  if (alreadyToday) return []

  const rowId = crypto.randomUUID()
  const startMs = Date.now()
  await getDb().insert(activity).values({
    id: rowId,
    event_id: `cassandra_dashboard_${Date.now()}`,
    type: 'on_demand_brief',
    agent: 'CASSANDRA',
    input: 'dashboard first-load',
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })

  try {
    await cleanExpiredSeenArticles()
    const excludeUrls = await buildExcludeUrls(todayDateString())
    const { articles, skippedQueries, itemIds, indices, fx } = await runPipeline(excludeUrls)
    const text = formatBriefText(indices, fx, articles, skippedQueries)

    await getDb().insert(research_briefs).values({
      id: crypto.randomUUID(),
      type: 'on_demand',
      markets_json: JSON.stringify({ indices, fx }),
      headlines_json: toHeadlinesJsonCompat(articles),
      summary: text,
      created_at: Math.floor(Date.now() / 1000),
    })

    void checkMuseHarvest('CASSANDRA', 'brief_saved', { briefText: text })
    void fileNewsSummaryToMuse(articles).catch(err => console.error('[cassandra] fileNewsSummaryToMuse failed:', err))

    const briefMsg = buildNewsBriefMessage(articles)
    const cardMsgs = buildNewsCardMessages(articles, itemIds)
    await appendMessages('news', [briefMsg, ...cardMsgs])

    await getDb().update(activity).set({ output: `brief generated for dashboard — ${articles.length} items`, status: 'success', duration_ms: Date.now() - startMs }).where(eq(activity.id, rowId))
    return [briefMsg, ...cardMsgs]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cassandra] ensureTodaysBriefInThread failed:', err)
    await getDb().update(activity).set({ output: msg, status: 'error', duration_ms: Date.now() - startMs }).where(eq(activity.id, rowId))
    throw err
  }
}

// ─── Chat follow-up (POST /api/dashboard/cassandra/chat) ────────────────────

export async function handleCassandraChat(history: ChatTurn[]): Promise<{ text: string; ranFreshSearch: boolean }> {
  const today = todayDateString()
  const rows = await getDb().select().from(cassandra_items).where(eq(cassandra_items.date, today))
  const items = [...rows].sort((a, b) => (a.relevance === b.relevance ? 0 : a.relevance === 'high' ? -1 : 1))
  const todaysContext = items.map(i =>
    `"${i.title}" (${i.source}, ${i.relevance} relevance, category: ${i.category})\nSummary: ${i.summary}\nKey quote: ${i.key_quote ?? '(none)'}\nURL: ${i.url}`,
  ).join('\n\n')
  return answerCassandraFollowUp(history, todaysContext)
}

// ─── Right context panel (GET /api/dashboard/cassandra/context + hub-context's 'news' case) ──

export type ContextSection =
  | { type: 'list'; title: string; items: { text: string; sub?: string }[] }
  | { type: 'stats'; title: string; rows: { label: string; value: string }[] }
  | { type: 'empty'; title: string; message: string }

const FOLLOWING_TOPICS = [
  'UK Pension & Tax', 'Swiss Company News', 'Bond Markets & Rates',
  'Swiss Regulation', 'Retirement Destinations', 'Nigel Green / deVere',
]

function timeAgoFrom(createdAtSecs: number): string {
  const diffSecs = Math.max(0, Math.floor(Date.now() / 1000) - createdAtSecs)
  if (diffSecs < 3600) return `${Math.max(1, Math.round(diffSecs / 60))}m ago`
  if (diffSecs < 86400) return `${Math.round(diffSecs / 3600)}h ago`
  return `${Math.round(diffSecs / 86400)}d ago`
}

export async function buildNewsContextSections(): Promise<ContextSection[]> {
  const db = getDb()
  const today = todayDateString()

  const following: ContextSection = { type: 'list', title: 'FOLLOWING', items: FOLLOWING_TOPICS.map(t => ({ text: t })) }

  const rows = await db.select().from(cassandra_items).where(eq(cassandra_items.date, today)).orderBy(desc(cassandra_items.created_at))
  const sorted = [...rows].sort((a, b) => (a.relevance === b.relevance ? 0 : a.relevance === 'high' ? -1 : 1))

  const todaysItems: ContextSection = sorted.length > 0
    ? {
      type: 'list', title: "TODAY'S ITEMS",
      items: sorted.map(r => ({
        text: `${r.title.length > 60 ? r.title.slice(0, 57) + '…' : r.title}  ${r.relevance.toUpperCase() === 'HIGH' ? 'HIGH' : 'MED'}`,
        sub: `${r.source} · ${timeAgoFrom(r.created_at)}`,
      })),
    }
    : { type: 'empty', title: "TODAY'S ITEMS", message: 'No items yet today.' }

  const earliestToday = rows.length > 0 ? Math.min(...rows.map(r => r.created_at)) : null
  const now = new Date()
  const nextRefreshLabel = now.getHours() < 14 ? '2:00pm' : 'tomorrow 7:00am'
  const lastUpdated: ContextSection = {
    type: 'stats', title: 'LAST UPDATED',
    rows: [
      { label: 'Today', value: earliestToday ? fmtTimeAmPm(new Date(earliestToday * 1000)) : '—' },
      { label: 'Next refresh', value: nextRefreshLabel },
    ],
  }

  return [following, todaysItems, lastUpdated]
}

// ─── Mark used (POST /api/dashboard/cassandra/used) ──────────────────────────

export async function markItemUsedOnCall(itemId: string): Promise<void> {
  await getDb().update(cassandra_items).set({ used_on_call: 1 }).where(eq(cassandra_items.id, itemId))
}

export async function markItemUsedInPost(itemId: string): Promise<void> {
  await getDb().update(cassandra_items).set({ used_in_post: 1 }).where(eq(cassandra_items.id, itemId))
}

// Appends the "News angle from CASSANDRA" handoff message into the LinkedIn
// thread — the client then switches the active agent so Archie sees it land.
export async function sendPostIdeaToLinkedin(itemId: string): Promise<void> {
  const [item] = await getDb().select().from(cassandra_items).where(eq(cassandra_items.id, itemId)).limit(1)
  if (!item) throw new Error('cassandra_items row not found')

  await markItemUsedInPost(itemId)

  const content = `News angle from CASSANDRA:\n${item.content_angle ?? item.summary}\n${item.title} — ${item.source}\n\nGenerate a LinkedIn post from this?`
  const msg: ConversationMessage = {
    id: crypto.randomUUID(),
    role: 'maia',
    type: 'text',
    content,
    metadata: { source: 'cassandra_post_idea', cassandraItemId: itemId },
    timestamp: Math.floor(Date.now() / 1000),
  }
  await appendMessage('linkedin', msg)
}
