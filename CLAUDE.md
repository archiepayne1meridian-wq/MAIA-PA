# MAIA — Claude Code Operating Manual
*Updated: October 2026*

---

## What MAIA Is

MAIA is a personal AI command centre for Archie Payne, BDA at deVere and Partners Switzerland. It is a Next.js app running on Railway with a SQLite database. It is **not** connected to Meridian, JARVIS, or any other system. It is completely standalone.

**The one goal:** Help Archie book more meetings with Stephen Smith by making him better at cold calling, content, and prospecting.

---

## Who Archie Is

- **Role:** Business Development Associate (BDA), deVere and Partners Switzerland
- **Works for:** Stephen Smith — Senior Wealth Manager
- **Job:** Book qualified first meetings with Stephen. Everything else serves this.
- **USP:** Cross-border financial planning for internationally mobile professionals in Switzerland
- **Ideal client:** British expats in Switzerland with financial ties back home
- **CRM:** Core CRM — maximum 750 prospects at any time
- **NOT a qualified financial adviser** — never give advice, always create discussion

---

## The Golden Rule

**Nothing goes out without Archie's explicit approval.** Agents propose. Archie decides.

---

## The Stack

- **Framework:** Next.js 15, App Router, TypeScript
- **Database:** SQLite via Drizzle ORM — single file at `/data/maia.db` on Railway volume
- **AI:** Anthropic API
  - Content generation (LinkedIn): `claude-sonnet-4-6` — **never Haiku for content**
  - Everything else default: `claude-haiku-4-5-20251001`
  - Heavy analysis (ORACLE, APOLLO): `claude-sonnet-4-6`
- **Voice:** ElevenLabs — Ava voice (`wCizWKvnaS3LOIUwHo98`), model `eleven_flash_v2_5`
- **Cron:** GitHub Actions → curl POST to Railway, Bearer auth via `MAIA_API_KEY`
- **Auth:** `requireDashboardAuth()` on all dashboard routes — simple session-based, no login gate currently (open dashboard)
- **Styling:** CSS Modules (`dashboard.module.css`) with CSS custom properties

---

## Colour Palette (NEW — Orange/Brown, NOT Navy/Blue)

```css
--base: #0D0906;
--surface: #131009;
--raised: #1A1410;
--border: #2A1F14;
--accent: #E8721C;          /* burnt orange — primary accent */
--accent-dim: rgba(232,114,28,0.12);
--accent-mid: rgba(232,114,28,0.25);
--online: #F59E0B;           /* amber — secondary accent */
--idle: #4A3728;
--alert: #DC2626;
--text: #F5F0EB;
--text-mid: #A89880;
--text-dim: #5C4A38;
```

**The old navy/blue palette is replaced.** If you see `#1a3a5c` or similar navy values anywhere — replace with the orange palette above.

---

## Dashboard Layout (NEW — Three Column Chat Interface)

The dashboard uses a three-column layout:

```
[Left 260px] [Centre flex] [Right 290px]
```

**Left column:** Agent rail — WhatsApp-style list of agents. Each row shows status dot, name, role, last message preview. Click to load that agent's conversation in the centre.

**Centre column:** Conversation thread per agent. Each agent has its own persistent chat thread. Messages use card types: text, draft, news_card, crm_notes, flashcard, morning_brief.

**Right column:** Context panel — swaps completely when active agent changes. Hub shows reminders + goals. Each agent shows its own relevant data.

**This replaces the old top nav rail + full page agent approach.**

---

## The Agents (Current Names)

Internal code names (file names, routes, DB tables) stay unchanged. Display names in the nav rail are updated.

