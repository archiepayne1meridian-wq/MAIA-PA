# Workflow: VICTORIA — KPI & Pipeline Tracker

**Agent:** VICTORIA · **Tier:** 1 (own activity counts, no client data) · **Domain:** productivity / pipeline
**Shaped like:** a fresh build (closest to HERA's prompt+weekly pattern) · **Phase:** 1 (sixth agent)
**Pattern:** end-of-day prompted tally + weekly scorecard (reuses HERA's nudge/weekly cron + DEMETER's deterministic-numbers rule)

---

## Objective

Be the adviser's personal activity mirror. Each weekday end, VICTORIA prompts for a quick tally
(calls, meetings, follow-ups, etc.); she stores it and turns it into a **visual standpoint over time** —
weekly scorecards showing good weeks, dips, trends, and progress vs targets, so the user can see at a
glance when to step it up.

**The deVere CRM is the source of truth.** VICTORIA does not replace or sync with it — she's a personal
tracking layer the user feeds manually. She holds **counts and trends only**, never client names or
personal data (those stay in the CRM). That keeps her Tier 1.

ATHENA tracks what you *know*; HERA tracks how you're *developing*; VICTORIA tracks what you *do*.

---

## ⚠️ Guardrails

- **Counts, not client data.** Track numbers and aggregates (8 calls, 2 meetings, 14 active clients) —
  never client names, contact details, or case specifics. Those live in the deVere CRM. If a tally
  includes a client name, store only the count and gently note that names belong in the CRM.
- **Not the system of record.** VICTORIA is a personal mirror, not an official record. Don't imply her
  numbers are authoritative over the firm's.
- **Constructive, not a guilt machine.** Flag a down week honestly but supportively ("quieter week on
  calls — worth a push") — never harsh or shaming. The point is motivation and visibility, not pressure.

---

## Required Inputs

**From `context/victoria.md`** (human-editable; create from template if absent):
- `metrics[]` — what to track (default: calls, connects, meetings_booked, meetings_held, follow_ups, new_prospects, active_clients)
- `targets` — optional weekly target per metric (blank = no target tracking for that metric)
- `nudge_time` — end-of-day tally prompt (default 18:00 Europe/London, weekdays)
- `scorecard_day` — weekly scorecard day (default Friday)

**From the user:** the end-of-day tally, in natural language ("8 calls, booked 2 meetings, 5 follow-ups").

---

## Tools To Use

Reuse Phase 0/1 wrappers + the HERA-style nudge/scorecard cron pattern. New units:

- `tools/kpi.ts` — **pure functions, no I/O** (the testable core, like `portfolio.ts`): `weeklyTotals(logs)`,
  `compareToPrevious(thisWeek, lastWeek)` (Δ and %), `vsTargets(totals, targets)`, `trend(recentWeeks)`
  (up/down/flat over N weeks). **The model never computes these numbers — only this tool does.**
- `tools/victoria-db.ts` — `logTally(date, metrics, note)`, `getLogs(range)`, `getDay(date)`,
  `saveWeekly(weekStart, totals, summary)`, `getWeeklies(n)`.
- `src/lib/victoria.ts` — `parseTally(text, metrics)` (deterministic-first, cheap-Claude fallback →
  structured numbers); `formatScorecard(computed)` (deterministic render); `scorecardNarrative(computed)`
  (optional one-line cheap-Claude wrapper — "strong week, meetings dipped").
- `src/lib/victoria-handler.ts` — intent detection, handlers, nudge + scorecard builders. Logs to
  `activity` (`agent: 'VICTORIA'`).

---

## Data Model (new tables — add to `src/db/schema.ts`, migrate; leave existing tables untouched)

`kpi_logs`
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| log_date | INTEGER | the day (normalised to date) |
| metrics_json | TEXT | { calls: 8, meetings_booked: 2, ... } |
| note | TEXT | optional free note |
| created_at | INTEGER | |

`kpi_weekly`
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| week_start | INTEGER | |
| totals_json | TEXT | weekly totals per metric |
| summary | TEXT | the scorecard text |
| created_at | INTEGER | |

(Metrics + targets + timing live in `context/victoria.md`.)

---

## Interaction (over Slack)

**A) End-of-day tally (prompted):**
1. Cron nudge at `nudge_time`: "Quick tally for today? (calls / meetings booked / follow-ups…)". Skip if today's already logged.
2. User replies in natural language → `parseTally` → structured numbers.
3. **Echo and confirm:** "Logged for today: 8 calls · 2 meetings booked · 5 follow-ups. Looks right?" — so a bad parse never silently corrupts the data. A correction overwrites the day.
4. `logTally()`.

**B) Weekly scorecard (cron, `scorecard_day`):**
- `kpi.ts` computes weekly totals, week-over-week deltas, vs-targets, and the multi-week trend (all deterministic).
- `formatScorecard` renders it; optional `scorecardNarrative` adds one warm contextual line.
- Saved to `kpi_weekly`. Info-only, no approval.

