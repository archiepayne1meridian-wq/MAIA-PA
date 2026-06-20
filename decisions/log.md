# Decisions Log

Append-only audit trail. Each entry: date · agent/human · decision + rationale.

---

## 2026-06-17 — Dashboard D3a (OpenBB service — infrastructure)

**Decision:** Deploy OpenBB Platform as its own Railway service (separate service, root dir `openbb-service/`, same Railway project as MAIA). MAIA app routes to it via `OPENBB_URL` + `OPENBB_TOKEN`.

**Architecture:** `openbb-service/Dockerfile` (Python 3.11-slim + openbb + openbb-fmp). `main.py` wraps OpenBB's FastAPI app with a `BearerAuth` Starlette middleware — all non-health requests require `Authorization: Bearer <OPENBB_API_KEY>`. Health and docs paths pass through unauthenticated. MAIA's existing `OpenBBProvider` in `tools/market-data.ts` sends the token already; no MAIA-side changes needed.

**Provider strategy:** yfinance is the OpenBB default but Railway's datacenter is TCP-blocked from Yahoo Finance endpoints (same block as direct fetches from the Next.js app). FMP (`openbb-fmp`, `FMP_API_KEY`) is included in requirements.txt as the Railway-safe provider. Both are installed; the verify script (`tools/verify-openbb.ts`) tests both per endpoint and reports which works. Decision to formally switch provider config deferred until verification output is reviewed.

**FMP free tier:** 250 API calls/day, 5/min. Confirmed adequate for personal terminal use (no auto-refresh). LSE ETF historical coverage on FMP free (VWRP.L, VDPG.L) is unconfirmed — verify script will determine this. If FMP free doesn't cover LSE history, split strategy remains: OpenBB/FMP for US tickers + news, HybridProvider (Twelve Data + Alpha Vantage) for LSE quotes.

**D3a complete when:** `tools/verify-openbb.ts` returns confirmed prices + currency for all 6 holdings (MU, AMAT, IONQ, MSTR, VWRP.L, VDPG.L) + GBP/USD FX, plus historical bars from at least one provider.

---

## 2026-06-10 — Human + MAIA (Phase 0)

**Decision:** Scaffold MAIA as a fresh, isolated repo — no code, data, or credentials shared with Meridian/JARVIS.

**Rationale:** CLAUDE.md Isolation requirement. Any cross-system dependency is a bug. MAIA has its own GitHub repo, Railway project, SQLite DB, Slack app, and env vars.

**Stack chosen:** Next.js 16 (App Router, TypeScript) + Drizzle ORM + better-sqlite3 + Anthropic SDK. Railway for hosting; Railway volume for persistent SQLite.

**Spine design:** Slack Events API (`message.channels`) → `/api/slack/events` → Claude (`claude-sonnet-4-6`) → Slack thread reply. HMAC verification on every inbound Slack request. Deduplication via `event_id` column on `activity` table.

**Approval gate:** All outbound actions write to `approvals` table and surface as Slack interactive buttons (Approve / Reject) before executing. `/api/slack/interactive` handles callbacks.

**Compliance note:** No agents built in Phase 0. Spine only. Tier-3 agents (IRIS, LUNA) remain shelved until deVere compliance sign-off.

---

## 2026-06-10 — Human + MAIA (Phase 1 — ATHENA)

**Decision:** Build ATHENA as MAIA's first agent — a CISI study coach using SM2 spaced repetition and MCQ drilling.

**Autonomy level:** Info-only / study-and-drill (Tier 1). Operates entirely on the user's own data. No client data, no external output, no approval gate required for study interactions.

**KPI:** Cards reviewed per week; MCQ accuracy trend per module; days-to-exam countdown.