| Display Name | Internal Code | Purpose |
|---|---|---|
| MAIA | maia | Orchestrator, morning brief, chat commands |
| News | cassandra | Financial intelligence, call angles |
| Calls | apollo | Transcription, CRM notes, coaching |
| Practice | diana | Full cold call roleplay drills |
| LinkedIn | iris | Post generation, conversational interface |
| Instagram & Facebook | social | Autonomous social posting, approvals |
| Outreach | mercury | Email sequences, 6 touch point funnel |
| Study | athena | CII R01/R06 + products, flashcards |
| Prospects | nexus | List management, Sales Nav → CRM |
| Pipeline | pipeline | Meeting pipeline with Steven |

**Removed/parked:** ATLAS (visualizers — parked, low priority), HERA (removed), VICTORIA (hidden), DEMETER (hidden), ORACLE (pension estimator — built but lower priority)

---

## Agent Details

### News (CASSANDRA)
**Purpose:** Financial intelligence Archie can use on calls today.
**Model:** Haiku for brief generation
**Output format:**
- 📞 Call Angles — who to target today and why, one sentence
- ✍️ Post Ideas — LinkedIn topic if genuinely relevant
- 📚 Knowledge Updates — regulation or market change worth knowing
**Rule:** If nothing relevant → "Nothing significant today." Never pad.

**Include:**
- UK pension/tax changes, IHT April 2027
- Swiss company restructuring, mergers, job cuts (Novartis, Roche, UBS, Nestlé, ABB, Trafigura, Philip Morris)
- Broad market moves — crashes, corrections, bond market moves
- SNB rate decisions, Swiss regulation
- FCA new rules only (NOT hearings, fines, enforcement actions)

**Exclude:**
- Crypto, bitcoin, blockchain, NFTs
- Individual stock picks, analyst ratings
- FCA enforcement/hearings
- Generic market noise without expat relevance

### Calls (APOLLO)
**Purpose:** Transcribe real calls, give coaching, generate CRM notes.
**Model:** Sonnet for analysis
**Per call output:**
- Editable transcript (click to edit, Enter to split turns, click label to swap speaker)
- Filler word count (you know, sort of, basically, kind of, obviously)
- Call stage where it died (opener/fact find/enlarge/disturb/close/completed)
- One coaching insight — specific and actionable
- CRM notes (if meeting booked) — concise, copy-paste ready for Core CRM
- Confirmation email draft (if meeting booked) — references something specific from the call
**Important:** CRM notes and email only fire when meeting is booked. Coaching fires on every call.

### Practice (DIANA)
**Purpose:** Full cold call roleplay before real calls and to test new angles.
**Model:** Haiku for prospect responses, max_tokens: 120
**Prospect behaviour:** Vague, resistant, one-sentence answers, never volunteers information, interrupts opener with "Who is this?" or "What's this about?"
**Connected to:** APOLLO coaching insight loads as today's focus. CASSANDRA angle reflected in prospect's situation.
**Every session is a full call** — opener through to close attempt. Not just one stage.

### LinkedIn (IRIS)
**Purpose:** Daily LinkedIn posts in Archie's voice. Conversational interface.
**Model:** `claude-sonnet-4-6` — NEVER Haiku for content generation
**Six post types:**
1. Personal story with financial twist (sports only if connection is genuine and immediate)
2. News angle with two sides — never take sides, always ask opinion
3. Fact drop — always attribute source, never invent statistics
4. Tool/guide offer — only when guide actually exists
5. Expat reality — facts that make people think, not advice
6. The reframe — analogy that makes people see something differently without getting technical

**Voice rules:**
- Direct, punchy, conversational — never corporate
- Never give advice — always create discussion
- Never say "you should", "I recommend", "you need to"
- Ends with a question or call to action
- Sports maximum one in ten posts, only if financial connection is obvious

**Format:**
- Lines 1-3: hook — short, punchy, makes them stop scrolling
- Body: 150-300 words, line breaks, no walls of text
- End: one question or CTA

**Morning draft:** Cron at 7am UTC auto-generates a draft and drops it into the LinkedIn conversation thread.

