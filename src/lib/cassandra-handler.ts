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
import { eq, desc } from 'drizzle-orm'
import { postMessage } from './slack'
import {
  gatherAndFilterArticles, formatBriefSlackText, toHeadlinesJsonCompat,
  fileCallAngleToMuse, answerCassandraFollowUp, CATEGORY_LABEL,
  type CassandraArticle, type ChatTurn,
} from './cassandra'
import { getIndexQuotes, getFxQuotes, type IndexSpec } from '../../tools/market-data'
import { checkMuseHarvest } from './muse-handler'
import { savePost } from '../../tools/iris'
import { getDb } from '@/db'
import { activity, research_briefs, cassandra_items } from '@/db/schema'
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

// ─── Intent detection (Slack) ─────────────────────────────────────────────────

export type CassandraIntent =
  | { type: 'morning_brief' }
  | { type: 'fx_only' }
  | { type: 'flag_iris_topic'; description: string }

export function detectCassandraIntent(text: string): CassandraIntent | null {
  const lower = text.trim().toLowerCase()

  if (
    /^(?:cassandra[,.]?\s+)?brief me$/i.test(lower) ||
    /^market brief$/i.test(lower) ||
    /^markets$/i.test(lower) ||
    /^cassandra[,.]?\s+brief$/i.test(lower)
  ) {
    return { type: 'morning_brief' }
  }

  if (
    /^(?:cassandra[,.]?\s+)?fx$/i.test(lower) ||
    /^what'?s the pound doing/i.test(lower)
  ) {
    return { type: 'fx_only' }
  }

  const flagMatch = text.match(/^(?:cassandra[,.]?\s+flag\s+this[:\s]+|iris\s+topic:\s*)(.+)$/i)
  if (flagMatch) {
    const description = (flagMatch[1] ?? '').trim()
    if (description) return { type: 'flag_iris_topic', description }
  }

  return null
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

// Returns generated ids aligned 1:1 with `articles`, for building news_card
// messages (metadata.itemId) right after.
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
      call_angle: a.callAngle,
      content_angle: a.contentAngle,
      relevance: a.relevance,
      category: a.category,
      used_on_call: 0,
      used_in_post: 0,
      created_at: now,
    })),
  )
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
      callAngle: a.callAngle,
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
  return { articles, skippedQueries, itemIds, indices, fx }
}

// ─── Scheduled morning brief (POST /api/cron/cassandra/brief, existing POST /api/cassandra/brief) ──

export async function buildScheduledBrief(channel: string): Promise<void> {
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
    const existingUrls = await getTodaysItemUrls(todayDateString())
    const { articles, skippedQueries, itemIds, indices, fx } = await runPipeline(existingUrls)
    const text = formatBriefSlackText(indices, fx, articles, skippedQueries)

    await postMessage(channel, text)

    await getDb().insert(research_briefs).values({
      id: crypto.randomUUID(),
      type: 'morning',
      markets_json: JSON.stringify({ indices, fx }),
      headlines_json: toHeadlinesJsonCompat(articles),
      summary: text,
      created_at: Math.floor(Date.now() / 1000),
    })

    void checkMuseHarvest('CASSANDRA', 'brief_saved', { briefText: text })
    void fileCallAngleToMuse(articles).catch(err => console.error('[cassandra] fileCallAngleToMuse failed:', err))

    const briefMsg = buildNewsBriefMessage(articles)
    const cardMsgs = buildNewsCardMessages(articles, itemIds)
    await appendMessages('news', [briefMsg, ...cardMsgs])

    await getDb().update(activity).set({ output: `brief posted — ${articles.length} items`, status: 'success', duration_ms: Date.now() - startMs }).where(eq(activity.id, rowId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cassandra] buildScheduledBrief failed:', err)
    await getDb().update(activity).set({ output: msg, status: 'error', duration_ms: Date.now() - startMs }).where(eq(activity.id, rowId))
    await postMessage(channel, `⚠ CASSANDRA brief failed: ${msg}`)
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
    const existingUrls = await getTodaysItemUrls(todayDateString())
    const { articles } = await gatherAndFilterArticles(existingUrls)

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
    const existingUrls = await getTodaysItemUrls(todayDateString())
    const { articles, skippedQueries, itemIds, indices, fx } = await runPipeline(existingUrls)
    const text = formatBriefSlackText(indices, fx, articles, skippedQueries)

    await getDb().insert(research_briefs).values({
      id: crypto.randomUUID(),
      type: 'on_demand',
      markets_json: JSON.stringify({ indices, fx }),
      headlines_json: toHeadlinesJsonCompat(articles),
      summary: text,
      created_at: Math.floor(Date.now() / 1000),
    })

    void checkMuseHarvest('CASSANDRA', 'brief_saved', { briefText: text })
    void fileCallAngleToMuse(articles).catch(err => console.error('[cassandra] fileCallAngleToMuse failed:', err))

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
    `"${i.title}" (${i.source}, ${i.relevance} relevance, category: ${i.category})\nSummary: ${i.summary}\nKey quote: ${i.key_quote ?? '(none)'}\nCall angle: ${i.call_angle}\nURL: ${i.url}`,
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
  'FCA New Rules', 'Swiss Regulation', 'Retirement Destinations', 'Nigel Green / deVere',
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

  const content = `News angle from CASSANDRA:\n${item.call_angle}\n${item.title} — ${item.source}\n\nGenerate a LinkedIn post from this?`
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

// ─── On-demand Slack handlers (unchanged intent surface) ─────────────────────

export async function handleCassandraBrief(channel: string, _slackUser?: string): Promise<void> {
  // Same pipeline as the scheduled brief — Slack "CASSANDRA, brief me" still works.
  await buildScheduledBrief(channel)
}

export async function handleFxOnly(channel: string, _slackUser?: string): Promise<void> {
  const config = loadConfig()
  try {
    const fx = await getFxQuotes(config.fxPairs)
    if (fx.length === 0) {
      await postMessage(channel, '⚠ CASSANDRA: FX data unavailable.')
      return
    }
    const lines = fx.map(q => {
      const sign = q.dayChangePct >= 0 ? '+' : ''
      return `${q.pair} ${q.rate.toFixed(4)} ${sign}${q.dayChangePct.toFixed(2)}%`
    }).join(' · ')
    await postMessage(channel, `*FX*\n${lines}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cassandra] handleFxOnly failed:', err)
    await postMessage(channel, `⚠ CASSANDRA FX: ${msg}`)
  }
}

export async function handleFlagIrisTopic(description: string, channel: string): Promise<void> {
  try {
    await savePost({
      slot: '', pillar: 1, topic: description, copy: '',
      image_prompt: null, image_url: null, format: null,
      status: 'suggested', slack_ts: null,
    })
    await postMessage(channel, `Got it — added *${description}* to IRIS topic queue. It'll be picked up at the next draft.`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cassandra] handleFlagIrisTopic failed:', err)
    await postMessage(channel, `⚠ CASSANDRA: could not flag topic — ${msg}`)
  }
}
