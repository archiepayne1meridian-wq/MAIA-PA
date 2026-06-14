# Workflow: CASSANDRA — Market & FX Morning Brief

**Agent:** CASSANDRA · **Tier:** 2 (public data, feeds content) · **Domain:** markets & news
**Shaped like:** Meridian's Atlas (design reference only — build clean for MAIA)
**Phase:** 1 (third agent) · **Reuses:** DEMETER's scheduled-push pattern · **Proves:** multi-source RSS synthesis

---

## Objective

Each weekday morning, push a Slack brief covering four areas: **markets** (overnight/major index moves), **FX** (key pairs for multi-currency context), **regulatory** (MFSA / relevant regulator news), and **general financial headlines** (synthesised from RSS). Also answers "brief me" on demand. Pairs with DEMETER: CASSANDRA covers the wider market, DEMETER covers the user's own book.

The market/FX **numbers are deterministic** (from a data source). Claude is used only to **synthesise the news/regulatory headlines** into neutral one-liners. Her output is saved so IRIS can draw on it later.

---

## Compliance / Neutrality (Tier 2)

- **Informational only.** CASSANDRA reports public market data and news. No advice, no buy/sell/hold, no recommendations, no predictions framed as guidance, no price targets. Same neutral-framing rule as DEMETER.
- **Relay regulatory items factually** — state what changed; do not editorialise or interpret obligations.
- **No client data.** Public sources only. Tier 2.
- **Copyright:** summarise headlines in CASSANDRA's own words and link the source; never reproduce full articles or long verbatim passages.

---

## Required Inputs

