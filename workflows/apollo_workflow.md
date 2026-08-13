# APOLLO — Call Intelligence Workflow
## Operational Flow v1.0

### Trigger
Dashboard only. Archie drags and drops an 8x8 call recording onto the
APOLLO workspace drop zone.
Supported formats: .mp3, .mp4, .m4a, .wav, .ogg, .webm
Maximum file size: 200MB

---

### Processing Flow

**Stage 1 — Upload & Transcription**
1. File dropped onto drop zone
2. Frontend shows upload progress bar
3. File POSTed to /api/dashboard/apollo/transcribe as multipart FormData
4. Server saves file temporarily to /tmp/apollo-[uuid].[ext]
5. File sent to OpenAI Whisper (whisper-1, verbose_json format, language: en)
6. Whisper returns segments with timestamps
7. Server post-processes into clean speaker-labelled transcript:
   - Heuristic: questioner = Archie, answerer = Prospect
   - Format: "[00:00] Archie: ..." / "[00:14] Prospect: ..."
   - If speaker can't be determined: "Speaker 1" / "Speaker 2"
8. Tmp file deleted immediately
9. Transcript saved to apollo_calls table
10. Frontend receives { callId, transcript } → renders in centre panel
11. "Analyse Call" button appears

**Stage 2 — Intelligence Extraction**
1. Archie clicks "Analyse Call"
2. POST /api/dashboard/apollo/analyse { callId }
3. Full transcript sent to Claude Opus (claude-opus-4-6)
4. Opus extracts structured intelligence JSON:
   - prospect_name, location, age_range, occupation, family_situation
   - financial_situation, income_indicators, financial_concerns
   - future_goals, timeline, objections_raised, what_resonated
   - meeting_details, advisor_name, tone_notes
   - suggested_approach, talking_points (array)
5. Intelligence JSON saved to apollo_calls
6. Frontend receives intelligence, moves to Stage 3 automatically

**Stage 3 — Output Generation**
1. POST /api/dashboard/apollo/generate { callId }
2. Two parallel Haiku calls:
   a. Advisor Brief — structured meeting brief email using MEETING BRIEF template
   b. Client Confirmation Email — friendly but professional, references specific
      call moment, confirms meeting details
3. Both outputs saved to apollo_calls
4. Auto-save to MUSE fires (fire and forget, never blocks):
   - Transcript → muse_entries, Sales & Prospecting, status: active
   - Advisor Brief → muse_entries, Sales & Prospecting, status: active
   - Client Email → muse_entries, Sales & Prospecting, status: active
   - All 3 MUSE entry IDs saved back to apollo_calls
5. Frontend receives both outputs → populates right panel cards
6. "Saved to MUSE ✓" badges shown on both output cards

---

### Dashboard Workspace Layout

```
[Left 25%] [Centre 50%] [Right 25%]
```

**Left — Upload + History**
Top: drop zone (idle → uploading → transcribing → analysing → complete)
Below: "Analyse Call" button (appears after transcription)
Below: "Recent Calls" list — last 10 calls, click to load

**Centre — Transcript**
Full scrollable transcript with timestamps and speaker labels
Mono font, copy button, download as .txt button
Empty state: "Upload a call recording to see the transcript"

**Right — Outputs**
Two stacked cards:
- Advisor Brief: full MEETING BRIEF text + copy button + "Saved to MUSE ✓"
- Client Email: full email text + copy button + "Saved to MUSE ✓"
Empty state per card: "Generate after transcription"

---

### Processing States (UI feedback)

| State | Left Panel | Centre | Right |
|-------|-----------|--------|-------|
| Idle | Drop zone | Empty state | Empty placeholders |
| Uploading | Progress bar % | Empty | Empty |
| Transcribing | "Transcribing audio..." + spinner | Empty | Empty |
| Transcript ready | "Analyse Call" button | Full transcript | Empty placeholders |
| Analysing | "Extracting intelligence..." | Transcript | Empty |
| Generating | "Generating outputs..." | Transcript | Empty |
| Complete | Recent calls list | Transcript | Brief + Email + MUSE badges |
| Error | Error message in --alert | — | — |