**Design choices:**
- `tools/sm2.ts` — pure function with no I/O, fully unit-tested (13 tests, 0 failures) before anything depended on it.
- `tools/study-db.ts` — all SQLite reads/writes for ATHENA; keeps reasoning thin in the handler.
- `tools/mcq.ts` — pure session helpers; no DB coupling.
- `src/lib/athena.ts` — Claude-facing functions using `askWith()` (custom system prompt, higher max_tokens). Claude generates cards/MCQs only from supplied material — never from its own CISI knowledge.
- `src/lib/athena-handler.ts` — implements flows A–F; logs every action to `activity` with `agent: 'ATHENA'`.
- Intent routing in `/api/slack/events` uses specific keyword matching; falls through to the MAIA `ask()` spine on no match.
- `/api/slack/interactive` extended with `athena_reveal_*`, `athena_grade_*`, `athena_mcq_*` prefixes. Approvals block untouched.
- **Concurrency guard:** MCQ answer taps are ignored unless `qIndex === session.current_index` — prevents double-count from stale buttons.
- **Hard stop before paid calls:** `handleDailyQuiz` posts a summary and waits for explicit "go ahead" before calling Claude for MCQ generation. Same pattern for card ingest.

**Compliance note:** ATHENA generates study content from user-supplied material only. Content is explicitly flagged as a revision aid to be verified against the official CISI workbook. No client data involved.

---

## 2026-06-10 — Human + MAIA (Phase 1 — ATHENA complete)

**Status:** Complete. Awaiting real CISI material to begin live use.

**Autonomy level:** Study/drill — Tier 1, internal only. No client data, no outbound actions, no approval gate required.

**KPI:** Cards reviewed per week; MCQ accuracy trend per module.

**Bugs found and fixed in testing:**

1. *Module-name parsing* — `detectAthenaIntent` was capturing everything after "to" (including the colon and material) as the module name. Fixed: split on first colon; module = text before colon (trimmed, title-cased via `normalizeModule`); material = text after colon. `handleIngest` updated to consume the already-clean material directly.

2. *MCQ index↔letter scoring* — The MCQ prompt instructed Claude to embed letter prefixes in option strings (`"A: text"`). The display layer then prepended the letter again, producing `"A: A: text"`. Worse, Claude could reorder options while preserving embedded letters, silently breaking index alignment. Fixed: options are plain text only; letters are derived exclusively from array position via `letterFor()` in `tools/mcq.ts`, which is the single source of truth for display, scoring, and feedback. Defensive strip added in parsing to remove any stray letter prefixes Claude adds despite instructions. 22 unit tests (sm2 + mcq) all passing.

---

## 2026-06-11 — Human + MAIA (Phase 1 — DEMETER scaffold)

**Decision:** Build DEMETER as MAIA's second agent — personal portfolio tracker with scheduled Slack brief.

**Autonomy level:** Info-only / scheduled-push (Tier 1). Own portfolio data only. No client data, no approval gate, no trade signals.

**KPI:** Daily brief delivered; P&L accuracy vs account statement; cron uptime.

**Design choices:**

- `tools/portfolio.ts` — pure functions, no I/O. The model never computes numbers; only this tool does (same discipline as `sm2.ts`). 54 unit tests (including portfolio + ATHENA suite) passing.
- `avg_cost` stored in **GBP (base currency)** for all holdings, regardless of native price currency. P&L = value_GBP − cost_GBP; FX conversion is applied to prices only, not to cost.
- Advice-word guard uses **whole-word regex** (`\bhold\b` not `hold`) applied to DEMETER's own composed prose only — not to attributed third-party news. In the scheduled path, a guard trip logs and continues; it does not abort the brief. Throws in strict/test mode.
- `tools/market-data.ts` — price interface with StubProvider (default) and OpenBBProvider (activated by `OPENBB_URL`+`OPENBB_TOKEN`). LSE ticker map: `VWRP→VWRP.L`, `VDPG→VDPG.L`; pence (GBX) conversion for LSE-listed instruments.
- FX conversion: `getPricedHoldings` fetches FX rates and computes `fxToBase` per holding. `fxToBase` is applied to prices, not to `avg_cost`.
- `POST /api/demeter/brief` — Bearer auth via `timingSafeEqual` (Node crypto, not Web Crypto). 200-first + `setImmediate` async pattern (same as all MAIA routes).
- `DRY_RUN` not applicable to info-only brief; Golden Rule governs outbound actions needing approval. A personal portfolio brief to your own channel is not one.
- `.github/workflows/demeter-brief.yml` — Mon–Fri `cron: '30 6 * * 1-5'` (06:30 UTC = 07:30 BST). 1h winter drift documented; tune if needed.
- Holdings seeded with real Trading 212 ISA data (6 positions, GBP cost basis provided).
- Research terminal (TradingView lightweight-charts with avg-cost line in GBP) is a follow-on after the scheduled brief is proven — not built in this phase.

