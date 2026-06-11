# Decisions Log

Append-only audit trail. Each entry: date · agent/human · decision + rationale.

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
