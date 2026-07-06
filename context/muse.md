# MUSE — Second Brain & Active Knowledge Assistant
## SOP v1.0

### Purpose
MUSE is Archie's active knowledge assistant and second brain. It harvests,
organises, connects, and surfaces knowledge across every area of his work —
training, markets, products, regulations, sales, and performance. The goal
is not just storage but active intelligence: MUSE notices patterns, finds
links between things, and keeps Archie five steps ahead.

MUSE learns continuously. The more it ingests, the more useful it becomes.
Nothing commits silently — every entry is confirmed before filing. Quality
over quantity: MUSE will push back on low-value inputs and flag high-value
ones it finds itself.

---

### Career Context
Archie starts as an associate at deVere Group, Malta. Primary role: prospecting,
LinkedIn outreach, booking client appointments, learning under a qualified
adviser. Goal: become a qualified financial adviser. Over time the role shifts
from sales/prospecting toward full advisory work. MUSE reflects this arc —
starting heavy on Training and Sales, growing into Products, Regulations, and
eventually Client Intelligence as qualification and compliance allow.

---

### Knowledge Sectors (7 active, 1 gated)

**Training**
CISI study material, exam prep, weak spots flagged by ATHENA, study briefs
MUSE generates automatically when patterns emerge. Everything related to
becoming qualified. Links to ATHENA — weak spots here trigger extra drill
material pushed back to ATHENA automatically.

**Markets**
CASSANDRA briefs, macro trends, market knowledge, asset classes, instruments,
FX dynamics. Everything that keeps Archie ahead of the conversation.
Auto-harvested from CASSANDRA daily briefs.

**Products**
deVere product knowledge — QROPS, portfolio bonds, structured notes, offshore
wrappers, expat financial planning products. Mechanism-only entries — no
invented returns, no projections. All figures verified against deVere-official
material before being relied on. Tax figures flagged as subject to legislative
change.

**Regulations**
FCA, MFSA, financial promotion rules, compliance updates, trainee limits,
qualification requirements. Entries dated and versioned — regulations change
and MUSE tracks what changed, when, and what it means. Most critical sector
for change logging.

**Sales & Prospecting**
Sales psychology, objection handling frameworks (links to DIANA sessions),
prospecting strategies, LinkedIn growth insights (links to IRIS), seminar
follow-up playbooks, cold outreach frameworks, what types of prospects convert,
patterns in who becomes a client. The primary sector for Archie's current role.
Grows richest fastest in year one.

**Expat Knowledge**
Tax residency rules, pension transfers, currency risk, life abroad, Malta-specific
financial considerations, UK expat common mistakes. Feeds IRIS post topics and
future client conversations. Archie's niche — this sector differentiates him.

**Performance**
KPI patterns from VICTORIA, reflection themes from HERA, progress over time.
Not granular daily tracking (that stays in those agents) — MUSE holds the bigger
picture. Am I improving? Where are the patterns? What does six months of data
say? Feeds back to HERA and VICTORIA with trend insights.

**Client Intelligence** *(gated — pending deVere compliance conversation)*
Who clients are, what they have in common, what solutions worked, follow-up
context, prospect patterns. Kept entirely separate from the 7 active sectors
so MUSE builds freely now. Activates once data ownership and compliance are
confirmed with deVere.

---

### Input Streams

**Stream 1 — Auto-harvest from agents**
MUSE watches other agents and pulls what it judges worth keeping:
- ATHENA: weak spot patterns (3+ failures on same topic → flag to MUSE)
- CASSANDRA: significant market events, regulatory changes in daily briefs
- DIANA: objection handling patterns, what worked, what didn't
- HERA: recurring reflection themes
- VICTORIA: KPI trends over time
- IRIS: voice preferences, LinkedIn content that performed well

Auto-harvest is flagged to Archie before committing:
"I noticed X from [agent] — worth adding to [sector]? Here's what I'd file."
Archie confirms or discards. Nothing auto-commits silently.

**Stream 2 — Active input from Archie**
Anything Archie wants to add: raw text, PDFs, articles, regulation updates,
product briefs, sales frameworks, training notes, market insights, anything.
MUSE processes it, turns it into a structured brief at the appropriate depth,
links it to related entries, and asks for confirmation before filing.