**Compliance note:** DEMETER is informational only. Risk flags are neutral facts (`"MSTR is 45% of the book."`) — never advice. `summariseNews()` is a stub that throws until the news Claude call is explicitly approved. No personal-account trading signals or automation.

**Status:** Scaffold complete. Next: start Railway dev server, verify Slack DEMETER intent routing end-to-end, seed holdings via "DEMETER, seed holdings", then manual POST to `/api/demeter/brief`.

---

## 2026-06-14 — Human + MAIA (Phase 1 — DEMETER live data)

**Decision:** Wire live prices via Twelve Data (US tickers) + Alpha Vantage (LSE ETFs).

**Root cause of delay:** Yahoo Finance (both `yahoo-finance2` npm package and direct `fetch()`) is blocked at TCP level from Railway's datacenter IPs — `fetch failed`, not HTTP 4xx. No workaround; requires an API-key-authenticated provider so the IP doesn't matter.

**Twelve Data free tier** (`TWELVE_DATA_API_KEY`): covers NASDAQ/NYSE. Confirmed Railway-safe. Handles MU, AMAT, IONQ, MSTR + the GBP/USD FX rate.

**Alpha Vantage free tier** (`ALPHA_VANTAGE_API_KEY`, 25 req/day): covers LSE ETFs. Railway-safe (API-key auth). Handles VWRP.LON and VDPG.LON. Sequential fetches with a 1.2s gap to respect the 1-req/sec burst limit. Free key at alphavantage.co/support/#api-key.

**`tools/market-data.ts` design:**
- `HybridProvider` routes by exchange: `LSE_TICKERS = {VWRP, VDPG}` → Alpha Vantage; all others → Twelve Data. FX always from Twelve Data.
- Alpha Vantage `GLOBAL_QUOTE` does not return a currency field — currency inferred from symbol suffix (`.LON` → `GBP`). `normalisePence` is still called in case AV returns GBp for any future ticker.
- Per-symbol error logging in `TwelveDataProvider`: code + message logged immediately on `status:"error"` rows — no silent failures.
- `getProvider()` warns loudly (console.warn) if either key is missing and falls back to `StubProvider`.

**Verified:**
- All 6 holdings resolve locally: VWRP £140.08, VDPG £43.40, total ≈ £3,124.
- Brief posts to Slack with live prices, day P&L, total P&L, allocation %, and concentration flag (VWRP 45%).
- `workflow_dispatch` on `demeter-brief.yml` fires the brief unattended via GitHub Actions → Railway → Slack.

**Status:** DEMETER Phase 1 complete. Scheduled-push pattern proven.

---

## 2026-06-15 — Human + MAIA (Phase 1 — CASSANDRA complete)

**Decision:** Build CASSANDRA as MAIA's third agent — weekday market & FX morning brief synthesising public index levels, FX rates, regulatory news (FCA RSS), and general financial headlines (BBC Business RSS).

**Autonomy level:** Scheduled-push / on-demand (Tier 2). Public data only. No client data. No approval gate. `digestNews` uses Haiku for neutral one-line explanations per section.

