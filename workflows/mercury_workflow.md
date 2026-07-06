# MERCURY — Message Drafting Workflow
## Operational Flow v1.0

### Trigger — Slack
Natural language message starting with "Mercury," or "mercury,"
Detected by `detectMercuryIntent()` in the Slack events route.
Inserted before CASSANDRA block (after `handleGoAheadOrCancel`).

Intent shape:
{ type: 'draft_message', medium: 'email'|'whatsapp'|'imessage', context: string, incoming?: string }

Medium detection — scan the message for:
- "email" → medium: 'email'
- "whatsapp" / "whats app" → medium: 'whatsapp'
- "imessage" / "i message" / "text" → medium: 'imessage'
- No medium found → default to 'email', note assumption in reply

---

### Trigger — Dashboard
POST /api/dashboard/mercury/draft
Body: { medium, context, incomingMessage? }
Behind requireDashboardAuth() — 401 without session.

---

### Draft Generation Flow

1. Load voice_preferences from DB — inject all into system prompt
2. Build system prompt:
   - Archie's role and context (trainee financial adviser, deVere Group,
     relocating to Malta, serving expat clients)
   - Medium guidelines (length, tone, format for email/WhatsApp/iMessage)
   - Voice rules (no filler phrases, no invented facts, professional but warm)
   - All stored voice preferences injected here
3. Build user message:
   - Medium: [email/whatsapp/imessage]
   - Context: [Archie's context]
   - Incoming message (if provided): [pasted message]
   - Instruction: draft a [medium] based on this context
4. Call Claude Haiku — single call, max 600 tokens
5. For email: also return a suggested subject line
6. Save draft to mercury_drafts with status: 'draft'
7. Deliver to Slack or dashboard

---

### Slack Delivery Format

Email:
---
✉️ *MERCURY — Email Draft*
*Subject:* [suggested subject line]

[draft body]

_Reply to refine, or say "done" when ready._
---

WhatsApp / iMessage:
---
💬 *MERCURY — WhatsApp Draft*

[draft body]

_Reply to refine, or say "done" when ready._
---

---

### Refinement Loop — Slack
Archie replies in thread with natural language feedback.
MERCURY redrafts with feedback applied, redelivers in thread.
No cap on rounds. Loop until "done".

On "done":
- Extract voice preference signals from refinement exchange
- Save to voice_preferences (source: 'mercury_refinement')
- Update mercury_drafts status to 'approved'
- Confirm in Slack: "Saved. Copy and send whenever you're ready."

---

### Refinement Loop — Dashboard
Archie types feedback in refine input box, clicks regenerate.
Same handler underneath — redraft with feedback applied.
Done button triggers same preference logging and status update.
Draft history panel updates with approved draft.

---

### Voice Memory Logging
Shared voice_preferences table with IRIS.
Source: 'mercury_refinement'
Preferences carry across IRIS and MERCURY — tone learned in one
applies to the other.

Signals to extract after "done":
- Tone adjustments ("too formal", "more casual", "more direct")
- Phrasing preferences ("I'd never say X", "always use Y instead")
- Length preferences ("too long", "keep it under 3 paragraphs")
- Structure preferences ("lead with the ask", "sign off with X")
- Positive signals ("good — this tone works", no changes made)

---

### Dashboard Routes
GET  /api/dashboard/mercury          → last 7 days mercury_drafts, requireDashboardAuth()
POST /api/dashboard/mercury/draft    → generate draft, requireDashboardAuth()
POST /api/dashboard/mercury/refine   → refine draft, body: { draftId, feedback }, requireDashboardAuth()
POST /api/dashboard/mercury/done     → approve draft, log preferences, requireDashboardAuth()

---

### Files to Create
| File | Purpose |
|---|---|
| tools/mercury.ts | Pure functions: saveDraft, updateDraftStatus, getRecentDrafts |
| src/lib/mercury.ts | generateDraft(medium, context, incoming?, feedback?) — Haiku call |
| src/lib/mercury-handler.ts | detectMercuryIntent, handleMercuryDraft, handleMercuryThread |
| src/app/api/dashboard/mercury/route.ts | GET recent drafts |
| src/app/api/dashboard/mercury/draft/route.ts | POST generate |
| src/app/api/dashboard/mercury/refine/route.ts | POST refine |
| src/app/api/dashboard/mercury/done/route.ts | POST approve + log prefs |
| src/app/dashboard/mercury/page.tsx | Dashboard page — swap placeholder for MercuryWorkspace |
| src/components/MercuryWorkspace.tsx | Full interactive workspace component |

### Files to Modify
| File | Change |
|---|---|
| src/db/schema.ts | Add mercury_drafts table, additive only |
| src/app/api/slack/events/route.ts | Import mercury handler, insert routing block before CASSANDRA |
| dashboard.module.css | Add mercury* CSS section, same token set as DIANA/ATHENA/IRIS |

---

### Build Order (stub-first discipline)

**Step 1 — free (no Claude calls)**
- DB migration: mercury_drafts table
- tools/mercury.ts — all pure functions
- src/lib/mercury.ts — generateDraft stubs (throws on call)
- mercury-handler.ts — intent detection + handler shell
- All 4 dashboard routes — stubbed responses
- MercuryWorkspace.tsx — UI wired to stub routes
- Slack events route — routing block inserted
- Verify: Slack intent detected, stub draft delivered to Slack + dashboard
- HARD STOP — show stub round-trip before any Claude call

**Step 2 — wire real Claude/Haiku call**
- Remove stub throw from generateDraft
- Wire real Haiku call with voice_preferences injection
- Verify: real draft in Slack, real draft on dashboard, refinement loop works,
  "done" logs preferences, draft saved as approved

---

### Hard Rules
- Additive only — never touch existing agent handlers or cron jobs
- requireDashboardAuth() on all dashboard routes, 401 in dev
- Slack route inserted before CASSANDRA block, after handleGoAheadOrCancel
- Never auto-send any message
- Never invent facts or commitments
- All actions logged to activity table
- Secrets in .env only