**The accountant vs adviser reframe (example of good TYPE 6):**
"I hear this all the time — 'my accountant sorts out my tax.'
And they do. They're brilliant at it.
But here's the difference nobody talks about:
Your accountant looks at what happened and minimises the damage.
A financial planner looks at what's coming and builds a structure so the damage never happens.
One fixes the score at full time. The other changes the game plan before kick off.
Which would you rather have?"

### Outreach (MERCURY)
**Purpose:** 6 touch point email sequence per lead. Never let a lead go cold.
**Email funnel:**
- Day 0: Intro — who we are, cross-border USP, soft
- Day 3: Free guide or tool relevant to their situation
- Day 7: What Stephen does — story/case study angle
- Day 14: News angle tied to their situation
- Day 21: Social proof — deVere results, reputation
- Day 28: Final honest touch — direct, no pressure
**Reminders drop automatically.** Drafts generated when due. Archie approves each one.

### Study (ATHENA)
**Purpose:** CII qualification and product knowledge.
**Tracks:** R01 (Financial Services, Regulation & Ethics), R06 (Financial Planning Practice), deVere Products
**181 CII flashcards seeded to production.** Spaced repetition via SM2 algorithm.
**Connected to:** APOLLO flags product gaps → more cards on that topic.

### Prospects (NEXUS)
**Purpose:** Track every prospect. Manage the 750-person CRM cap.
**Interface:** Excel-style data grid — NOT a chat interface. Paste Sales Nav data, it populates the table, copy to CRM.
**Tags:** SALES NAV: / DATA MINE: / WASH RESULTS: / REWASH:
**Current state:** 332 prospects in the Excel file. Google Sheets integration pending (OAuth setup needed).
**Colour coding:** Green/Red/Do Not Contact auto-highlights on wash result entry.

### Pipeline
**Purpose:** Meeting pipeline shared with Steven.
**Interface:** Chat — notified automatically when meeting booked via APOLLO. Always confirms before writing a row.
**Rule:** Never auto-update without Archie explicitly confirming. His boss sees this.

---

## Key Database Tables

```
apollo_calls          — call transcripts, CRM notes, coaching insights
diana_sessions        — practice call sessions
hermes_scenarios      — 15 call scenarios (11 new + 4 legacy)
iris_posts            — LinkedIn drafts and approved posts
iris_voice_learnings  — what IRIS has learned about Archie's voice
maia_preferences      — 20+ confirmed preferences, applied to all agents
maia_preference_proposals — pattern-detected preference suggestions
muse_entries          — knowledge base entries (Tier 1 AI-readable, Tier 2 server-only)
muse_templates        — 22 email and LinkedIn templates
muse_cases            — prospect case files (anonymised)
muse_goals            — Archie's short and long term goals
maia_conversations    — persistent chat threads per agent
nexus_prospects       — prospect tracking (if moved from Excel to DB)
oracle_analyses       — pension estimates from LinkedIn work history
study_cards           — CII and product flashcards
maia_preferences      — preferences applied to every agent
```

---

## Preferences System

Every agent reads from `maia_preferences` before generating any content. This is how preferences persist without code changes.

```typescript
// In every agent's generation function:
const prefs = await getPreferences('cassandra') // or 'iris', 'diana', etc.
const prefText = formatPreferencesForPrompt(prefs)
// prefText injected at top of system prompt
```

**Key confirmed preferences:**
- Never include crypto, bitcoin, blockchain
- Never include FCA enforcement/hearings — new rules only
- Never give advice — always create discussion
- Never name a product on a call
- First name + last initial only for client names
- Tier 2 MUSE entries never sent to AI

To add a new preference: go to `/dashboard/preferences` or tell MAIA in chat.

---

## Shared Utilities

`src/lib/format.ts` — single source of truth for formatting functions:
- `formatGBP(amount)` — UK currency
- `formatCHF(amount)` — Swiss currency  
- `fmtPct(value, decimals)` — percentage with + sign prefix
- `extractJson(text)` — parse JSON from Claude responses with fallbacks

