# Workflow: HERA — Daily Reflection & Coaching

**Agent:** HERA · **Tier:** 1 (own data, no client/compliance surface) · **Domain:** personal development
**Shaped like:** a fresh build (no Meridian analogue) · **Phase:** 1 (fourth agent)
**Pattern:** interactive (reuses the ATHENA-style spine) + one light scheduled nudge

---

## Objective

Be the adviser's reflective layer. Each evening the user sends a short note (voice or text) on how the day went; HERA logs it, and over time surfaces patterns and gives gentle weekly coaching feedback — where they're improving, where they keep getting stuck — plus prompts to take to their senior adviser. ATHENA tracks what you *know*, VICTORIA tracks what you *do*, HERA tracks how you're *developing*.

HERA is supportive, not clinical. She reflects and encourages; she does not diagnose, psychoanalyse, or make claims about the user's mental state. If a note ever signals real distress, she responds with warmth and suggests talking to a person they trust — she does not try to be a therapist.

---

## ⚠️ Guardrails

- **No client data in reflections.** A voice note naming a real client becomes client personal data. HERA should gently remind the user to keep notes about *themselves and their development*, not named client details. Tier 1 only holds if it stays personal.
- **Supportive, not diagnostic.** No mental-health labels, no analysing the user's psyche. Validate feelings; don't pathologise them.
- **Distress check.** If a note suggests the user is genuinely struggling (not just "rough day" but real distress), HERA drops the coaching frame, responds kindly, and suggests reaching out to someone they trust. Never minimise, never pile on negativity, never reflect distress back in a way that amplifies it.

---

## Required Inputs

**From `context/hera.md`** (human-editable; create template if absent):
- `reflection_time` — when the evening nudge fires (default 21:30 Europe/London, daily)
- `weekly_review_day` — when the weekly summary posts (default Sunday evening)
- `focus_areas[]` — optional: things the user is working on (e.g. confidence on calls, study consistency) so HERA can track them specifically

**From the user, in conversation:**
- A daily reflection — voice note (transcribed) or text. Free-form; a sentence or a paragraph.
- Optional explicit asks: "how am I doing", "what patterns do you see", "what should I raise with my mentor".

---

## Tools To Use

Reuse Phase 0/1 wrappers (Slack, Claude, getDb, Whisper transcription if voice). New units:

- `tools/hera-db.ts` — CRUD for reflections + weekly reviews: `addReflection()`, `getReflections(days)`, `getReflectionsSince(ts)`, `saveWeeklyReview()`, `getStreak()`.
- `src/lib/hera.ts` — Claude-facing: `coachWeekly(reflections, focusAreas)` → a warm, specific weekly feedback message (patterns, wins, sticking points, one prompt for the senior adviser); `acknowledgeReflection(text)` → a brief, warm acknowledgement when a reflection is logged (not a lecture). `detectDistress(text)` → lightweight check that flags a reflection for the supportive path.
- `src/lib/hera-handler.ts` — intent detection + handlers + the scheduled nudge/weekly-review builders. Logs to `activity` (`agent: 'HERA'`).

---

## Data Model (new tables — add to `src/db/schema.ts`, migrate; leave existing tables untouched)

`reflections`
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| body | TEXT NOT NULL | the reflection (transcribed if voice) |
| source | TEXT | 'text' / 'voice' |
| sentiment | TEXT | optional coarse tag: positive / neutral / low (for pattern-spotting, not diagnosis) |
| created_at | INTEGER | |

`weekly_reviews`
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| period_start / period_end | INTEGER | week covered |
| summary | TEXT | the coaching message HERA produced |
| created_at | INTEGER | |

(Focus areas + times live in `context/hera.md`, not the DB.)

---

## Interaction (over Slack)

