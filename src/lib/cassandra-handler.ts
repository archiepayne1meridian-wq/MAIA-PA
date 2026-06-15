// CASSANDRA handler — intent detection, on-demand handlers, scheduled brief builder.
// Logs all actions to `activity` with agent='CASSANDRA'.
// Saves each brief to `research_briefs`.

import * as fs from 'fs'
import * as path from 'path'
import { eq } from 'drizzle-orm'
import { postMessage } from './slack'
import { formatBrief, digestNews } from './cassandra'
import { getIndexQuotes, getFxQuotes, type IndexSpec } from '../../tools/market-data'
import { fetchAllFeeds } from '../../tools/feeds'
import { getDb } from '@/db'
import { activity, research_briefs } from '@/db/schema'

// ─── Config parsing ───────────────────────────────────────────────────────────

interface CassandraConfig {
  indices: IndexSpec[]          // { symbol: 'SPY', label: 'S&P 500' }
  fxPairs: string[]
  newsFeeds: { url: string; name: string }[]
  regulatoryFeeds: { url: string; name: string }[]
  itemsPerSection: number
}

function parseCassandraConfig(content: string): CassandraConfig {
  const lines = content.split('\n').map(l => l.replace(/#.*$/, '').trimEnd())

  const config: CassandraConfig = {
    indices: [],
    fxPairs: [],
    newsFeeds: [],
    regulatoryFeeds: [],
    itemsPerSection: 4,
  }

  let currentSection = ''
  let currentFeedObj: { url?: string; name?: string } = {}
  let inFeedList = false

  for (const raw of lines) {
    const line = raw.trimStart()
    if (!line) {
      // Flush any pending feed object on blank line
      if (inFeedList && currentFeedObj.url && currentFeedObj.name) {
        if (currentSection === 'news_feeds') config.newsFeeds.push({ url: currentFeedObj.url, name: currentFeedObj.name })
        if (currentSection === 'regulatory_feeds') config.regulatoryFeeds.push({ url: currentFeedObj.url, name: currentFeedObj.name })
        currentFeedObj = {}
      }
      continue
    }

    const kvMatch = line.match(/^(\w[\w_]*):\s*(.*)$/)
    if (kvMatch && !raw.startsWith('  ') && !raw.startsWith('\t')) {
      const [, key, val] = kvMatch
      const v = (val ?? '').trim()

      // Flush pending feed object when section changes
      if (inFeedList && currentFeedObj.url && currentFeedObj.name) {
        if (currentSection === 'news_feeds') config.newsFeeds.push({ url: currentFeedObj.url, name: currentFeedObj.name })
        if (currentSection === 'regulatory_feeds') config.regulatoryFeeds.push({ url: currentFeedObj.url, name: currentFeedObj.name })
        currentFeedObj = {}
      }

      currentSection = key ?? ''
      inFeedList = ['news_feeds', 'regulatory_feeds'].includes(currentSection)

      if (key === 'items_per_section' && v) config.itemsPerSection = parseInt(v, 10) || 4
      continue
    }

    // List item: starts with "- "
    const listMatch = line.match(/^-\s+(.+)$/)
    if (listMatch) {
      const val = listMatch[1]!.trim()

      if (inFeedList) {
        // Feed list item starts a new feed object
        if (currentFeedObj.url && currentFeedObj.name) {
          if (currentSection === 'news_feeds') config.newsFeeds.push({ url: currentFeedObj.url, name: currentFeedObj.name })
          if (currentSection === 'regulatory_feeds') config.regulatoryFeeds.push({ url: currentFeedObj.url, name: currentFeedObj.name })
        }
        currentFeedObj = {}
        // Could be "- url: https://..." on a single line
        const inlineUrl = val.match(/^url:\s*(.+)$/)
        if (inlineUrl) currentFeedObj.url = inlineUrl[1]!.trim()
        continue
      }

      // Indices: "- SPY:S&P 500" format (symbol:label)
      if (currentSection === 'indices') {
        const colonIdx = val.indexOf(':')
        if (colonIdx > 0) {
          config.indices.push({ symbol: val.slice(0, colonIdx).trim(), label: val.slice(colonIdx + 1).trim() })
        } else {
          config.indices.push({ symbol: val, label: val })  // label defaults to symbol if no colon
        }
      }
      if (currentSection === 'fx_pairs') config.fxPairs.push(val)
      continue
    }

    // Nested key under feed list: "  url: ..." / "  name: ..."
    if (inFeedList && raw.startsWith('  ')) {
      const nested = line.match(/^(\w+):\s*(.+)$/)
      if (nested) {
        const [, k, v] = nested
        if (k === 'url') currentFeedObj.url = (v ?? '').trim()
        if (k === 'name') currentFeedObj.name = (v ?? '').trim()
      }
    }
  }

  // Flush final pending feed object
  if (inFeedList && currentFeedObj.url && currentFeedObj.name) {
    if (currentSection === 'news_feeds') config.newsFeeds.push({ url: currentFeedObj.url, name: currentFeedObj.name })
    if (currentSection === 'regulatory_feeds') config.regulatoryFeeds.push({ url: currentFeedObj.url, name: currentFeedObj.name })
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
      indices: [
        { symbol: 'SPY',   label: 'S&P 500' },
        { symbol: 'QQQ',   label: 'Nasdaq' },
        { symbol: 'ISF.L', label: 'FTSE 100' },
      ],
      fxPairs: ['GBP/USD', 'EUR/USD', 'EUR/GBP'],
      newsFeeds: [],
      regulatoryFeeds: [],
      itemsPerSection: 4,
    }
  }
}

// ─── Intent detection ─────────────────────────────────────────────────────────

export type CassandraIntent =
  | { type: 'morning_brief' }
  | { type: 'fx_only' }

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

  return null
}