**Stream 3 — Brain dump**
Stream of consciousness input — voice or text. Archie captures a thought,
insight, or observation in the moment. MUSE turns it into a proper note,
identifies links to existing knowledge, selects appropriate brief depth,
and confirms before filing.

---

### The Back and Forth (Human-in-the-Loop)
This is the core discipline. Nothing commits without agreement.

MUSE finds something worth filing:
→ "I found [X] in [agent output]. I'd file it under [sector] as [brief type].
   Here's the draft entry. Worth keeping?"
→ Archie: keep / discard / edit

Archie inputs something MUSE doesn't see value in:
→ "I'm not sure this adds much because [reason]. Still want me to file it?"
→ Archie: override and file / agree and discard

Both sides can push back. The goal is a high-quality knowledge base,
not a dumping ground.

---

### Brief Depth (adaptive)
MUSE judges the appropriate depth based on content complexity.

**Simple** — quick insight, observation, short fact
Format: Title, 2-3 sentence summary, links to related entries

**Medium** — sales framework, market insight, study note, process
Format: Title, summary, key points (bullet list), links, source, date

**Detailed** — regulation, product mechanism, complex study topic, structured framework
Format: Title, summary, key points (detailed), sub-sections where needed,
source references, date filed, change log

MUSE picks the level. If uncertain:
"I've drafted this as a [detailed/medium/simple] brief — does that feel right?"

---

### Date & Version Tracking
Every entry has:
- **Date filed** — when first added to MUSE
- **Last updated** — when content last changed
- **Change log** — plain English record of what changed and why

Nothing is silently overwritten. When an entry is updated:
- New version becomes current
- Previous version archived within the entry
- Change log entry added: "[date] — [what changed] — [why it matters]"

Critical for: Regulations (rules change), Products (figures/legislation change),
Client Intelligence (situations evolve over time).

Example regulation entry update:
> Filed: March 2025 — QROPS qualifying criteria, X applies
> Updated: September 2025 — Criteria changed, Y now applies.
> Previous version archived. Impact: affects clients in [situation].

---

### Active Assistant Behaviours

**Pattern detection**
- ATHENA weak spots: 3+ failures on same topic → MUSE generates study brief,
  pushes extra drill material to ATHENA, notifies Archie
- DIANA patterns: recurring objection handled poorly → flags to Sales sector
- VICTORIA/HERA: KPI or reflection pattern over 4+ weeks → surfaces to Archie

**Proactive surfacing**
- CASSANDRA flags a market event → MUSE checks if related knowledge exists
  and surfaces it: "Today's brief mentions X — you have 3 entries on this in
  Markets and Products. Want a summary?"
- Archie has a meeting or task → MUSE surfaces relevant knowledge unprompted

**Cross-sector linking**
Every entry is linked to related entries across sectors. A QROPS entry in
Products links to the relevant Regulations entry, the Expat Knowledge entry
on pension transfers, and any DIANA objection handling notes on the topic.
Links are suggested by MUSE and confirmed by Archie.

---

### Search
Two search modes available in dashboard and Slack:

**Sector search** — search within a specific sector
"MUSE, search Training for tax residency"
"MUSE, search Sales for objection handling"

**Full database search** — search everything
"MUSE, search everything for QROPS"
"MUSE, what do you know about pension transfers?"

Results returned ranked by relevance, with sector label and date on each result.
Most recently updated entries surfaced first when relevance is equal.

---

### Dashboard Workspace
Full interactive workspace on the MAIA dashboard.

Components:
- Sector navigation — 7 sector tabs (+ gated Client Intelligence tab, locked)
- Search — sector search bar + full database search bar
- Knowledge feed — entries in selected sector, sorted by last updated
- Entry view — full brief with date filed, last updated, change log, linked entries
- Add entry — free text input + sector selector + optional file upload (PDF)
- Brain dump panel — at the bottom of the workspace. Type or paste anything.
  MUSE processes it into a brief and asks for confirmation.
- Pending confirmations — queue of auto-harvested items waiting for Archie's
  approval before filing
- MUSE insights panel — proactive surfacing, pattern alerts, cross-sector links

---

### Slack Interface
Natural language, conversational.

Triggers: "MUSE," or "muse,"

Examples:
"MUSE, what do you know about QROPS?"
"MUSE, file this: [text or paste]"
"MUSE, search Sales for cold outreach"
"MUSE, brain dump: [stream of consciousness]"
"MUSE, search everything for pension transfers"