**KPI:** Brief delivered at 07:35 BST Mon–Fri; all four sections populated with live data; no advice language; each brief saved to `research_briefs` for IRIS to draw on later.

**Design choices:**

- `tools/feeds.ts` — `fetchFeed` + `fetchAllFeeds` (Promise.allSettled). Skips unreachable feeds gracefully (log + accumulate skipped names). Handles both RSS 2.0 `<item>` and Atom `<entry>` formats. `fast-xml-parser` added as dependency.
- Index data via ETF proxies (free Twelve Data tier): `SPY → "S&P 500"`, `QQQ → "Nasdaq"` (TD NASDAQ); `ISF.L → "FTSE 100"` (Alpha Vantage `.LON` path, same as VWRP/VDPG). Brief shows `label + % move` only — ETF price level not shown (avoids ISF.L £10 vs FTSE 100 8,200 confusion). `IndexSpec { symbol, label }` maps proxy ticker → display name.
- FX data: `getFxQuotes` via Twelve Data `/quote` endpoint (same free tier). Returns `rate + prevClose + dayChangePct` per pair.
- `src/lib/cassandra.ts` — `formatBrief` + `digestNews`. Advice-word guard: whole-word, case-insensitive, on CASSANDRA's own prose only. Applied per-line to digest output (drop offending line, keep rest — never abort the section). Third-party attributed titles bypass the guard.
- `digestNews`: one Haiku call per section (2 calls per brief). System prompt instructs: produce one-sentence explanations of what a headline means/why it matters; relay plainly if too thin to add context; never hallucinate; no advice language. Falls back to raw titles on error.
- `src/app/api/cassandra/brief/route.ts` — Bearer auth + 200-first + setImmediate (identical pattern to DEMETER).
- `.github/workflows/cassandra-brief.yml` — Mon–Fri 06:35 UTC (07:35 BST), 5 min offset from DEMETER to avoid simultaneous posts. `workflow_dispatch` enabled.
- `research_briefs` table: stores markets_json, headlines_json, summary per brief. IRIS will read these later (Tier 3, shelved until deVere compliance sign-off).
- `context/cassandra.md` config parser: plain YAML-lite format parsed at runtime. Indices use `symbol:label` format; feeds use `url: / name:` nested objects.

**Blockers resolved:**
- Twelve Data free tier doesn't cover index symbols (SPX, UKX → 403). Resolution: ETF proxies (SPY, QQQ via TD; ISF.L via AV).
- MFSA has no discoverable RSS feed (URL 403). Resolution: use FCA RSS (`fca.org.uk/news/rss.xml`, 20 items confirmed). MFSA is a v2 HTML-scraper follow-on (`tools/mfsa-scraper.ts`).

**Verified:**
- `tools/feeds.ts`: 5 unit tests pass (RSS parse, Atom parse, HTTP 404, network error, multi-feed).
- Live brief: S&P 500 +0.54% · Nasdaq +0.59% · FTSE 100 +1.50% · GBP/USD 1.3431 +0.24%.
- 4/4 Regulatory digests (FCA) + 4/4 Headlines digests (BBC Business) generated via Haiku.
- Brief saved to `research_briefs`; `activity` rows show `agent='CASSANDRA'`.
- Manual `curl` POST → brief posts to Slack; `workflow_dispatch` fires unattended.
- No advice language in any output; advice-word guard tested.

**Status:** CASSANDRA Phase 1 complete. Multi-source RSS synthesis pattern proven.

---

## 2026-06-15 — Human + MAIA (Phase 1 — HERA complete)

**Decision:** Build HERA as MAIA's fourth agent — daily reflection logging with warm acknowledgement, evening nudge, and Sunday weekly coaching review.

**Autonomy level:** Info-only / scheduled-push (Tier 1). Personal development data only. No client data. No approval gate required.

