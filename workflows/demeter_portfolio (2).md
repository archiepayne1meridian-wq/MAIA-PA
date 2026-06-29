# Workflow: DEMETER — Personal Portfolio Tracker

**Agent:** DEMETER · **Tier:** 1 (own data) · **Domain:** personal finance
**Shaped like:** Meridian's Poppy (design reference only — build clean for MAIA)
**Phase:** 1 (second agent) · **Proves:** the scheduled-push pattern (cron → Railway → agent → Slack)

---

## Objective

Keep the adviser on top of their **own** investment portfolio. DEMETER tracks holdings, and each weekday morning pushes a Slack brief: total value, day and total P&L, allocation, risk flags, and any material news on the stocks held. She also answers portfolio questions on demand. Mostly deterministic; Claude is used only to summarise news.

---

## ⚠️ Compliance Guardrail — read first

DEMETER is **strictly informational**. This is non-negotiable (CLAUDE.md → Compliance):

- She **tracks and reports** — she does **not** advise, recommend, or signal trades. No "buy", "sell", "you should", "consider trimming", price targets, or ratings. Ever.
- She **never places or automates trades**. Do **not** port Meridian's Honey/auto-trading pattern here. As a regulated-firm employee the user is subject to **personal-account (PA) dealing rules**; DEMETER must stay a passive monitor.
- Risk "flags" are neutral heads-ups (e.g. "NVDA reports earnings Thursday", "AAPL is 31% of the book"), framed as facts, never as a prompt to act.
- This is the user's **own** portfolio — no client data. Tier 1.

If a draft brief ever contains advice-like language, that's a bug — strip it.

---

## What DEMETER Proves (the new pattern)

ATHENA was interactive. DEMETER adds the **scheduled, unattended push**:

```
GitHub Actions cron (Mon–Fri 07:30 London)
      → curl POST /api/demeter/brief  (Authorization: Bearer MAIA_API_KEY)
            → DEMETER builds the brief (deterministic numbers + optional news)
                  → posts to Slack channel  (info-only, NO approval gate)
```

This is the template every later morning-brief agent reuses. Info-only briefs do **not** use the approvals table — the Golden Rule governs *outbound actions needing sign-off*; a personal info brief to your own channel isn't one.

---

## Required Inputs

**From `context/demeter.md`** (human-editable config; create template if absent):
- `base_currency` — default GBP
- `brief_time` — default 07:30 Europe/London, Mon–Fri
- `concentration_threshold` — flag a holding above this % of book (default 25)
- `day_move_threshold` — flag a holding moving more than ±this % on the day (default 5)
- `earnings_lookahead_days` — flag earnings within N days (default 7)

**Holdings** — managed via chat (stored in DB):
- "DEMETER, add 10 AAPL at 150 USD" / "remove AAPL" / "update AAPL to 12 shares" / "list holdings"

---

## Tools To Use

Reuse Phase 0/1 Slack + Claude wrappers + `getDb()`. New units:

- `tools/portfolio.ts` — **pure functions, no I/O** (this is the testable core, like `sm2.ts`): given holdings + current prices, compute total value, total cost, total P&L, day P&L, per-holding allocation %, and the risk flags. **The model never computes numbers** — only this tool does, so figures can't be hallucinated.
- `tools/market-data.ts` — fetch current price + previous close / day change per ticker, for **holdings P&L and the morning-brief numbers only** (the research terminal gets its charts, search and news from TradingView widgets — see Dashboard). Provider is swappable behind a clean interface (OpenBB via `OPENBB_URL`/`OPENBB_TOKEN`, or a simple quote API); build and test with **stub data first**.
- `tools/demeter-db.ts` — holdings CRUD + `saveSnapshot()` / `getLastSnapshot()` (daily snapshot enables day-over-day P&L and history).
- `src/lib/demeter.ts` — Claude-facing: `summariseNews(ticker, items)` → one-line material-event summaries; `formatBrief(computed)` → the Slack message. Brief, factual, no advice language.
- `src/lib/demeter-handler.ts` — chat handlers + the scheduled-brief builder.

---

## Data Model (new tables — add to `src/db/schema.ts`, migrate; leave existing tables untouched)

`holdings`
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| ticker | TEXT NOT NULL | upper-cased |
| name | TEXT | resolved name (optional) |
| quantity | REAL NOT NULL | shares/units |
| avg_cost | REAL NOT NULL | per-unit cost |
| currency | TEXT | e.g. USD/GBP |
| added_at / updated_at | INTEGER | |

`portfolio_snapshots`
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| taken_at | INTEGER | |
| base_currency | TEXT | |
| total_value | REAL | in base currency |
| total_cost | REAL | |
| day_change | REAL | vs previous snapshot/close |
| holdings_json | TEXT | per-holding values at snapshot time |

(Config lives in `context/demeter.md`, not the DB.)

---

## Risk Flag Rules (deterministic, in `tools/portfolio.ts`)

- **Concentration:** any holding > `concentration_threshold`% of total value → "AAPL is 31% of the book."
- **Day move:** any holding moves more than ±`day_move_threshold`% on the day → "NVDA −7.2% today."
- **Earnings/material event:** if news/calendar shows earnings within `earnings_lookahead_days` → "TSLA reports earnings in 2 days."
All flags are neutral statements of fact — never a call to act.

---

## Scheduled Brief

