import { describe, it, expect, vi } from 'vitest'
import { fetchFeed, fetchAllFeeds } from './feeds'

// Sample BBC Business RSS response
const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>BBC Business</title>
    <link>https://www.bbc.co.uk/news/business</link>
    <item>
      <title>Markets rise on inflation data</title>
      <link>https://www.bbc.co.uk/news/business/article-1</link>
      <pubDate>Mon, 14 Jun 2026 07:00:00 +0000</pubDate>
    </item>
    <item>
      <title>Bank of England holds rates</title>
      <link>https://www.bbc.co.uk/news/business/article-2</link>
      <pubDate>Mon, 14 Jun 2026 06:30:00 +0000</pubDate>
    </item>
  </channel>
</rss>`

// Sample Atom feed response
const ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>MFSA Notices</title>
  <entry>
    <title>MFSA issues guidance on crypto-asset regulation</title>
    <link href="https://www.mfsa.mt/news/mfsa-guidance-1"/>
    <updated>2026-06-14T08:00:00Z</updated>
  </entry>
  <entry>
    <title>MFSA annual report published</title>
    <link href="https://www.mfsa.mt/news/annual-report-2026"/>
    <updated>2026-06-13T10:00:00Z</updated>
  </entry>
</feed>`

describe('fetchFeed', () => {
  it('parses RSS <item> elements into FeedItem[]', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      text: async () => RSS_XML,
    }))

    const items = await fetchFeed('https://example.com/rss', 'BBC Business')
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      title: 'Markets rise on inflation data',
      link: 'https://www.bbc.co.uk/news/business/article-1',
      source: 'BBC Business',
    })
    expect(items[1]!.title).toBe('Bank of England holds rates')
  })

  it('parses Atom <entry> elements into FeedItem[]', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      text: async () => ATOM_XML,
    }))

    const items = await fetchFeed('https://example.com/atom', 'MFSA')
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      title: 'MFSA issues guidance on crypto-asset regulation',
      link: 'https://www.mfsa.mt/news/mfsa-guidance-1',
      source: 'MFSA',
    })
  })

  it('returns [] and logs when HTTP response is not ok', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 }))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const items = await fetchFeed('https://example.com/dead', 'Dead Feed')
    expect(items).toHaveLength(0)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Dead Feed'))

    consoleSpy.mockRestore()
  })

  it('returns [] and logs when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('fetch failed') })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const items = await fetchFeed('https://example.com/down', 'Down Feed')
    expect(items).toHaveLength(0)
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})

describe('fetchAllFeeds', () => {
  it('aggregates items from multiple feeds and notes empty sources as skipped', async () => {
    let call = 0
    vi.stubGlobal('fetch', async () => {
      call++
      if (call === 1) return { ok: true, text: async () => RSS_XML }
      return { ok: false, status: 503 }
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { items, skipped } = await fetchAllFeeds([
      { url: 'https://example.com/rss', name: 'BBC Business' },
      { url: 'https://example.com/down', name: 'MFSA' },
    ])

    expect(items).toHaveLength(2)
    expect(skipped).toContain('MFSA')
    consoleSpy.mockRestore()
  })
})