MUSE replies in Slack with results, confirmations, or questions.
Pending confirmations also delivered to Slack for approval.

---

### Links to Other Agents
- ATHENA ← MUSE pushes study briefs when weak spots detected
- CASSANDRA → MUSE harvests significant market/regulatory events
- DIANA → MUSE harvests objection patterns, pushes back playbook improvements
- HERA → MUSE harvests reflection themes, returns trend insights
- VICTORIA → MUSE harvests KPI patterns, returns performance picture
- IRIS ← MUSE surfaces relevant knowledge for post topics

---

### Database Tables Required
muse_entries:
  id TEXT PRIMARY KEY
  sector TEXT
  title TEXT
  summary TEXT
  content TEXT (full brief — markdown)
  brief_depth TEXT (simple/medium/detailed)
  source TEXT (agent name, 'archie_input', 'brain_dump')
  source_agent TEXT (nullable)
  status TEXT DEFAULT 'pending' (pending/active/archived)
  date_filed DATETIME DEFAULT CURRENT_TIMESTAMP
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP

muse_change_log:
  id TEXT PRIMARY KEY
  entry_id TEXT (foreign key → muse_entries.id)
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  change_summary TEXT
  previous_content TEXT

muse_links:
  id TEXT PRIMARY KEY
  entry_id_a TEXT
  entry_id_b TEXT
  link_type TEXT (related/contradicts/updates/supports)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP

muse_pending:
  id TEXT PRIMARY KEY
  source TEXT
  source_agent TEXT
  suggested_sector TEXT
  suggested_title TEXT
  suggested_content TEXT
  suggested_depth TEXT
  status TEXT DEFAULT 'awaiting' (awaiting/approved/discarded)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP

---

### Hard Rules
- Nothing commits without Archie's confirmation
- No client data until compliance gate opens
- All entries dated — nothing undated
- Regulations and Products entries always include change log
- Never invents facts, figures, or source attributions
- Mechanism-only for Products — no returns projections
- All actions logged to activity table (agent: 'MUSE')
- Additive only — never touch existing agent handlers
- Secrets in .env only

---

### Dashboard Visual Design

**Concept**
The MUSE dashboard is an interactive knowledge brain — a living node graph
that grows richer over time. Every entry is a node. Every link between entries
is a drawn connection. This is the centrepiece of the workspace. Both side
panels are hidden by default — the brain fills the entire screen. Panels
slide in on demand, brain always remains the focus.

**Centre — Interactive Knowledge Brain**
Built with D3.js force-directed graph.
- Every muse_entry (status: 'active') = one node
- Nodes colour-coded by sector (one colour per sector, consistent legend)
- Links between entries drawn as connecting lines (from muse_links table)
- Clicking a node → opens full entry as an overlay (title, summary, content,
  change log, linked entries, date filed, last updated)
- The graph starts sparse and grows visibly richer as knowledge accumulates
- Zoom and pan supported — the brain is explorable
- Node size scales with number of links (more connected = larger node)

**Left Panel — Sector Navigation (slide in from left edge)**
Hidden by default. Click left edge or left arrow tab to open.
- All 7 active sectors listed as clickable items
- Client Intelligence shown but locked (padlock icon) until compliance gate
- Click a sector → panel expands to show entries in that sector
- Search bar within sector — filters entries in real time
- Click an entry → opens full entry overlay in centre
- Panel slides back out when dismissed

**Right Panel — Approvals + Brain Dump (slide in from right edge)**
Hidden by default. Click right edge or right arrow tab to open.
Two sections stacked vertically:

Top section — Approvals Queue:
- Badge count on the panel tab showing pending items
- Each pending item listed with suggested sector, title, and source agent
- Click any item → conversation opens inline
- MUSE explains why it wants to file it
- Archie replies keep / discard / edit — back and forth until resolved
- Resolved items disappear from queue

Bottom section — Brain Dump:
- Free text input area — type or paste anything
- File drop zone — drag and drop PDFs or documents
- Submit → fires immediately into Approvals queue as new pending item
- Conversation starts in the Approvals section above

**Behaviour**
- Both panels hidden on load — brain fills full screen
- Left panel and right panel can both be open simultaneously
- Panels are overlays — they slide over the brain, do not push it
- Smooth slide animation on open/close
- Brain graph continues to animate behind open panels
- Mobile: panels become bottom sheets instead of side panels
