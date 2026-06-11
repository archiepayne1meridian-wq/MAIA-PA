# MAIA

Private AI command centre for a trainee financial adviser.
Built on Next.js + Drizzle ORM + SQLite, hosted on Railway, wired to Slack.

---

## Prerequisites

- Node 20+
- A **MAIA-specific** Slack app (not the Meridian/JARVIS bot)
- A Railway account with a new project and attached volume

---

## Local Setup

```bash
# 1. Clone and enter the repo
git clone <your-maia-repo> maia && cd maia

# 2. Create your env file
cp .env.example .env
# Fill in every required value — see .env.example comments

# 3. Install dependencies
npm install

# 4. Generate and apply the DB schema
npx drizzle-kit generate
npx drizzle-kit migrate

# 5. Start the dev server
npm run dev
# → http://localhost:3000
```

### Verify the spine is working

```bash
# Health check
curl http://localhost:3000/api/health
# → {"ok":true,"ts":"..."}
```

Then send a message in your MAIA Slack channel. You should get a Claude reply in the thread, and two rows in the `activity` table (one `message_received`, one updated to `success`).

---

## Slack App Configuration

Create a new Slack app at https://api.slack.com/apps (do **not** reuse a Meridian app).

**Bot Token Scopes** (OAuth & Permissions):
- `chat:write`
- `channels:history`
- `channels:read`

**Event Subscriptions** → Enable Events:
- Request URL: `https://<your-railway-url>/api/slack/events`
- Subscribe to bot events: `message.channels`

**Interactivity & Shortcuts** → Enable:
- Request URL: `https://<your-railway-url>/api/slack/interactive`

**Install the app** to your workspace, invite the bot to your MAIA channel:
```
/invite @MAIA
```

---

## Deploy to Railway

1. Create a **new Railway project** — not a service under an existing project.
2. Connect your GitHub repo.
3. Add a **Volume** and mount it at `/data`.
4. Set `DATABASE_URL=/data/maia.db` — **this must point at the volume mount path**.
   If it points at the ephemeral filesystem, the database resets on every redeploy.
5. Add all other env vars from `.env.example`.
6. Deploy. Health check: `GET /api/health`.

### GitHub Actions cron

Add these to your GitHub repo:
- **Variable** `MAIA_URL` = your Railway URL (e.g. `https://maia.up.railway.app`)

The `.github/workflows/cron.yml` pings `/api/health` on weekday mornings.

---

## Isolation Checklist

Run through this before going live. If any item points at Meridian/JARVIS, stop and fix it.

- [ ] `git remote -v` shows only a MAIA-specific GitHub repo
- [ ] Railway project is a new standalone project, not a service under Meridian
- [ ] Railway volume is dedicated to MAIA (separate from any Meridian volume)
- [ ] Slack app, bot token, signing secret, and channel are all MAIA-only
- [ ] All `.env` values are fresh keys — zero overlap with Meridian's credentials

---

## Project Structure

```
maia/
├── CLAUDE.md                  # Operating manual — read before building
├── connections.md             # Registry of every external system
├── decisions/log.md           # Append-only audit trail
├── context/                   # User context, role, policies
├── workflows/                 # Markdown SOPs (one per agent task)
├── tools/                     # Deterministic scripts
├── src/
│   ├── app/api/
│   │   ├── health/            # GET /api/health
│   │   ├── slack/events/      # POST — inbound Slack messages (spine)
│   │   └── slack/interactive/ # POST — approval button callbacks
│   ├── db/
│   │   ├── schema.ts          # Drizzle tables: approvals, activity
│   │   └── index.ts           # DB singleton
│   └── lib/
│       ├── env.ts             # Env validation (fails loud on missing var)
│       ├── slack.ts           # HMAC verify, postMessage, updateMessage
│       └── claude.ts          # Anthropic SDK wrapper
├── .github/workflows/cron.yml # Weekday health ping
└── .tmp/                      # Disposable intermediates (gitignored)
```

---

## Compliance Notes

- **No agent gives financial advice to a real person.** MAIA supports the adviser only.
- **Tier-3 agents (IRIS, LUNA)** are shelved until deVere compliance sign-off. Do not point them at real client data.
- **DEMETER** is informational only — no trade signals or automation.
- Regulator: **MFSA** (Malta). Data law: **EU GDPR** (IDPC).
- All compliance-relevant decisions are logged to `decisions/log.md`.
