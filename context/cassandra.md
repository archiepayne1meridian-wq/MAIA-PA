# CASSANDRA — Config

Agent: CASSANDRA · Tier 2 (public market data + news feeds, no client data)

---

## Timing

```
brief_time: 07:35 Europe/London, Mon–Fri
items_per_section: 4
```

## Indices (Twelve Data symbols — verify each resolves before going live)

```
indices:
  - SPX        # S&P 500
  - UKX        # FTSE 100
  - IXIC       # Nasdaq Composite
  # - SX5E     # Euro Stoxx 50
  # - NKY      # Nikkei 225
```

## FX pairs (Twelve Data format: BASE/QUOTE)

```
fx_pairs:
  - GBP/USD
  - EUR/USD
  - EUR/GBP
  # - USD/JPY
```

## News feeds (RSS/Atom URLs)

```
news_feeds:
  - url: https://feeds.bbci.co.uk/news/business/rss.xml
    name: BBC Business
  # - url: https://www.ft.com/news-feed
  #   name: FT
```

## Regulatory feeds (MFSA and optionally FCA)

```
regulatory_feeds:
  - url: https://www.mfsa.mt/news/feed/
    name: MFSA
  # - url: https://www.fca.org.uk/news/rss.xml
  #   name: FCA
```

---

## Notes

- Index symbols follow Twelve Data's conventions (not Yahoo Finance). Verify symbols
  in Step 5 before going live — e.g. SPX, UKX, IXIC are correct as of June 2026.
- CASSANDRA reports facts only. No buy/sell/hold language anywhere.
- Each brief is saved to the `research_briefs` table. IRIS will read these later.
- News digests (Claude summarisation) require explicit "go ahead" before being enabled.