**KPI:** Reflection logged (text + voice) with warm ack; evening nudge fires unattended and skips if already reflected; weekly review warm and constructive over seeded reflections; distress path verified.

**Design choices:**

- `tools/hera-db.ts` — pure CRUD with `calcStreak` exported for unit testing. No DB-touching logic mixed into the pure streak calculation.
- `vitest.config.ts` added — resolves `@/*` alias so any future tool tests that import from `@/db` work correctly (was previously untestable).
- `detectDistress` — keyword floor, deterministic, no API dependency. Tuned to over-flag vs. miss real distress, but NOT so trigger-happy it trips on normal bad days. Split: primary (unambiguous crisis language) and secondary (strong distress). Bare `exhausted` and bare `overwhelmed` removed from secondary after refinement — require qualifier (`completely overwhelmed`, `burned out`, `breaking point`). All 12 boundary test cases pass.
- Belt-and-braces: `acknowledgeReflection` (Haiku) can raise a distress flag via `[DISTRESS]` prefix if it catches what keywords missed. It can never suppress a keyword flag. Final flag = keyword OR model. Sequence enforced in handler: check flag BEFORE showing any ack to user.
- Supportive response: warm, human, gently points toward a trusted person (friend/family/GP). Not a helpline wall, no diagnosis, no specific methods. Reviewed and approved.
- `coachWeekly` (Haiku, 600 tok): leads with what's working; frames sticking points as next steps; adviser prompt grounded in actual reflections — if the week doesn't suggest a specific topic, an open question is used rather than a manufactured concern.
- `POST /api/hera/nudge` — `mode=nudge|weekly` param; same Bearer + 200-first + setImmediate pattern as DEMETER/CASSANDRA.
- `.github/workflows/hera-nudge.yml` — daily 20:30 UTC + Sunday 20:00 UTC; `workflow_dispatch` with mode input.
- Evening nudge skips if a reflection already exists today (`getTodayReflections` check).
- Client-mention guard: gentle reminder to keep notes self-focused if a reflection names a real client; note still logged.
- `sentimentTag` (positive/neutral/low) stored internally for pattern-spotting; never surfaced to user as a label.

**Weekly review verified (5 seeded reflections):**
Haiku produced a warm, specific 3-paragraph review: named the flashcard/repetition pattern as working, identified pension tapering as a recurring gap, ended with a grounded adviser question about explaining pension allowances to clients. Did not fabricate patterns; stayed constructive throughout.

