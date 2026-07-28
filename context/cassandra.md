# CASSANDRA — Config

Agent: CASSANDRA · Tier 2 (public market data + news feeds, no client data)

---

## Timing

brief_time: 07:35 Europe/London, Mon–Fri
items_per_section: 4

## Indices (ETF proxies — free Twelve Data tier; labelled as the index in the brief)
# Format: - TICKER:Display Label
# US tickers (SPY, QQQ) → Twelve Data (NASDAQ/NYSE, free tier)
# LSE tickers (*.L)     → Alpha Vantage (same path as VWRP/VDPG, .LON suffix)
# The daily % move matches the index; the ETF price level is NOT shown.

indices:
  - SPY:S&P 500
  - QQQ:Nasdaq
  - ISF.L:FTSE 100

## FX pairs (Twelve Data format: BASE/QUOTE)

fx_pairs:
  - GBP/USD
  - EUR/USD
  - EUR/GBP

## Regulatory feeds
# FCA (both feeds) and Bank of England confirmed live (200) with real items.
# MFSA and FT Adviser removed — both confirmed dead/blocked in prior testing
# (MFSA: 403; FT Adviser: no discoverable feed on the domain at all).
# TPR Blog: redirects (301) to thepensionsregulator.gov.uk/feed/, which 404s —
# still no working TPR feed. UK Legislation: feed itself is live and returns 20
# real <entry> items (confirmed via curl), but tools/feeds.ts's Atom parser
# currently fails to extract them — each entry has multiple <link> elements
# (self/PDF/table-of-contents) and the parser only reads a single link, so
# item.link ends up empty and the item gets dropped. That's a tools/feeds.ts
# bug, out of scope for cassandra.ts-only changes — flagged separately, not
# fixed here. Both TPR Blog and UK Legislation are kept configured (graceful
# degradation via fetchAllFeeds' skipped list) but currently contribute zero
# items in practice.

regulatory_feeds:
  - url: https://www.fca.org.uk/news/rss.xml
    name: FCA
  - url: https://blog.thepensionsregulator.gov.uk/feed/
    name: TPR Blog
  - url: https://www.legislation.gov.uk/new/data.feed
    name: UK Legislation
  - url: https://www.fca.org.uk/publications/rss.xml
    name: FCA Publications

## News feeds (RSS/Atom)
# Pensions Age, Bank of England, BBC Business confirmed live (200) with real
# items. International Pensions: the domain resolves to an unrelated Long
# Island marketing/web-design agency's site (confirmed via page <title> —
# "Long Island Advertising, Marketing, Graphic Design, Web Agency"), not a
# pensions publication. Kept configured as specified (degrades gracefully,
# contributes zero items) but this is very likely the wrong URL entirely —
# worth finding the actual intended source rather than treating it as merely
# "currently dead" like the others.

news_feeds:
  - url: https://www.pensionsage.com/rss.xml
    name: Pensions Age
  - url: https://www.internationalpensions.com/feed/
    name: International Pensions
  - url: https://www.bankofengland.co.uk/rss/news
    name: Bank of England
  - url: https://feeds.bbci.co.uk/news/business/rss.xml
    name: BBC Business

---

## Notes

- Index labels are what CASSANDRA prints (e.g. "S&P 500"), not the ETF ticker.
  The proxy ETF % move tracks the index closely; this is the data source, not the display.
- CASSANDRA reports facts only. No buy/sell/hold language anywhere.
- Each brief is saved to the `research_briefs` table. IRIS will read these later.
- News digests (Claude summarisation) require explicit "go ahead" before being enabled.
- MFSA: v2 follow-on. Build tools/mfsa-scraper.ts that fetches mfsa.mt/news and
  parses <article> headlines; log loudly on any structural change. Not a launch blocker.