**Do not duplicate these in individual agent files.**

---

## File Structure

```
src/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx              — hub/home, morning brief
│   │   ├── components/
│   │   │   ├── AgentRailNew.tsx  — new three-column left rail
│   │   │   └── ...
│   │   ├── diana/                — Practice agent
│   │   ├── apollo/               — Calls agent
│   │   ├── cassandra/            — News agent
│   │   ├── iris/                 — LinkedIn agent
│   │   ├── hermes/               — Script/scenario agent
│   │   ├── muse/                 — Knowledge base
│   │   ├── athena/               — Study agent
│   │   ├── oracle/               — Pension estimator
│   │   └── preferences/          — Preferences management
│   └── api/
│       └── dashboard/            — All agent API routes
├── db/
│   ├── schema.ts                 — Drizzle schema, all tables
│   └── migrations/               — Migration files
├── lib/
│   ├── format.ts                 — Shared formatting utilities
│   ├── preferences.ts            — Preferences reader/writer
│   ├── cassandra.ts              — News generation
│   ├── iris.ts                   — LinkedIn content generation
│   ├── diana.ts                  — Practice call generation
│   └── apollo.ts                 — Call analysis
context/
├── cassandra.md                  — News sources and config (live, read at runtime)
├── diana.md                      — Practice call config (live, read at runtime)
├── athena.md                     — Study config (live, read at runtime)
├── iris-voice.md                 — LinkedIn voice profile (live, read at runtime)
└── victoria.md                   — Live (Slack handler reads this)
scripts/
└── seed-*.ts                     — One-time seed scripts (already run, kept for reference)
```

---

## What Has Been Removed / Changed

**Removed from old CLAUDE.md — no longer relevant:**
- Meridian/JARVIS references — MAIA is completely standalone, always was
- LUNA — never built, not needed
- JUNO — never built, not needed
- ARTEMIS/FLORA — shelved
- HERA — removed from nav, dead code deleted
- Slack-based approval flow — removed, dashboard-only now
- Old navy/blue design system — replaced with orange/brown
- Agent mythology names in nav rail — replaced with plain English names
- Old cron flows for IRIS (6am/12pm Slack) — retired

**Still live but hidden (intentionally):**
- DEMETER — portfolio tracker, hidden from nav but Slack handler still works
- VICTORIA — KPI tracker, hidden from nav but backend live

---

## Deployment

- **Platform:** Railway
- **URL:** `maia-pa-production.up.railway.app`
- **DB path:** `/data/maia.db`
- **Deploy:** push to `main` → Railway auto-deploys
- **Stuck deploy fix:** `git commit --allow-empty -m "fix: trigger redeploy" && git push`
- **Seed scripts:** Deploy via temporary admin route (`/api/admin/seed-*`), protected by `MAIA_API_KEY`, delete route after use

---

## Secrets

```
ANTHROPIC_API_KEY
MAIA_API_KEY             # Bearer auth for all cron routes and admin routes
ELEVENLABS_API_KEY
MAIA_VOICE_ID            # Ava: wCizWKvnaS3LOIUwHo98
SIMON_VOICE_ID           # Simon (DIANA): Ln7FbpLNuLn2OdYq2w7S
DATABASE_URL             # /data/maia.db
NEXT_PUBLIC_BASE_URL     # https://maia-pa-production.up.railway.app
```

---

## Operating Model (WAT Framework)

MAIA uses **WAT — Workflows, Agents, Tools** so probabilistic AI handles reasoning while deterministic code handles execution.

- **Workflows** — plain-language SOPs defining objective, inputs, which tools to call, expected output, edge cases
- **Agents** (Claude Code) — read the workflow, sequence the tools, handle errors, ask when genuinely ambiguous. Coordinate; do not execute directly.
- **Tools** (`tools/` + Next.js API routes) — deterministic work: model calls, DB reads/writes, cron jobs, ElevenLabs TTS. Consistent, testable, fast.

