# MUSE — Second Brain Workflow
## Operational Flow v1.0

### Trigger — Slack
Natural language message starting with "MUSE," or "muse,"
Detected by `detectMuseIntent()` in the Slack events route.
Inserted before MERCURY block (after `handleGoAheadOrCancel`).

Intent types:
- { type: 'search_sector', sector: string, query: string }
- { type: 'search_all', query: string }
- { type: 'file_entry', content: string, sector?: string }
- { type: 'brain_dump', content: string }
- { type: 'confirm', pendingId: string, decision: 'keep'|'discard' }
- { type: 'status' } — "MUSE, what's pending?" / "MUSE, summary"

---

### Trigger — Dashboard
All dashboard routes behind requireDashboardAuth() — 401 without session.

POST /api/dashboard/muse/search        → { query, sector? }
POST /api/dashboard/muse/file          → { content, sector? }
POST /api/dashboard/muse/braindump     → { content }
POST /api/dashboard/muse/confirm       → { pendingId, decision }
GET  /api/dashboard/muse/entries       → { sector? } — list entries
GET  /api/dashboard/muse/entry/[id]    → full entry with change log + links
GET  /api/dashboard/muse/pending       → pending confirmations queue
GET  /api/dashboard/muse/insights      → proactive surfacing queue

---

### Core Flow — Filing an Entry

**Step 1 — Receive input**
Input arrives via Slack (file/brain_dump intent) or dashboard (file/braindump route).
Raw content passed to `processInput()` in `src/lib/muse.ts`.

**Step 2 — Assess content (Claude/Haiku)**
MUSE analyses the input:
- What is this about?
- Which sector does it belong in?
- What brief depth is appropriate? (simple/medium/detailed)
- Does it duplicate or update an existing entry? (check muse_entries)
- Is it worth filing at all? (low-value check)
- What existing entries does it link to?

Returns: { sector, depth, title, summary, content, links[], isDuplicate, isLowValue, lowValueReason? }

**Step 3 — Handle edge cases**
- Duplicate detected → "This looks similar to [existing entry] filed on [date].
  Update that entry or file as separate?"
- Low value detected → "I'm not sure this adds much because [reason].
  Still want me to file it?"
- Sector unclear → "I'd file this under [sector] — does that feel right,
  or would you prefer [alternative]?"

**Step 4 — Draft brief**
Generate brief at appropriate depth:

Simple:
  # [Title]
  [2-3 sentence summary]
  **Links:** [related entries]
  **Filed:** [date]

Medium:
  # [Title]
  **Summary:** [summary]
  **Key Points:**
  - [point]
  - [point]
  **Links:** [related entries]
  **Source:** [source]
  **Filed:** [date]

Detailed:
  # [Title]
  **Summary:** [summary]
  **[Section headers as appropriate]**
  [detailed content]
  **Key Points:**
  - [point]
  **Links:** [related entries]
  **Source:** [source]
  **Filed:** [date]
  **Change Log:** (empty on first filing)

**Step 5 — Save to muse_pending, deliver confirmation request**

Save to muse_pending with status: 'awaiting'.

Slack delivery:
---
🧠 *MUSE — New Entry*
*Sector:* [sector] | *Depth:* [simple/medium/detailed]

*[Title]*
[summary]

_Key links: [entry titles]_

Reply **keep** to file it, **discard** to drop it, or edit any detail.
---

Dashboard: appears in Pending Confirmations panel.

**Step 6 — Archie confirms**
- "keep" / "yes" / "file it" → move to muse_entries with status: 'active',
  create muse_links rows, confirm in Slack
- "discard" / "no" / "drop it" → update muse_pending status: 'discarded',
  confirm in Slack
- Any other text → treat as edit instruction, redraft and re-present

---

### Core Flow — Search

**Sector search**
Query: { query, sector }
1. Full-text search muse_entries WHERE sector = [sector] AND status = 'active'
2. Rank by relevance (title + content match), surface last_updated first on tie
3. Return top 5 results with title, summary, sector, date_filed, last_updated

**Full database search**
Query: { query }
1. Full-text search across all active muse_entries, all sectors
2. Same ranking logic
3. Return top 8 results with sector label on each

Slack delivery:
---
🔍 *MUSE — Search Results*
*Query:* "[query]" [in Sector / across all sectors]

1. *[Title]* — [Sector] — Updated [date]
   [summary]

2. *[Title]* — [Sector] — Updated [date]
   [summary]

[...]

Reply with a number to see the full entry.
---

---

### Core Flow — Brain Dump

Input arrives as free-form stream of consciousness.
Same as filing flow but MUSE is more aggressive about structuring it:
1. Extract the core insight(s) — there may be more than one
2. If multiple distinct insights detected → split into separate pending entries,
   one per insight: "I found 2 distinct ideas here — filing them separately.
   Confirm each?"
