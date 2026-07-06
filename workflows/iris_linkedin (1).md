# IRIS — LinkedIn Workflow
## Operational Flow v1

### Trigger
GitHub Actions cron job, Monday–Friday only.
Two daily runs:
- 6:00am CET/BST → morning post draft
- 12:00pm CET/BST → evening post draft

Each run calls POST /api/cron/iris with a payload indicating slot:
{ "slot": "morning" } or { "slot": "evening" }

Route is protected by CRON_SECRET header (same pattern as existing cron routes).

---

### Topic Selection (automatic, no input from Archie)
IRIS selects the topic in this priority order:

1. CASSANDRA scan — check today's morning brief for postable moments
   (major IPO, rate decision, big earnings, regulatory change, currency move).
   If a strong signal exists, use it. Timeliness is the priority.

2. Topic bank fallback — if nothing breaking, select from the standing topic
   bank in context/iris.md. Rotate across pillars to maintain 50/30/20 balance.
   Avoid repeating a topic used in the last 7 days (check iris_posts table).

3. Pillar balance check — if last 3 posts were all Pillar 1, pull from
   Pillar 2 or 3 instead regardless of what's breaking.

---

### Draft Generation
IRIS generates:
1. The post copy — hook (3 lines) + body + closing question or poll
2. A suggested image prompt — descriptive, topical, non-generic
3. The image itself — gpt-image-1, generated every time
4. Suggested format — text, poll, carousel suggestion
5. Suggested posting time — morning slot: 8–9am / evening slot: 4–6pm

Voice preferences from voice_preferences table are injected into the
system prompt on every generation call.

---

### Delivery
Draft delivered simultaneously to:
- Slack — formatted message with post copy, image attached, format suggestion,
  posting time suggestion, and refinement prompt at the bottom:
  "Reply to refine, or say 'done' when ready."
- Dashboard — IRIS panel updated with latest draft, image, and status

Slack message format:
---
📝 *IRIS — Morning Draft*
*Topic:* [topic]
*Format:* [suggested format]
*Post time:* [suggested window]

[post copy]

[image attached]

_Reply to refine, or say 'done' when ready._
---

---

### Refinement Loop
Archie replies in Slack thread with natural language feedback:
- "make it punchier"
- "change the closing question"
- "less formal"
- "try a poll format instead"
- "regenerate the image"
- "done"

IRIS handles each:
- Any text feedback → redraft post copy, reattach same image unless image
  feedback given
- "regenerate the image" → new gpt-image-1 call only, same copy
- "done" → IRIS confirms, logs any voice preference signals learned from
  the refinement exchange, updates iris_posts table with status: 'approved'

No cap on refinement rounds. Loop continues until Archie says "done".

---

### Voice Memory Logging
After every "done", IRIS reviews the refinement exchange and extracts
preference signals. Examples:
- Archie said "too formal" → logs preference: tone = more casual
- Archie said "I'd never say it like that" → logs specific phrasing to avoid
- Archie approved without changes → logs: this style worked, note the format/tone
- Archie said "good hook, change the ending" → logs: hook style approved

Stored in voice_preferences table:
{ preference_type, value, source: 'iris_refinement', created_at }

IRIS injects all stored preferences into system prompt on next generation.
Every 2 weeks IRIS surfaces a summary in Slack:
"Here's what I've learned about your voice — anything to add or correct?"

---

### Post History
Every delivered draft logged to iris_posts table:
{ id, slot, pillar, topic, copy, image_url, status, created_at }
Status values: 'draft' → 'approved' → (Archie posts manually)

Used for:
- Topic rotation (avoid repeating last 7 days)
- Pillar balance tracking
- Dashboard display

---

### Database Tables Required
iris_posts:
  id TEXT PRIMARY KEY
  slot TEXT (morning/evening)
  pillar INTEGER (1/2/3)
  topic TEXT
  copy TEXT
  image_url TEXT
  status TEXT DEFAULT 'draft'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP

voice_preferences:
  id TEXT PRIMARY KEY
  preference_type TEXT
  value TEXT
  source TEXT
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP

---

### Hard Rules
- Never auto-post to LinkedIn
- Never generate financial advice, price targets, or projections
- Always generate an image with every draft
- Cron route protected by CRON_SECRET
- All dashboard routes behind requireDashboardAuth()
- Additive only — never touch existing agents, Slack handlers, or cron jobs