**Why this matters:** Five chained steps at 90% accuracy each only succeed ~59% of the time. Offloading execution to tested scripts is what keeps MAIA reliable.

**Rules:**
1. Look for an existing tool first — check `tools/` and existing API routes before building anything new
2. Read the full error before fixing — never guess at failures
3. If a fix uses paid API calls, check before re-running
4. Do not create or overwrite a workflow without asking
5. Run `npm run build` (not just `tsc --noEmit`) before every push — Railway build failures catch things tsc misses

---

## Secrets & API Keys

**Every credential lives in `.env` only. This is a hard rule with no exceptions.**

- **Never hardcode** a key, token, secret, or URL-with-credentials in source files, workflows, or tools
- **Never commit `.env`** — it is gitignored. Commit only `.env.example` with key names and empty values
- **Never log, print, or echo a secret** — not in console output, error traces, dashboard data, or anywhere else
- **Never send a raw secret to any AI model** or paste one into chat
- **Fail loudly on a missing key** — if an env var is absent, stop and throw an error. Do not invent fallbacks or dummy values
- **If a key is ever exposed, rotate it immediately** at the provider and update `.env`

**Keys MAIA expects:**

```
ANTHROPIC_API_KEY          # all Claude inference
MAIA_API_KEY               # Bearer auth for Railway routes + GitHub Actions cron
ELEVENLABS_API_KEY         # voice TTS
MAIA_VOICE_ID              # Ava voice: wCizWKvnaS3LOIUwHo98
SIMON_VOICE_ID             # Simon voice (DIANA): Ln7FbpLNuLn2OdYq2w7S
DATABASE_URL               # SQLite path: /data/maia.db on Railway volume
NEXT_PUBLIC_BASE_URL       # https://maia-pa-production.up.railway.app
CRON_SECRET                # protects cron routes (use MAIA_API_KEY pattern)
```

**Coming when OAuth is set up:**
```
GOOGLE_CLIENT_ID           # Google Sheets (Prospects + Pipeline)
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
```

---

## Hard Rules

1. **Never hardcode secrets** — always `process.env.X`
2. **Never use Haiku for LinkedIn content generation** — always Sonnet
3. **Never give financial advice** in any agent output
4. **Never store client full surnames** — first name + last initial only
5. **Never send Tier 2 MUSE entries to any AI model**
6. **Never auto-update Pipeline** without explicit confirmation from Archie
7. **Always read preferences** before generating agent content
8. **Use `src/lib/format.ts`** for all formatting — never duplicate
9. **Run `npm run build` before pushing** — not just `tsc --noEmit`
10. **Seed scripts** go via temporary admin routes, deleted after use

---

## Current Build Status

| Feature | Status |
|---|---|
| Dashboard new layout (3-col, orange) | ⏳ Building |
| LinkedIn agent (Sonnet, 6 post types, chat) | ✅ Live |
| News agent (sharper filter, angle output) | ✅ Live |
| Calls agent (CRM notes, coaching, filler words) | ✅ Live |
| Practice agent (realistic resistance, CASSANDRA angle) | ✅ Live |
| HERMES scenario bank (15 scenarios) | ✅ Live |
| MUSE knowledge graph (privacy tiers, file attachments) | ✅ Live |
| Preferences layer (20 preferences, all agents) | ✅ Live |
| ATHENA CII R01+R06 (181 flashcards) | ✅ Live |
| ORACLE pension estimator | ✅ Live |
| MAIA orchestrator (chat bar, morning brief, intent detection) | ✅ Live |
| Codebase cleanup (dead code removed) | ✅ Done |
| Instagram & Facebook agent | ⬜ Next |
| Outreach email sequences | ⬜ |
| Google Sheets (Prospects + Pipeline) | ⬜ Needs OAuth setup |
| Hermes Agent Mac Mini + WhatsApp | ⬜ Weekend |
| MERCURY templates | ⬜ Last |
