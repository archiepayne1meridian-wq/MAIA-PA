// Thin client for the Brave Search API (web search) — CASSANDRA's primary
// research source, replacing RSS polling and Claude's own built-in web_search
// tool. Returns raw results; callers handle relevance filtering and date logic.

import { env } from '@/lib/env'

export interface BraveResult {
  title: string
  url: string
  description: string
  source: string          // hostname, e.g. "bbc.co.uk" — Brave has no clean publisher name field
  age: string | null       // Brave's own relative-age string, e.g. "2 days ago" — not always present
  pageAgeIso: string | null // ISO date when Brave provides page_age, else null
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Single query, single page of web results. Brave's free/standard plan rate
// limits are tight — callers are responsible for not firing dozens of queries
// faster than the plan allows (gatherBraveArticles below spaces them out).
export async function braveSearch(query: string, count = 8): Promise<BraveResult[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(count))
  url.searchParams.set('freshness', 'pw')  // past week — matches the last-7-days requirement at the source

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': env.BRAVE_API_KEY(),
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Brave Search failed (${res.status}) for "${query}": ${body.slice(0, 200)}`)
  }

  const data = await res.json() as {
    web?: { results?: { title: string; url: string; description?: string; age?: string; page_age?: string }[] }
  }

  const results = data.web?.results ?? []
  return results.map(r => ({
    title: r.title,
    url: r.url,
    description: r.description ?? '',
    source: hostnameOf(r.url),
    age: r.age ?? null,
    pageAgeIso: r.page_age ?? null,
  }))
}