**A) Log a reflection** — user sends a voice note or text (evening, or any time):
1. If voice → transcribe (Whisper). 
2. Run `detectDistress`. If flagged → supportive path (see Guardrails): warm reply, suggest a trusted person, still log it, skip the coaching tone.
3. Otherwise → `addReflection()`, reply with a brief warm acknowledgement (`acknowledgeReflection`) — one or two sentences, not a sermon. Optionally a coarse sentiment tag for later pattern-spotting.

**B) Evening nudge** (scheduled) — a gentle "How did today go?" prompt at `reflection_time`. Info-only, no approval. If the user already reflected today, skip the nudge.

**C) Weekly review** (scheduled, Sunday) — `coachWeekly()` over the week's reflections:
- Names patterns kindly ("your best sessions were mornings"), wins, and one or two sticking points framed constructively.
- Ends with one concrete prompt the user could raise with their senior adviser.
- Warm and specific; never harsh, never a list of failures. Saved to `weekly_reviews`.

**D) On-demand** — "HERA, how am I doing" / "what patterns do you see" → same coaching read on demand; "what should I raise with my mentor" → the adviser-prompt only.

Intent routing: extend the events route to detect HERA intents (reflection-style messages are tricky to keyword-match, so use an explicit trigger like "HERA," / "reflection" / the evening nudge's thread, plus the on-demand phrases). DEMETER, CASSANDRA, ATHENA and the MAIA fallthrough must stay intact.

---

## Scheduled Pieces

- **Evening nudge + weekly review** run via the same GitHub Actions cron → Bearer endpoint pattern DEMETER/CASSANDRA proved. `POST /api/hera/nudge` (daily) and the weekly review can share an endpoint with a `mode` param, or be two small endpoints. Bearer auth (`MAIA_API_KEY`, `crypto.timingSafeEqual`). Info-only, no approval.
- Offset the cron time from the morning briefs (this one's evening, so no collision).

---

## Build / Test Order (paid-call discipline)

Claude is used for acknowledgements and the weekly coaching. Build cheap-first:

1. `tools/hera-db.ts` + a small test (streak calc, fetch-by-window) — free.
2. Log-a-reflection over Slack with a **stubbed** acknowledgement (no Claude) — prove storage + retrieval — free.
3. Wire the evening nudge endpoint + cron; prove the unattended nudge via `workflow_dispatch` — free.
4. **Then** add the Claude calls: `acknowledgeReflection`, then `coachWeekly`. HARD STOP before the first live call — show what's being sent and wait for "go ahead". Use a cheap model (Haiku/Sonnet), not Opus.
5. Test the weekly review on a few seeded reflections.

---

## Wellbeing & Tone Checks

- Acknowledgements are warm and brief — never preachy, never a productivity lecture.
- Weekly coaching is constructive: lead with what's working, frame sticking points as next steps, never a pile of criticism.
- The distress path takes priority over coaching: if flagged, be kind and human, suggest a trusted person, don't analyse.
- No mental-health diagnosis or psychoanalysis anywhere.
- Don't foster over-reliance — HERA supports reflection; she's not a substitute for real people.

---

## Edge Cases

- **No reflection logged today** → the nudge fires; if one exists, skip it.
- **Sparse week (few reflections)** → weekly review acknowledges that gently, doesn't fabricate patterns from one data point.
- **Voice transcription fails** → ask the user to resend or type it; don't drop it silently.
- **Client name detected in a reflection** → gentle reminder to keep notes self-focused; still log (it's the user's own note) but flag the reminder.
- **Distress signal** → supportive path, every time.

---

## Done =

- `tools/hera-db.ts` tested (streak + windowed fetch).
- Send a reflection (text and voice) → logged, warm acknowledgement returned.
- Evening nudge fires unattended via `workflow_dispatch`; skips if already reflected.
- Weekly review produces a warm, specific, constructive coaching message over seeded reflections; saved to `weekly_reviews`.
- Distress path verified on a test note — supportive, suggests a trusted person, no diagnosis.
- All actions logged to `activity` (`agent: 'HERA'`); no client data retained beyond the user's own notes.
- Update this workflow with anything learned; log the build in `decisions/log.md`.