**From `context/cassandra.md`** (human-editable; create template if absent):
- `indices[]` — e.g. S&P 500, FTSE 100, Nasdaq, Euro Stoxx 50, Nikkei 225
- `fx_pairs[]` — e.g. GBPUSD, EURUSD, EURGBP, USDJPY
- `news_feeds[]` — RSS URLs for general financial news (verify each is reachable; e.g. BBC Business RSS)
- `regulatory_feeds[]` — MFSA news/notices (RSS if available, else the news-listing URL to fetch); optionally FCA news
- `brief_time` — default 07:35 Europe/London, Mon–Fri (offset a few min from DEMETER so the two don't post the same second)
- `items_per_section` — default 3–4 headlines per news/regulatory section

---

## Tools To Use

Reuse Phase 0/1 wrappers. Reuse DEMETER's `tools/market-data.ts` for index + FX quotes (extend its interface to index/FX symbols; stub first). New units:

- `tools/feeds.ts` — fetch + parse RSS/Atom feeds. Returns `{title, link, source, published}[]`. Deterministic parse; handle a feed being down gracefully (skip it, note it). Configurable feed list.
- `src/lib/cassandra.ts` — Claude-facing: `digestNews(items, section)` → neutral one-line summaries (own words, source attributed); `formatBrief(markets, fx, regItems, newsItems, skipped)` → Slack message. Apply the **advice-word guard** (whole-word, case-insensitive — same as DEMETER) to **CASSANDRA's own composed prose only**, NOT to attributed third-party headlines.
- `src/lib/cassandra-handler.ts` — intent detection + handlers + scheduled-brief builder. Logs to `activity` (`agent: 'CASSANDRA'`). Saves each brief to `research_briefs`.

---

## Data Model (new table — add to `src/db/schema.ts`, migrate; leave existing tables untouched)

`research_briefs` (CASSANDRA's output; IRIS will read this later)
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| type | TEXT | 'morning' / 'on_demand' / (later) 'deep_dive' |
| markets_json | TEXT | index + FX numbers at brief time |
| headlines_json | TEXT | digested news + regulatory items (title, source, link, one-liner) |
| summary | TEXT | the composed brief text |
| created_at | INTEGER | |

---

## Brief Structure (Slack message)

1. **Markets** — each configured index: level + day % (deterministic). e.g. "FTSE 100 8,214 +0.4% · S&P 500 6,014 +0.5% · Nikkei −0.3%".
2. **FX** — each pair: rate + move. e.g. "GBP/USD 1.272 −0.2% · EUR/GBP 0.842 +0.1%".
3. **Regulatory** — up to N MFSA/regulator items: factual one-liner + source. ("MFSA publishes updated guidance on X — mfsa.mt").
4. **Headlines** — up to N general market items: neutral one-liner + source.

Keep it tight (a commute-length read). All factual; no advice language anywhere.

---

## Scheduled Brief

- **Endpoint:** `POST /api/cassandra/brief` — Bearer auth (`MAIA_API_KEY`); 401 otherwise. Builds the brief, posts to `SLACK_CHANNEL_ID`, saves a `research_briefs` row. No approval (info-only). Use `crypto.timingSafeEqual` for the Bearer check (consistency with DEMETER).
- **Cron:** `.github/workflows/cassandra-brief.yml` — Mon–Fri 07:35 London (`workflow_dispatch` enabled for testing). Same Bearer + `MAIA_URL` pattern as DEMETER.
- **Builder:** fetch market/FX quotes → fetch feeds → `digestNews` → `formatBrief` → post → save → log to `activity`.

---

## On-Demand Interactions

- "CASSANDRA, brief me" / "market brief" / "markets" → on-demand version of the brief.
- "CASSANDRA, FX" / "what's the pound doing" → FX section only.
- Intent routing: extend the events route to detect CASSANDRA intents. DEMETER, ATHENA, and the plain-MAIA fallthrough must all remain intact (order them so no agent's keywords swallow another's).
- (Deep-dive on-demand research via an Opus agentic loop is a **later** follow-on — not in v1. When added, it needs a hard stop before the paid call.)

---

## Build / Test Order (paid-call discipline)

Numbers are deterministic; only the news digest calls Claude. Build cheap-first:

1. `tools/feeds.ts` + a parse test on sample/stub feed XML (free).
2. Extend `market-data.ts` to indices/FX; stub quotes first (free).
3. `formatBrief` with **stub data, no Claude** — prove `POST /api/cassandra/brief` posts to Slack manually (free).
4. Wire the cron; prove the **unattended push** via `workflow_dispatch` (the pattern DEMETER established).
5. Swap stubs for real feeds + real market-data.
6. **Then** add `digestNews` (Claude). HARD STOP before the first live digest call: report what's being summarised and wait for "go ahead".

---

## Compliance Verification

- `formatBrief` runs the **whole-word** advice-word guard (`\bbuy\b`, `\bsell\b`, `\bhold\b`, `\bshould\b`, `\bconsider\b`, `\brecommend\b`, `\brating\b`, `\bprice target\b`) on CASSANDRA's **own** prose. Verify it does NOT trip on "holdings"/"operating"/"buyback".
- The guard does **not** apply to attributed third-party headlines (those are relayed facts).
- In the scheduled path, if the guard trips, log and post the brief without the offending segment — never throw the whole brief away.
- News summaries are CASSANDRA's own words + a source link; no verbatim article reproduction.

---

## Edge Cases

- **A feed is down / unreachable** → skip it, note "some sources unavailable", don't crash the brief.
- **Market data source down** → post news sections + a "market data unavailable" note.
- **No items in a section** → omit that section cleanly.
- **Weekend/holiday** → cron is Mon–Fri; on-demand works any day.
- **Any advice-like phrasing** → treat as a bug; CASSANDRA reports, never advises.

---

## Done =

- `tools/feeds.ts` parse test passes; market/FX numbers verified on stub data.
- "brief me" posts a correct four-section brief to Slack.
- `POST /api/cassandra/brief` posts on manual trigger; cron fires it unattended (`workflow_dispatch`).
- Real feeds + market data wired; news digests read as neutral factual recaps with sources.
- Each brief saved to `research_briefs`; all actions logged to `activity`; no advice language present.
- Update this workflow with anything learned; log the build in `decisions/log.md`.