3. Process each through standard filing flow

---

### Auto-Harvest Flow

Runs after each agent completes a significant action.
Triggered by: `checkMuseHarvest(agent, eventType, data)` called fire-and-forget
from each agent handler.

**ATHENA harvest trigger**
After every quiz session saved:
- Query quiz_sessions for this user — count failures by module over last 14 days
- If any module has 3+ failures: generate study brief for that module
- Save to muse_pending, deliver to Slack + dashboard pending queue:
  "I noticed you've scored below 60% on [module] 3 times this week.
  Want me to add a study brief to Training and push extra drills to ATHENA?"

**CASSANDRA harvest trigger**
After each brief saved to research_briefs:
- Scan for significant signals: regulatory change, major market event, new policy
- If signal detected: draft a Markets or Regulations entry
- Save to muse_pending, deliver confirmation request

**DIANA harvest trigger**
After each session exit scored:
- If rubric score < 60% on a specific objection 2+ times: flag to Sales sector
  "You've struggled with [objection] in 2+ DIANA sessions. Want me to add
  an objection handling note to Sales & Prospecting?"

**HERA harvest trigger**
After weekly coaching summary saved:
- Extract recurring themes (3+ weeks same theme)
- Flag to Performance sector for confirmation

**VICTORIA harvest trigger**
After Friday scorecard saved:
- Track KPI trend over 4 weeks
- If consistent underperformance in one area: flag to Performance sector

All harvests → muse_pending, never direct to muse_entries.
Always confirmed before filing.

---

### Update & Version Flow

When new input matches an existing active entry:
1. MUSE detects duplicate/update via title + content similarity check
2. Presents both versions: "This looks like an update to [existing entry]
   filed on [date]. Here's what would change:"
   [diff summary in plain English]
3. Archie confirms update or files as separate entry
4. On update confirmed:
   - Current content → muse_change_log (previous_content saved)
   - New content → muse_entries (last_updated timestamp)
   - Change log entry added: "[date] — [plain English summary of change]"
   - Links reviewed and updated

---

### Cross-Sector Linking

Every new entry: MUSE suggests links to existing entries.
Links have types:
- related — same topic, different angle
- updates — this entry supersedes or modifies another
- contradicts — conflict detected (flag clearly)
- supports — provides evidence or context for another

Links stored in muse_links (bidirectional).
Surfaced in full entry view on dashboard and in Slack results.

---

### Active Intelligence Behaviours

**ATHENA feedback loop**
When MUSE files a Training entry or detects weak spots:
Calls `addCardFromMuse(moduleId, front, back)` in tools/sm2.ts
(or queues it for Archie to confirm adding to ATHENA deck)

**CASSANDRA → IRIS surfacing**
When MUSE files a Markets or Regulations entry:
Checks if IRIS has a post scheduled on this topic.
If not: adds to iris_posts as status: 'suggested' with pillar 1.
"I filed a new Regulations entry on [X] — added it to IRIS topic queue too.
Want IRIS to draft a post on this?"

**Morning insight**
Runs at 7:50am Mon-Fri (after CASSANDRA, before IRIS).
Checks: any new pending confirmations, any pattern alerts, any proactive links
to today's CASSANDRA brief.
Delivers a brief MUSE morning note to Slack if anything worth surfacing.
Silent if nothing significant.

---

### Files to Create
| File | Purpose |
|---|---|
| tools/muse.ts | Pure functions: saveEntry, updateEntry, savePending, updatePending, getEntries, getEntry, getPending, saveChangeLog, saveLink, searchEntries, searchAll |
| src/lib/muse.ts | processInput, generateBrief, searchKnowledge, checkDuplicate, assessValue, extractLinks — all Haiku calls |
| src/lib/muse-handler.ts | detectMuseIntent, handleMuseSearch, handleMuseFile, handleMuseBrainDump, handleMuseConfirm, handleMuseStatus, checkMuseHarvest |
| src/app/api/dashboard/muse/route.ts | GET entries |
| src/app/api/dashboard/muse/search/route.ts | POST search |
| src/app/api/dashboard/muse/file/route.ts | POST file entry |
| src/app/api/dashboard/muse/braindump/route.ts | POST brain dump |
| src/app/api/dashboard/muse/confirm/route.ts | POST confirm/discard pending |
| src/app/api/dashboard/muse/pending/route.ts | GET pending queue |
| src/app/api/dashboard/muse/insights/route.ts | GET proactive insights |
| src/app/api/dashboard/muse/entry/[id]/route.ts | GET full entry |
| src/app/dashboard/muse/page.tsx | Dashboard page |
| src/components/MuseWorkspace.tsx | Full interactive workspace |