---

### Advisor Brief Template

```
MEETING BRIEF — [Prospect Name]
Prepared by APOLLO | [date]

ABOUT THE PROSPECT
[personal background — name, location, occupation, family]

FINANCIAL PICTURE
[what they have, what they're worried about, gaps identified]

GOALS & TIMELINE
[what they want, when they want it, life events mentioned]

OBJECTIONS ON THE CALL
[each objection raised + how it was handled + whether resolved]

WHAT GOT THEM TO THE MEETING
[specific triggers — what resonated, what they responded to]

RECOMMENDED APPROACH
[tone, opening, topics to lead with, things to avoid]

TALKING POINTS
1. [specific point from the call]
2. [specific point from the call]
3. [specific point from the call]

MEETING DETAILS
[date, time, format, any logistics mentioned]
```

---

### Client Email Rules
- Friendly but professional tone
- 3-4 short paragraphs
- Reference something specific from the call (never generic)
- Confirm meeting date, time, format
- Remind them briefly why the meeting made sense
- Build anticipation — make them feel good about the decision
- Sign off as Archie Payne, deVere Group
- Never give financial advice or projections
- Never invent facts not in the transcript

---

### MUSE Auto-Save Rules
- All 3 outputs auto-commit to muse_entries (bypass pending flow)
- Sector: Sales & Prospecting
- Brief depth: detailed for transcript + brief, simple for email
- Source: 'apollo', source_agent: 'APOLLO'
- Status: 'active' (no confirmation needed — structured outputs from known source)
- MUSE entry IDs saved back to apollo_calls for reference
- Fire and forget — MUSE save never blocks output generation

---

### Database Table
apollo_calls:
  id TEXT PRIMARY KEY
  call_date TEXT (YYYY-MM-DD)
  prospect_name TEXT (nullable)
  transcript TEXT
  intelligence_json TEXT (full extracted fields as JSON)
  advisor_brief TEXT
  client_email TEXT
  muse_transcript_id TEXT (nullable)
  muse_brief_id TEXT (nullable)
  muse_email_id TEXT (nullable)
  created_at INTEGER DEFAULT (unixepoch())

---

### Routes
| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| POST | /api/dashboard/apollo/transcribe | Upload + Whisper transcription | requireDashboardAuth |
| POST | /api/dashboard/apollo/analyse | Opus intelligence extraction | requireDashboardAuth |
| POST | /api/dashboard/apollo/generate | Haiku brief + email generation | requireDashboardAuth |
| GET | /api/dashboard/apollo | Recent calls list | requireDashboardAuth |

---

### Files to Create
| File | Purpose |
|------|---------|
| tools/apollo.ts | Pure functions: saveCall, updateCall, getCall, getRecentCalls |
| src/app/api/dashboard/apollo/transcribe/route.ts | Whisper transcription |
| src/app/api/dashboard/apollo/analyse/route.ts | Opus extraction |
| src/app/api/dashboard/apollo/generate/route.ts | Haiku brief + email |
| src/app/api/dashboard/apollo/route.ts | GET recent calls |
| src/app/dashboard/apollo/page.tsx | Dashboard page |
| src/app/dashboard/apollo/ApolloWorkspace.tsx | Full workspace component |

### Files to Modify
| File | Change |
|------|--------|
| src/db/schema.ts | Add apollo_calls table, additive only |
| AgentRail.tsx | Add APOLLO tile (badge "A", role "Call Intelligence") |
| DashboardClient.tsx | Add APOLLO to ROUTABLE_AGENTS |
| dashboard.module.css | Add apollo* CSS classes, additive only |

---

### Hard Rules
- Draft only — Archie always sends emails manually
- Never invent facts not present in the transcript
- Never give financial advice in any output
- Audio files deleted from /tmp immediately after transcription
- Never store audio files permanently
- OPENAI_API_KEY used for Whisper — already in .env
- All actions logged to activity table (agent: 'APOLLO')
- requireDashboardAuth() on all routes
- Secrets in .env only
- Additive only — never touch existing agents
