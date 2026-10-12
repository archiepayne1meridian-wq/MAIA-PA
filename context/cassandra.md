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
# GBP/CHF and EUR/CHF added for Switzerland-based clients holding UK/EU assets —
# the two most important pairs for that target market. GBP/CHF is a primary pair
# (same prominence as GBP/USD in the dashboard FX panel).

fx_pairs:
  - GBP/USD
  - EUR/USD
  - EUR/GBP
  - GBP/CHF
  - EUR/CHF

## Regulatory feeds
# NOTE (2026-10-12): this section (and news_feeds below) is NOT read by any
# live code — src/lib/cassandra-handler.ts's config parser only extracts
# `indices:` and `fx_pairs:` from this file. The real news pipeline is Brave
# Search queries (SEARCHES in src/lib/cassandra.ts) + a Haiku relevance
# filter (FILTER_PROMPT, same file), not RSS/Atom feeds — tools/feeds.ts
# exists but nothing imports it. Kept up to date here anyway as a record of
# what sources matter; the FCA removal and new-country coverage requested
# alongside this edit were implemented as Brave queries + filter-prompt
# changes in cassandra.ts instead, since editing this section alone has no
# functional effect.
#
# FCA (both feeds) removed — not because they're dead (both were confirmed
# live, 200, with real items) but because FCA coverage is now excluded
# entirely from the brief (regulatory noise), not just narrowed to new rules.
# TPR Blog: redirects (301) to thepensionsregulator.gov.uk/feed/, which 404s —
# confirmed dead, removed. UK Legislation: feed itself is live and returns 20
# real <entry> items (confirmed via curl), but tools/feeds.ts's Atom parser
# currently fails to extract them — each entry has multiple <link> elements
# (self/PDF/table-of-contents) and the parser only reads a single link, so
# item.link ends up empty and the item gets dropped. That's a tools/feeds.ts
# bug — moot anyway since tools/feeds.ts isn't wired into the pipeline.

regulatory_feeds:
  - url: https://www.legislation.gov.uk/new/data.feed
    name: UK Legislation

## News feeds (RSS/Atom)
# Pensions Age, Bank of England, BBC Business confirmed live (200) with real
# items. International Pensions removed — the domain resolved to an
# unrelated Long Island marketing/web-design agency's site, not a pensions
# publication. Swiss National Bank removed — confirmed 404 (real server
# response, not a network blip). This is Money removed — confirmed 403
# across every path tried (Akamai bot protection blocks non-browser
# requests). None of these three ever contributed a single item.
# UK Government Announcements: the originally-specified path
# (gov.uk/government/announcements.atom) 404s — confirmed via curl, real
# server response. gov.uk's actual sitewide announcements feed lives at
# /search/news-and-communications.atom instead (confirmed 200, live entries,
# updated within the hour when checked 2026-09-09) — using that URL below.
# Sky News Politics, Guardian Politics, Financial Times: all confirmed live
# (200) with real items.
# New (2026-10-12): Switzerland/Ireland/Australia/South Africa coverage —
# added as Brave Search queries in cassandra.ts (this section isn't read by
# any code, see the note above regulatory_feeds), not verified as live RSS
# endpoints since they're not actually fetched as feeds.

news_feeds:
  - url: https://www.pensionsage.com/rss.xml
    name: Pensions Age
  - url: https://www.bankofengland.co.uk/rss/news
    name: Bank of England
  - url: https://feeds.bbci.co.uk/news/business/rss.xml
    name: BBC Business
  - url: https://www.gov.uk/search/news-and-communications.atom
    name: UK Government Announcements
  - url: https://feeds.skynews.com/feeds/rss/politics.xml
    name: Sky News Politics
  - url: https://www.theguardian.com/politics/rss
    name: Guardian Politics
  - url: https://www.ft.com/rss/home
    name: Financial Times
  - url: https://www.swissinfo.ch/eng/rss/top_news
    name: SWI swissinfo.ch
  - url: https://www.thelocal.ch/feeds/rss.php
    name: The Local Switzerland
  - url: https://www.rte.ie/news/rss/rte-news-business.xml
    name: RTÉ Business (Ireland)
  - url: https://www.smh.com.au/rss/money.xml
    name: Sydney Morning Herald (Australia)
  - url: https://businesstech.co.za/news/feed/
    name: BusinessTech (South Africa)

---

## Notes

- Index labels are what CASSANDRA prints (e.g. "S&P 500"), not the ETF ticker.
  The proxy ETF % move tracks the index closely; this is the data source, not the display.
- CASSANDRA reports facts only. No buy/sell/hold language anywhere.
- Each brief is saved to the `research_briefs` table. IRIS will read these later.
- News digests (Claude summarisation) require explicit "go ahead" before being enabled.
- MFSA: v2 follow-on. Build tools/mfsa-scraper.ts that fetches mfsa.mt/news and
  parses <article> headlines; log loudly on any structural change. Not a launch blocker.
- UK politics/budget feeds (gov.uk, Sky Politics, Guardian Politics, FT, This is
  Money) added 2026-09 — UK fiscal events (Budget, Autumn/Spring Statement) are
  a major driver of pension/IHT client conversations, so UK political coverage
  is now weighted alongside the existing pensions/regulatory/Swiss feeds.
- The relevance filter is `FILTER_PROMPT` in `src/lib/cassandra.ts` (a Haiku
  prompt, not a keyword-matching function — no `isRelevantToDeVere` function
  exists in this codebase, despite an earlier version of this note claiming
  otherwise). Sharpened 2026-10-12 with a wider include list (cross-border
  countries — Ireland, Australia, South Africa, NZ, Portugal/Spain — plus
  offshore/portfolio bonds, SNB/CHF, UK budget terms) and an exclude list
  covering FCA content outright (not just enforcement — any FCA item), plus
  MiFID/EMIR/SFTR/post-trade reporting, MFSA/ESMA/IOSCO, and domestic-only
  noise (buy-to-let, stamp duty, planning permission, individual share bans).
