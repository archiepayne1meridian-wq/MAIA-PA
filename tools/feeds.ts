// RSS/Atom feed fetcher and parser.
// Returns FeedItem[] per feed; skips dead/unreachable feeds without crashing the brief.
// Both RSS <item> and Atom <entry> formats are supported.

import { XMLParser } from 'fast-xml-parser'

export interface FeedItem {
  title: string
  link: string
  source: string
  published: string
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['item', 'entry'].includes(name),
})

function extractItems(raw: unknown, sourceName: string): FeedItem[] {
  const feed = raw as Record<string, unknown>
  const rss  = feed['rss'] as Record<string, unknown> | undefined
  const atom = feed['feed'] as Record<string, unknown> | undefined

  if (rss) {
    const channel = rss['channel'] as Record<string, unknown> | undefined
    const items = (channel?.['item'] ?? []) as Record<string, unknown>[]
    return items.map(item => ({
      title:     String(item['title'] ?? '').trim(),
      link:      String(item['link'] ?? item['guid'] ?? '').trim(),
      source:    sourceName,
      published: String(item['pubDate'] ?? item['dc:date'] ?? '').trim(),
    })).filter(i => i.title && i.link)
  }

  if (atom) {
    const entries = (atom['entry'] ?? []) as Record<string, unknown>[]
    return entries.map(entry => {
      const linkField = entry['link'] as Record<string, string> | string | undefined
      const link = typeof linkField === 'object' ? (linkField['@_href'] ?? '') : String(linkField ?? '')
      return {
        title:     String(entry['title'] ?? '').trim(),
        link:      link.trim(),
        source:    sourceName,
        published: String(entry['updated'] ?? entry['published'] ?? '').trim(),
      }
    }).filter(i => i.title && i.link)
  }

  return []
}

export async function fetchFeed(url: string, sourceName: string): Promise<FeedItem[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MAIA/1.0 (+https://maia.archie.ai)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.error(`[feeds] ${sourceName} HTTP ${res.status} for ${url}`)
      return []
    }
    const text = await res.text()
    const parsed = parser.parse(text) as unknown
    const items = extractItems(parsed, sourceName)
    console.log(`[feeds] ${sourceName}: ${items.length} items fetched`)
    return items
  } catch (err) {
    console.error(`[feeds] ${sourceName} failed (${url}):`, err)
    return []
  }
}

export async function fetchAllFeeds(
  feeds: { url: string; name: string }[],
): Promise<{ items: FeedItem[]; skipped: string[] }> {
  const results = await Promise.allSettled(
    feeds.map(f => fetchFeed(f.url, f.name)),
  )

  const items: FeedItem[] = []
  const skipped: string[] = []

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!
    const name = feeds[i]!.name
    if (r.status === 'fulfilled') {
      if (r.value.length === 0) skipped.push(name)
      else items.push(...r.value)
    } else {
      console.error(`[feeds] ${name} rejected:`, r.reason)
      skipped.push(name)
    }
  }

  return { items, skipped }
}