// ─── Brief builder (shared by on-demand + scheduled endpoint) ─────────────────

async function buildBriefPayload(config: CassandraConfig): Promise<{
  text: string
  marketsJson: string
  headlinesJson: string
}> {
  const [indices, fx, feeds] = await Promise.all([
    getIndexQuotes(config.indices).catch(err => {
      console.error('[cassandra] Index quotes failed:', err)
      return [] as Awaited<ReturnType<typeof getIndexQuotes>>
    }),
    getFxQuotes(config.fxPairs).catch(err => {
      console.error('[cassandra] FX quotes failed:', err)
      return [] as Awaited<ReturnType<typeof getFxQuotes>>
    }),
    fetchAllFeeds([...config.regulatoryFeeds, ...config.newsFeeds]),
  ])

  const n = config.itemsPerSection
  const regulatory = feeds.items
    .filter(i => config.regulatoryFeeds.some(f => f.name === i.source))
    .slice(0, n)
  const news = feeds.items
    .filter(i => config.newsFeeds.some(f => f.name === i.source))
    .slice(0, n)

  // One Claude (Haiku) call per section. Errors fall back to raw titles gracefully.
  const [regulatoryDigests, newsDigests] = await Promise.all([
    regulatory.length > 0
      ? digestNews(regulatory, 'Regulatory').catch(err => {
          console.error('[cassandra] digestNews(Regulatory) failed:', err)
          return new Map<string, string>()
        })
      : Promise.resolve(new Map<string, string>()),
    news.length > 0
      ? digestNews(news, 'Headlines').catch(err => {
          console.error('[cassandra] digestNews(Headlines) failed:', err)
          return new Map<string, string>()
        })
      : Promise.resolve(new Map<string, string>()),
  ])
  const digests = new Map([...regulatoryDigests, ...newsDigests])

  const text = formatBrief(indices, fx, regulatory, news, digests, feeds.skipped)

  const marketsJson = JSON.stringify({ indices, fx })
  const headlinesJson = JSON.stringify({ regulatory, news })

  return { text, marketsJson, headlinesJson }
}

// ─── Scheduled brief (called by POST /api/cassandra/brief) ───────────────────

export async function buildScheduledBrief(channel: string): Promise<void> {
  const config = loadConfig()
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
    const { text, marketsJson, headlinesJson } = await buildBriefPayload(config)

    await postMessage(channel, text)

    await getDb().insert(research_briefs).values({
      id: crypto.randomUUID(),
      type: 'morning',
      markets_json: marketsJson,
      headlines_json: headlinesJson,
      summary: text,
      created_at: Math.floor(Date.now() / 1000),
    })

    await getDb()
      .update(activity)
      .set({ output: 'brief posted', status: 'success', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cassandra] buildScheduledBrief failed:', err)
    await getDb()
      .update(activity)
      .set({ output: msg, status: 'error', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
    await postMessage(channel, `⚠ CASSANDRA brief failed: ${msg}`)
  }
}

// ─── On-demand handlers ───────────────────────────────────────────────────────

export async function handleCassandraBrief(channel: string, _slackUser?: string): Promise<void> {
  const config = loadConfig()
  const rowId = crypto.randomUUID()
  const startMs = Date.now()

  await getDb().insert(activity).values({
    id: rowId,
    event_id: `cassandra_ondemand_${Date.now()}`,
    type: 'on_demand_brief',
    agent: 'CASSANDRA',
    input: 'brief me',
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })

  try {
    const { text, marketsJson, headlinesJson } = await buildBriefPayload(config)

    await postMessage(channel, text)

    await getDb().insert(research_briefs).values({
      id: crypto.randomUUID(),
      type: 'on_demand',
      markets_json: marketsJson,
      headlines_json: headlinesJson,
      summary: text,
      created_at: Math.floor(Date.now() / 1000),
    })

    await getDb()
      .update(activity)
      .set({ output: 'brief posted', status: 'success', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cassandra] handleCassandraBrief failed:', err)
    await getDb()
      .update(activity)
      .set({ output: msg, status: 'error', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
    await postMessage(channel, `⚠ CASSANDRA: ${msg}`)
  }
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
