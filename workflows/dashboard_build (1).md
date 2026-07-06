# Workflow: MAIA Dashboard — Front-End Build

**Surface:** the web command centre (everything so far has been Slack). **Phase:** 2 (after all Tier-1 agents).
**Visual spec (LOCKED):** `maia_dashboard.html` (command centre) + `demeter_terminal.html` (terminal).
**Build style:** phased — each phase renders in the browser and reads real data before the next begins.

---

## Objective

Turn the six working agents into a visual command centre. Two surfaces:
1. **MAIA command centre** — the home screen: voice orb, agent widget rail, tasks, calendar (per `maia_dashboard.html`).
2. **DEMETER terminal** — the Bloomberg-style research surface opened from DEMETER's widget (per `demeter_terminal.html`), powered by OpenBB.

---

## Visual Contract (non-negotiable)

- **Match the two mockups exactly** — layout, the clean-fintech blue palette, fonts (Space Grotesk / Inter / JetBrains Mono), the orb, the entry-line chart. The mockups are the source of truth for *appearance*.
- Data sources supply **content only** — the look does not change. (OpenBB feeds numbers; lightweight-charts draws the chart in our theme.)
- Follow the frontend-design skill for component structure; don't drift toward a generic admin-template look.

---

## Access & Safety

- **Private. Must be auth-protected** — this shows holdings, P&L, KPIs. It must NOT be public on Railway.
  Single-user auth (bcrypt hash + HMAC session cookie) before any data renders. [DONE in D0.]
- **Read-mostly, acting only where safe.** The dashboard *displays* agent data and — in the hub model —
  lets you *do the task* for the safe internal agents (DIANA roleplay, ATHENA drills) by reusing their
  EXISTING Slack handlers via web routes. It introduces **no NEW outbound action path**: DIANA/ATHENA only
  touch your own data, and anything outbound (IRIS posts, etc.) still goes through the existing approval
  gates in Slack. The Golden Rule holds — the web UI adds no new way for MAIA to act on the world.

---

## Architecture

- Next.js front-end **in the same MAIA repo** (additive — does not touch the Slack agents or their endpoints).
- Reads the existing DB tables / API routes. New read-only API routes as needed per panel.
- **OpenBB** runs as its **own Railway service** (separate from MAIA) for the terminal; `OPENBB_URL`/`OPENBB_TOKEN` in MAIA env.
- Charts: TradingView **lightweight-charts** library (themed to the mockup), not the embeddable widget — so the avg-cost entry line can be drawn.
- Don't break the agents: the web UI is a read layer over data they already write.

---

## Data Wiring Map (which table feeds which widget)