### Files to Modify
| File | Change |
|---|---|
| src/db/schema.ts | Add 4 MUSE tables, additive only |
| src/app/api/slack/events/route.ts | Import muse handler, insert before MERCURY block |
| dashboard.module.css | Add muse* CSS section, same token set |
| src/lib/cassandra-handler.ts | Add checkMuseHarvest call after brief saved |
| src/lib/athena-handler.ts | Add checkMuseHarvest call after quiz session saved |

---

### Build Order (stub-first discipline)

**Step 1 — Schema + pure tools (free)**
- 4 DB tables + migration
- tools/muse.ts — all pure functions
- Verify: tables exist, functions callable, TypeScript clean
- HARD STOP — confirm schema before any lib code

**Step 2 — Stub handlers + routes (free)**
- src/lib/muse.ts — all functions stub (throw on call)
- muse-handler.ts — intent detection + handler shells
- All dashboard routes — stubbed responses
- MuseWorkspace.tsx — full UI wired to stubs
- Slack events route — routing block inserted
- Verify: Slack intent detected, stub responses delivered,
  dashboard workspace renders, all routes 401 without session
- HARD STOP — show stub round-trip

**Step 3 — Wire real Claude calls one at a time**
- assessValue + generateBrief first (filing flow)
- Verify filing end-to-end: input → pending → confirm → active entry
- HARD STOP — confirm filing works before search

**Step 4 — Wire search**
- searchKnowledge (sector + full database)
- Verify: search returns real results from DB

**Step 5 — Auto-harvest**
- checkMuseHarvest wired to ATHENA and CASSANDRA
- Verify: ATHENA weak spot → pending entry → confirm → active
- Verify: CASSANDRA brief → signal detected → pending entry

**Step 6 — Active intelligence**
- ATHENA feedback loop (push to SM2)
- CASSANDRA → IRIS surfacing
- Morning insight delivery

---

### Hard Rules
- Nothing auto-commits — every entry confirmed by Archie first
- Client Intelligence sector locked until compliance gate opens
- All entries dated, all updates change-logged
- Regulations and Products always versioned
- Never invents facts or source attributions
- Mechanism-only for Products
- Additive only — never touch existing agent logic
- All actions logged to activity table (agent: 'MUSE')
- requireDashboardAuth() on all dashboard routes
- Secrets in .env only

---

### Dashboard Component — MuseWorkspace.tsx

**Layout structure:**
```
<MuseWorkspace>
  <SectorPanel />          {/* left slide-out */}
  <BrainGraph />           {/* centre, always visible, D3.js */}
  <ApprovalsPanel>
    <ApprovalsQueue />     {/* top half of right panel */}
    <BrainDumpInput />     {/* bottom half of right panel */}
  </ApprovalsPanel>
</MuseWorkspace>
```

**BrainGraph (D3.js force-directed)**
- Fetches all active muse_entries + muse_links on load
- Renders nodes + links as SVG
- Node colour = sector colour (defined in CSS vars)
- Node size = 8px base + 2px per link (capped at 24px)
- Click node → dispatch openEntry(id) → EntryOverlay renders
- Zoom: d3.zoom(), pan: drag on background
- Re-fetches and re-renders when new entry confirmed

**SectorPanel**
- Fetch GET /api/dashboard/muse/entries?sector=[sector] on sector click
- Search input: client-side filter on fetched entries
- Entry list item click → dispatch openEntry(id)
- Locked sector: rendered with opacity-50 + lock icon, click shows tooltip
  "Available after compliance conversation"

**ApprovalsQueue**
- Fetch GET /api/dashboard/muse/pending on load + after each action
- Badge count on panel tab = pending items count
- Each item: sector chip + title + source label + Keep / Discard buttons
- Keep / Discard → POST /api/dashboard/muse/confirm
- Inline conversation: text input below each item for edit instructions
  → POST /api/dashboard/muse/confirm with editInstruction field
  → MUSE redrafts and returns updated pending item

**BrainDumpInput**
- Textarea + file dropzone (accept: .pdf, .txt, .md)
- PDF: read as base64, send to route for extraction
- Submit → POST /api/dashboard/muse/braindump
- On success: scroll ApprovalsQueue to new pending item

**EntryOverlay**
- Full entry view rendered as overlay on brain graph
- Sections: title, sector chip, date filed, last updated
- Summary, full content (rendered markdown)
- Change log (accordion — collapsed by default)
- Linked entries (clickable chips → open that entry)
- Close button → dismiss overlay, brain graph resumes focus

**CSS**
- All new classes prefixed muse*
- Sector colours defined as CSS vars:
  --muse-training, --muse-markets, --muse-products,
  --muse-regulations, --muse-sales, --muse-expat,
  --muse-performance, --muse-client (locked, greyed)
- Panel slide animation: CSS transform translateX with transition 300ms ease
- Same base token set as rest of dashboard
