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
  Single-user auth (a password / simple session gate) before any data renders. Decide this in D0.
- **Read-mostly v1.** The dashboard *displays* agent data. It does NOT create new outbound actions — those
  stay in Slack/voice behind the existing approval gates. This keeps the Golden Rule intact: the web UI adds
  no new way for MAIA to act on the world. (Voice input arrives in D4, still routing through existing gates.)

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

### D0 — Shell + auth (foundation)
Stand up the Next.js front-end: design tokens + fonts from the mockup, the command-centre **layout** (orb,
widget rail, tasks column, calendar column) as components, **single-user auth gate**, deploy to Railway behind
the gate. Stubbed/placeholder data is fine. **Done:** the command-centre layout renders in the browser, matches
the mockup, and is password-protected.

### D1 — Command centre, live data
Wire the shell to real data: agent widget rail shows **live status** from `activity` (last run / what each agent
did), the "Today" feed/progress ring, tasks. Orb states are visual for now. **Done:** the home screen reflects
what your agents actually did today, pulled live.

### D2 — Agent panels (drawers)
Each widget opens its detail panel reading that agent's tables: ATHENA progress, CASSANDRA latest brief, HERA
reflections + weekly, DIANA practice stats, **VICTORIA charts** (kpi_weekly → weekly bars + trend + target
progress — the visual standpoint you wanted). **Done:** every agent has a working panel on real data.

### D3 — DEMETER terminal (the big one)
1. Stand up **OpenBB** as its own Railway service; verify coverage for your tickers incl. the LSE ETFs.
2. Build the terminal to match `demeter_terminal.html`: **lightweight-charts** with the **avg-cost entry line**
   + position badge; **My Book** (live holdings, GBP-converted) ; key-stats strip; news; search; ticker tape; watchlist.
3. Wire selecting any symbol → loads its chart. **Done:** the terminal matches the mockup and runs on live OpenBB data.

### D4 — Polish + voice (optional, last)
Voice orb wiring (ElevenLabs TTS + Whisper STT) if wanted — input still routes through existing agent/approval
gates; real-time refresh; calendar source; final pixel pass vs both mockups. **Done:** orb talks/listens (if in
scope) and the whole thing is pixel-faithful.

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
