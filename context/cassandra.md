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

## News feeds (RSS/Atom)

news_feeds:
  - url: https://feeds.bbci.co.uk/news/business/rss.xml
    name: BBC Business

## Regulatory feeds
# FCA has a real RSS feed — use this for the Regulatory section.
# MFSA does not have a discoverable RSS feed. A dedicated HTML-scrape tool is planned
# for v2 (fetch mfsa.mt/news, parse headlines from HTML with loud logging on layout change).

regulatory_feeds:
  - url: https://www.fca.org.uk/news/rss.xml
    name: FCA

---

## Notes

- Index labels are what CASSANDRA prints (e.g. "S&P 500"), not the ETF ticker.
  The proxy ETF % move tracks the index closely; this is the data source, not the display.
- CASSANDRA reports facts only. No buy/sell/hold language anywhere.
- Each brief is saved to the `research_briefs` table. IRIS will read these later.
- News digests (Claude summarisation) require explicit "go ahead" before being enabled.
- MFSA: v2 follow-on. Build tools/mfsa-scraper.ts that fetches mfsa.mt/news and
  parses <article> headlines; log loudly on any structural change. Not a launch blocker.