**C) On-demand:**
- "VICTORIA, how am I doing" / "my numbers" / "scorecard" → week-so-far or latest scorecard.
- "VICTORIA, [tally]" → log anytime, not just at the nudge.

Intent routing: add VICTORIA detection (tally-style messages after a nudge, plus the on-demand phrases).
Keep all existing agents + the MAIA fallthrough intact; the DIANA active-session check still sits on top.

---

## Tally Parsing

- **Deterministic first:** regex/keyword match against the configured metric names + numbers
  ("8 calls", "2 meetings booked", "5 follow ups"). Cheap, reliable for normal input.
- **Cheap-Claude fallback** (Haiku, JSON out) only when the deterministic parse is incomplete/ambiguous.
- **Always echo-and-confirm** before/after storing so the user can correct a misread. Accuracy of the
  stored number matters more than saving a round-trip.

---

## Scheduled Pieces

- `POST /api/victoria/nudge` (Bearer `MAIA_API_KEY`, `crypto.timingSafeEqual`) with `mode=nudge|scorecard`.
  Info-only, no approval. `workflow_dispatch` enabled.
- Cron: end-of-day nudge (weekdays, `nudge_time`) + weekly scorecard (`scorecard_day`). Offset from the
  morning briefs and HERA's evening nudge so nothing collides.

---

## Build / Test Order (paid-call discipline)

Numbers are deterministic; Claude only does messy-tally fallback + the optional narrative line.

1. `tools/kpi.ts` + unit tests (weekly totals, week-over-week %, vs-targets, trend) — **before anything depends on it.** Free.
2. `victoria-db.ts` + logging with a **deterministic-only** parse and echo-confirm (no Claude) — free.
3. Nudge + scorecard endpoint + cron; prove the unattended nudge and a stub scorecard via `workflow_dispatch` — free.
4. **Then** add Claude: the parse fallback, then `scorecardNarrative`. HARD STOP before the first live call — show prompts + sample and wait for "go ahead". Cheap model (Haiku/Sonnet), not Opus.
5. Seed a couple of weeks of tallies; verify the scorecard numbers/trends by hand.

---

## Dashboard Note

VICTORIA's `kpi_logs` + `kpi_weekly` are exactly what the dashboard's **activity panel** will read to draw
the charts the user wants (weekly bars, trend lines, target progress). Building her now seeds that panel —
no extra work needed later beyond rendering.

---

## Edge Cases

- **No tally logged** → nudge fires; if already logged, skip. A missed day is just absent (not zero-filled
  unless the user says "nothing today").
- **Partial tally** ("did 6 calls") → log what's given; don't force every metric.
- **Client name in a tally** → store the count only; gentle note that names belong in the CRM.
- **Sparse week** → scorecard says so honestly; don't fabricate a trend from one day.
- **Correction** → re-logging a day overwrites it; confirm the overwrite.

---

## Done =

- `tools/kpi.ts` unit-tested; weekly totals / deltas / targets / trend verified by hand.
- End-of-day nudge fires unattended (`workflow_dispatch`), skips if logged; tally parsed, echoed, stored.
- Weekly scorecard computes correct numbers + trend, renders warmly, saved to `kpi_weekly`.
- On-demand "how am I doing" works.
- Counts only — no client names/personal data stored.
- All actions logged to `activity` (`agent: 'VICTORIA'`); update this workflow + `decisions/log.md`.