| Surface / widget | Reads from |
|---|---|
| Agent status rail + "Today" feed | `activity` (each agent's logged actions) |
| ATHENA panel | `study_cards`, `study_reviews`, `quiz_sessions`, `mcq_attempts` (progress, due, accuracy) |
| DEMETER widget → **terminal / My Book** | `holdings`, `portfolio_snapshots` + live quotes (Twelve Data/Yahoo now, OpenBB in D3) |
| CASSANDRA panel | `research_briefs` (latest brief) |
| HERA panel | `reflections`, `weekly_reviews` |
| DIANA panel | `diana_sessions` (practice count, last feedback) |
| VICTORIA panel | `kpi_logs`, `kpi_weekly` (weekly bars, trend lines, target progress) |

---

## Phases (each is provable before the next)

> **STATUS: D0–D3 DONE.** The dashboard is an auth-protected command centre with all six agent panels
> and a full live DEMETER terminal. What remains is the **hub redesign (D4)** — turning the panels into
> a navigable hub of full agent pages, with DIANA + ATHENA as interactive workspaces.

### D0 — Shell + auth ✅ DONE
Next.js shell, design tokens/fonts from the mockup, command-centre layout, single-user auth (bcrypt +
HMAC cookie, middleware excludes /api/*). Slack/cron endpoints unaffected.

### D1 — Command centre, live data ✅ DONE
Agent rail live status from `activity`, "today" feed, tasks/ring from real tables; unbuilt agents greyed;
read-only `/api/dashboard/*` routes session-protected (401 in dev too via shared `requireDashboardAuth()`).

### D2 — Agent panels ✅ DONE
Six panels on real data (recharts for VICTORIA/ATHENA). HERA emits no sentiment. DIANA feedback note honest
("delivered to Slack; DB storage later").

### D3 — DEMETER terminal ✅ DONE (a/b/c)
- **D3a:** OpenBB stood up as its own Railway service, token-protected; yfinance serves all six holdings +
  FX + history + news (incl. LSE ETFs VWRP.L/VDPG.L). FMP kept only as FX cross-check (equities paywalled, unneeded).
- **D3b:** terminal page on live data — My Book, lightweight-charts, **avg-cost entry line** + position badge,
  honest LIVE/PREV CLOSE labelling (data-driven, not clock-driven), news. Read-only, no trade path.
- **D3c:** My Book / Watchlist split; add-ticker search with resolve + dupe/bad-symbol handling (persisted
  `watchlist` table); selectable **1D/1M/3M/1Y/5Y** timeframes (entry line returns to range on 1Y/5Y).
- *Known later-polish:* news route only covers the 6 holdings (watchlist symbols show "no news"); widen later.

---

## D4 — THE HUB REDESIGN (the remaining work)

[DECISION — hub model] The dashboard becomes an **interactive hub**: clicking an agent in the rail goes
**straight to that agent's full PAGE** (no preview/drawer). Slack stays the mobile/quick-access layer.
Agents split into two kinds of page:
- **Interactive workspaces — you DO the task in-dashboard:** **DIANA** (live roleplay chat) and **ATHENA**
  (flashcard/quiz drills). These reuse the agents' EXISTING Slack handlers through new web routes — one
  brain, two front doors. No new agent logic.
- **Read-and-access pages — you SEE/read:** **CASSANDRA** (full brief + refresh), **HERA** (reflections +
  weekly), **VICTORIA** (KPI charts), **DEMETER** (the terminal, already built). These are the D2 panels
  repurposed as full pages.

**This EXTENDS the build — it does not restart it.** D0/D1 (shell, auth, home overview, live routes) are
kept. The D2 panels are repurposed as the four read pages. The terminal is done. Only the **navigation**
changes and **two agents** gain interactive surfaces.

### D4a — Hub navigation shell (mechanical, do FIRST)
- Every agent tile in the rail navigates **straight to `/dashboard/<agent>`** (full page), no drawer.
  (DEMETER already does this — generalise the pattern to all.)
- Repurpose the four D2 panels (CASSANDRA, HERA, VICTORIA + any others) as full **read pages** at their own
  routes, same data, same look, just full-page instead of drawer.
- The home screen stays the **overview glance** (D1) — the one screen across all agents; rail = navigation.
- DIANA + ATHENA get **placeholder full pages** for now (their read view), interactivity added in D4b.
- **Done:** clicking any agent opens its full page; the drawer is gone; home is the overview; nav is clean.

### D4b — DIANA + ATHENA interactive workspaces (new capability, do SECOND)
- **DIANA page:** a live roleplay chat — start/continue/exit a session **in the browser**, reusing the
  existing DIANA handlers (the same stateful `diana_sessions` logic, reference mode + roleplay) via web
  routes. Reference-mode objection buttons + the mock-call chat both work on the page.
- **ATHENA page:** an in-dashboard drill surface — run flashcard reviews + MCQ quizzes in the browser,
  reusing ATHENA's existing handlers (SM2 scheduling, quiz scoring) via web routes.
- Both **reuse existing agent logic** — no rebuilt brains; the web route calls the same functions Slack does.
- Session-protected like every route; still no NEW outbound path (these only touch your own data).
- **Done:** you can actually practise a DIANA call and run an ATHENA quiz from the dashboard.

### D4c — Polish + voice (optional, last)
Voice orb (ElevenLabs TTS + Whisper STT) if wanted — input still routes through existing gates; real-time
refresh; calendar source; final pixel pass vs the mockups.

---

## Build Discipline

- One phase at a time; each renders in the browser **and** reads real data before moving on.
- Additive only — never modify the Slack agents' handlers/endpoints; add read-only routes.
- Secrets from `.env` only; the auth gate is real (not a hardcoded bypass).
- Match the mockups; if something's ambiguous, the mockup wins.
- Log the dashboard build phases in `decisions/log.md`.

---

## Done (overall) =

- Command centre renders, auth-protected, on live agent data.
- Every agent has a panel; VICTORIA's charts and DEMETER's terminal match their mockups.
- Terminal runs on self-hosted OpenBB with the avg-cost entry line.
- No new outbound action paths introduced; Slack agents untouched and still working.
