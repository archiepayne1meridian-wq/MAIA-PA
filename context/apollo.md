# APOLLO — Call Intelligence Agent
## SOP v1.0

### Purpose
APOLLO processes recorded prospect calls from 8x8, generates a full transcript,
an advisor brief, and a client confirmation email. The goal is to maximise
meeting sit rates and give the advisor everything they need to walk in prepared.
Draft only — Archie always sends manually. Everything saves to MUSE automatically.

---

### Trigger
Dashboard only. Archie drags and drops an 8x8 call recording onto the
APOLLO workspace. Supported formats: .mp3, .mp4, .m4a, .wav, .ogg, .webm.

---

### Processing Flow

**Step 1 — Transcription**
Audio file uploaded to the server.
Transcribed via OpenAI Whisper API (whisper-1 model).
Output: clean timestamped transcript, speaker-labelled where possible
(Speaker 1 / Speaker 2 — Whisper doesn't always identify speakers by name,
so APOLLO infers from context: the person asking questions = Archie,
the person answering = Prospect).
Transcript saved to apollo_calls table.

**Step 2 — Intelligence extraction (Claude Opus)**
Full transcript passed to Claude for deep analysis.
Extracts everything useful about the prospect in one structured pass.

Extracted fields:
- prospect_name: full name if mentioned
- prospect_location: where they live/moving to/from
- age_range: approximate if mentioned
- occupation: job, industry, seniority
- family_situation: married, children, dependents
- financial_situation: savings, pensions, investments, property mentioned
- income_indicators: salary range, bonus, business ownership clues
- financial_concerns: what worries them, what problems they want solved
- future_goals: retirement plans, moving abroad, inheritance, property, lifestyle
- timeline: when they want things to happen
- objections_raised: every objection on the call, verbatim if possible
- what_resonated: what got them to agree to the meeting
- meeting_details: date, time, format (phone/video/in person)
- advisor_name: who the meeting is with if mentioned
- tone_notes: were they warm, sceptical, busy, engaged?
- suggested_approach: how the advisor should open, what to lead with,
  what to avoid, tone recommendations
- talking_points: 3-5 specific recommended topics based on the call

**Step 3 — Generate advisor brief**
Single Claude Haiku call using extracted intelligence.
Format: structured email-ready document.

Template:
---
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
---

**Step 4 — Generate client confirmation email**
Single Claude Haiku call.
Tone: friendly but professional.
References something specific from the call — never generic.
Goal: confirm the meeting, remind them why it made sense, build anticipation,
ensure they show up.

Rules:
- Never give financial advice or projections
- Never invent facts not in the transcript
- Reference a specific moment or topic from the call to make it feel personal
- Keep it concise — 3-4 short paragraphs
- End with clear meeting confirmation details
- Sign off as Archie

**Step 5 — Save to MUSE**
All three outputs filed to MUSE automatically on generation:
- Transcript → Sales & Prospecting sector, title: "Call Transcript — [Prospect Name] [date]"
- Advisor Brief → Sales & Prospecting sector, title: "Advisor Brief — [Prospect Name] [date]"
- Client Email → Sales & Prospecting sector, title: "Client Email — [Prospect Name] [date]"
All filed as detailed briefs. No confirmation needed — auto-commit on generation.
(Exception to normal MUSE human-in-the-loop — these are structured outputs
from a known source, not unvetted external content.)

---

### Dashboard Workspace
Full width, 3 sections:

**Left — Upload**
Drop zone: dashed --border, 14px radius, centred icon + "Drop your 8x8 recording here"
Accepts: .mp3, .mp4, .m4a, .wav, .ogg, .webm
Max file size: 200MB
Processing states:
- Idle: drop zone with instructions
- Uploading: progress bar
- Transcribing: "Transcribing audio..." with spinner
- Analysing: "Extracting intelligence..." with spinner
- Complete: transcript preview (first 200 chars) + "View full transcript" link

**Centre — Transcript**
Full scrollable transcript with timestamps.
Speaker labels (Speaker 1 / Speaker 2).
Copy full transcript button.
Download as .txt button.

**Right — Outputs**
Two cards stacked:

Top — Advisor Brief:
Label: "Advisor Brief" mono 10px uppercase --text-dim
Full brief rendered as formatted text.
Copy button — copies email-ready version.
"Saved to MUSE ✓" confirmation badge after auto-save.

Bottom — Client Email:
Label: "Client Confirmation Email" mono 10px uppercase --text-dim
Full email rendered.
Copy button.
"Saved to MUSE ✓" confirmation badge after auto-save.

---

### Database Table
apollo_calls:
  id TEXT PRIMARY KEY
  call_date TEXT (YYYY-MM-DD)
  prospect_name TEXT (nullable — extracted from transcript)
  transcript TEXT
  intelligence_json TEXT (full extracted fields as JSON)
  advisor_brief TEXT
  client_email TEXT
  muse_transcript_id TEXT (nullable — MUSE entry id)
  muse_brief_id TEXT (nullable — MUSE entry id)
  muse_email_id TEXT (nullable — MUSE entry id)
  created_at INTEGER DEFAULT (unixepoch())

---

### Hard Rules
- Draft only — Archie always sends emails manually
- Never invent facts not present in the transcript
- Never give financial advice in any output
- All outputs saved to MUSE automatically (no confirmation needed for structured outputs)
- Audio files processed server-side — never stored permanently, deleted after transcription
- No client data sent to third parties beyond OpenAI Whisper (transcription) and Anthropic (analysis)
- All routes behind requireDashboardAuth()
- Secrets in .env only