**Distress path verified (12/12 keyword cases):**
Normal bad days (rattled, frustrated, exhausted, overwhelmed by workload) → clean.
Genuine distress (burned out, breaking point, can't cope, not okay) → flagged.
Supportive response wording approved.

**Status:** HERA Phase 1 complete.

---

## 2026-06-15 — Human + MAIA (Phase 1 — DIANA complete)

**Decision:** Build DIANA as MAIA's fifth agent — objection-handling reference library and full mock cold-call roleplay with rubric-scored feedback.

**Autonomy level:** Info-only / interactive practice (Tier 1). Own use only. No client data. No approval gate. Nothing outbound.

**KPI:** Objection buttons post; tapping returns the four curated blocks; roleplay runs a full in-character mock call with active-session routing interception; exit gives rubric-scored feedback scored on all 7 criteria; no advice or pitch scripting; all actions logged to `activity` with `agent='DIANA'`.

**Design choices:**

- `diana_sessions` table — 9 columns including `last_active_at` (not in minimum spec but required for 4h timeout so a stale session can never trap routing forever).
- `tools/diana-db.ts` — pure CRUD + three exported pure functions (`parseTranscript`, `appendTurnToTranscript`, `isSessionExpired`) for unit testing. 15 new tests (86 total passing).
- `parseDianaConfig()` reads `context/diana.md` at runtime — parses all 8 objections (intent/approach/pivot/principles), difficulty default, firmTone, and the full rubric text. Config is human-editable without code change. All 8 objections parse cleanly (verified against actual file).
- **Active-session check is the first thing in `handleEvent`** — before `handleGoAheadOrCancel`, before all other intent routing. This ensures any message during a roleplay (including ATHENA/HERA keywords) routes to DIANA's roleplay handler until the user explicitly exits.
- **DIANA intent detection runs before HERA/CASSANDRA/DEMETER/ATHENA** so a `"diana,"` prefix always wins regardless of what other words appear in the start command.
- Roleplay opening is deterministic ("Hello?") — no Claude call needed at session start; the adviser makes the first move as the caller.
- `roleplayTurn` (Haiku, 120 tok): receives the transcript BEFORE the latest user message + the user message separately; Claude replies as the prospect in 2–4 natural sentences.
- `roleplayFeedback` (Haiku, 500 tok): receives the full transcript + rubric from `context/diana.md`; scores all 7 criteria (talk ratio, open questions, rapport, need-led, objection handling, stayed in lane, secured next step); names the single highest-leverage fix; quotes one line well used and one to improve.
- `objectionGuide` (Haiku, 300 tok): fallback for un-curated objections only; output clearly marked `[DRAFT — refine with firm-approved material]`.
- Compliance: every reference-mode response carries "Scripts are practice scaffolding — firm-approved material governs real calls." The "Where did you get my details" approach text contains `[YOUR ACTUAL LEAD SOURCE, stated truthfully]` — DIANA serves whatever the user has filled in; never invents a source.
- Session timeout: `isSessionExpired(lastActiveAt)` returns true after 4h inactivity (14400s). `getActiveSession` auto-expires and returns null, releasing routing to normal agents.
- `logPractice(userId, objection)` records each objection drill to `activity` table with `type='objection_drill'` for pattern visibility.

**Routing order in events route (final):**
1. DIANA active-session check (intercepts all routing while roleplay is active)
2. ATHENA go-ahead/cancel
3. DIANA intent (reference + roleplay start) — before HERA/CASSANDRA/DEMETER/ATHENA
4. HERA → CASSANDRA → DEMETER → ATHENA → MAIA spine

**Status:** DIANA Phase 1 complete. Pending live Slack verification (reference buttons, roleplay turn, scored feedback).

---

## 2026-06-16 — Dashboard D1 (live data wiring)

**Decision:** Converted dashboard home screen from stub data to live DB reads for all 6 built agents (MAIA, ATHENA, CASSANDRA, DEMETER, HERA, DIANA, VICTORIA). Inactive agents (LUNA, IRIS, JUNO) render as greyed coming-soon tiles — no fake data.

**Architecture:** `page.tsx` is now a server component that calls `buildDashboardData()` (all reads from SQLite via Drizzle), passes typed props to `DashboardClient.tsx` (client component with orb/drawer state). Calendar column remains stubbed (D4).

**Security decision (human):** `/api/dashboard/*` routes enforce session cookie authentication in BOTH dev and prod — no `NODE_ENV` bypass. Rationale: these routes serve holdings, P&L, and KPI data; a mis-set `NODE_ENV` would silently expose financial data. Dev bypass kept only on `proxy.ts` (layout access gate), not on data routes.

**DEMETER data source:** Day-change % reads from `portfolio_snapshots` only — no live price fetch on dashboard load. Snapshot from the morning brief is sufficient; hammering the price API on every page open is unnecessary.

**Live vs stubbed:**
- Live: agent rail status/stat/feed for 7 built agents, "need you" count from `approvals`, ATHENA due-card task, CASSANDRA brief-reviewed task, HERA reflection-done task.
- Stubbed: calendar events (D4), greeting/message-bubble text, quick-action chips.

**Regression confirmed:** `/api/health` 200, `/api/demeter/brief` 401 (bearer required), `/api/cassandra/brief` 401, `/api/slack/events` 200 (url_verification handled).