- **Endpoint:** `POST /api/demeter/brief` — Bearer auth (`MAIA_API_KEY`); 401 otherwise. Builds the brief and posts to `SLACK_CHANNEL_ID`. No approval.
- **Cron:** `.github/workflows/demeter-brief.yml` — Mon–Fri 07:30 London (mind UTC offset) → `curl -f -X POST -H "Authorization: Bearer ${{ secrets.MAIA_API_KEY }}" ${{ vars.MAIA_URL }}/api/demeter/brief`.
- **Build steps inside the endpoint:** load holdings → `market-data` prices → `portfolio.ts` computes everything → `saveSnapshot()` → (optional) news summary → `formatBrief()` → post to Slack → log to `activity` (`agent: 'DEMETER'`).
- **Empty portfolio** → post a gentle "no holdings tracked yet — add some with 'DEMETER, add …'" rather than erroring.

---

## Chat Interactions

- "portfolio" / "how's my portfolio" → on-demand version of the brief.
- "DEMETER, add/remove/update/list holdings" → manage holdings; confirm changes.
- "DEMETER, news on AAPL" → material news summary for one ticker.
- "DEMETER, what's my allocation" → allocation breakdown.

Intent routing: extend the events route to detect DEMETER intents (portfolio, holdings, allocation, "demeter", "news on <ticker>"). ATHENA routing and the plain-MAIA fallthrough must remain unchanged.

---

## Dashboard — Research Terminal (web app)

DEMETER's second surface: a Bloomberg-style terminal in the MAIA web app. **Data backbone: self-hosted OpenBB** — one source for prices, history, news and fundamentals across stocks, ETFs, indices, crypto and FX. OpenBB provides *data, not UI*, so the terminal renders its own components from OpenBB feeds:

- **Charts:** TradingView's free open-source **lightweight-charts** *library* (not the embeddable widget), drawn from OpenBB historical data. Because we render the chart ourselves, we draw your **average-cost entry line** natively (green in profit / red when down) plus a position badge — the feature the bare widget could not do.
- **Search / news / stats:** built components fed by OpenBB (symbol search, news list, key stats / fundamentals).
- **My Book:** your `holdings` + OpenBB quotes, **converted to base GBP** → value, P&L, allocation, with the entry line on each holding's chart.

Layout (clean-fintech blue, consistent with the MAIA dashboard):
- **Persistent:** a ticker tape (watchlist + holdings) and a global symbol search.
- **Research tab:** a dominant chart with timeframe controls and the cost-basis line; a key-stats strip beneath the chart; a news feed down the right.
- **My Book tab:** account summary (value, total return, net deposits) + holdings table + watchlist.
- Selecting any symbol — from search, ticker tape, watchlist, or a holding row — loads it in the chart.

Watchlist: store in a small `watchlist` table (or `context/demeter.md`).

**OpenBB hosting:** run OpenBB Platform as its **own Railway service** (separate from MAIA), with `OPENBB_URL` / `OPENBB_TOKEN` in MAIA's env. Some OpenBB providers need their own (often free) keys — verify coverage for the two LSE ETFs (VWRP, VDPG) and crypto before relying on them.

**Compliance:** the terminal **displays public market data, charts and news only**. No DEMETER-generated buy/sell signals, ratings, price targets, or recommendations anywhere. Third-party data is shown as-is and attributed.

**Build note & data sourcing:** the terminal is a **follow-on** built *after* the Tier-1 agents — it needs OpenBB stood up. The backend morning brief does **not**: it only needs quotes, so it uses a simple provider now (**Twelve Data**) through the swappable `tools/market-data.ts` interface, and can be pointed at OpenBB once that service is live — giving a single source across the brief and the terminal.

---

## Build / Test Order (paid-call discipline)

Prices may come from a data API; **news summarisation is the only Claude call.** Build in this order so each step is verifiable and cheap:

1. `tools/portfolio.ts` + unit tests (pure maths — value, P&L, allocation, flags) **before anything depends on it.**
2. Holdings CRUD over chat (free).
3. The brief with **stub prices, numbers only, no news** — prove `/api/demeter/brief` posts to Slack when hit manually (free, no Claude).
4. Wire the cron to hit that endpoint — prove the **scheduled push** fires unattended.
5. Swap stub prices for the real `market-data` source (OpenBB or interim provider).
6. **Then** add news summarisation. HARD STOP before the first live `summariseNews()` Claude call: report what it's about to summarise and wait for "go ahead".

OpenBB self-hosting is **not** a blocker for steps 1–4 — prove the pattern first, add the real data and news after.

---

## Expected Outputs

- Holdings persisted and editable via chat.
- A correct, deterministic portfolio brief (numbers from `portfolio.ts`, never the model).
- `/api/demeter/brief` posts to Slack on demand and on schedule, info-only, no approval.
- Daily snapshots stored; day-over-day P&L works.
- Optional per-holding news summaries, factual.
- Every action logged to `activity` (`agent: 'DEMETER'`). No advice-like language anywhere.

---

## Edge Cases

- **Empty portfolio / unknown ticker** → friendly message, no crash.
- **Price source down** → post the brief with last-known/snapshot values and a "prices unavailable" note; don't fail silently.
- **Multi-currency** → convert to `base_currency` via an FX rate from the data source; if FX unavailable, show native currency and note it. (Single-currency is fine to ship first.)
- **Weekend/holiday** → cron is Mon–Fri; on-demand still works any day.
- **Any advice-like phrasing in output** → treat as a bug; DEMETER reports, never recommends.

---

## Done =

- `tools/portfolio.ts` unit-tested; numbers verified by hand on a sample portfolio.
- Add/list holdings over Slack works.
- `POST /api/demeter/brief` posts a correct brief to Slack (manual trigger).
- The cron fires the brief unattended (the scheduled-push pattern proven).
- News summaries work and read as neutral facts.
- All actions in `activity`; no approval gate used; no advice language present.
- Update this workflow with anything learned; log the build in `decisions/log.md`.
