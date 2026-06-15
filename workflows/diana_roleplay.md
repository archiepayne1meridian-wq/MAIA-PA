# Workflow: DIANA — Objection Handling & Roleplay

**Agent:** DIANA · **Tier:** 1 (practice tool — own use, nothing outbound, no client data) · **Domain:** sales-conversation training
**Shaped like:** a fresh build (no Meridian analogue) · **Phase:** 1 (fifth agent)
**Pattern:** interactive + interactive buttons (reuses ATHENA's `/api/slack/interactive` endpoint) + multi-turn roleplay state

---

## Objective

Help the adviser get fluent at handling prospect objections, two ways:
1. **Reference mode** — tap an objection → get a suggested **approach/script**, a **pivot**, and the **key principles** behind why it works.
2. **Roleplay mode** — DIANA plays a prospect (and can run a **full mock call** — intro → fact-find → solution); the user responds in conversation; DIANA reacts in character and gives **feedback** at the end.

ATHENA drills what you *know*; DIANA drills what you can *say under pressure*.

---

## Service Context & Methodology (DIANA must understand the actual call)

DIANA is tuned to the firm's real cold-call: introducing **expats** to the firm and booking a
**complimentary financial health check** with a senior consultant. The offer, the three hooks
(retirement/children · inflation & tax protection · digital assets), the three-stage call
(introduction → fact-find → solution), and the objection library all live in **`context/diana.md`** —
DIANA reads it as her knowledge base. The goal of the call is to **book the meeting**, never to
advise or pitch product on the phone.

**The skill being trained is question-led selling** — getting the prospect to do most of the talking
so they surface their own needs ("let them sell themselves"). So DIANA does not just test rebuttals;
she tests whether the user **leads with questions, builds rapport, and lets the prospect talk.**

## What DIANA Evaluates (roleplay scoring — from `context/diana.md` rubric)

After a roleplay, DIANA scores: **talk ratio** (did the prospect talk more than the user?), **open
questions** (vs pitching/closed), **rapport**, **need-led** (surfaced a hook *through questions*),
**objection handling** (acknowledge + question, not argue/pitch), **stayed in lane** (no advice/product
pitch on the call), and **secured the next step** (moved to book the meeting). Feedback leads with what
worked, names the single highest-leverage fix (usually talk ratio or leading with a question), quotes
one good line and one to improve. Warm, never harsh.

---

## ⚠️ Compliance & Guardrails

- **Practice tool, not approved scripts.** DIANA's scripts are training scaffolding. When prospecting for real under deVere, the **firm's compliance-approved scripts and rules govern** — DIANA prepares technique, she does not authorise activity or replace firm material. Note this in her output.
- **Trainee context.** Real prospect contact is governed by the user's authorisation status and deVere's supervision. DIANA is preparation/rehearsal — she never tells the user they're cleared to make real calls.
- **Honesty is non-negotiable.** Scripts must never coach misleading statements, fake urgency, or manipulation. The **"where did you get my details"** objection in particular must be answered *truthfully* (referral / public source / consented data provider) — DIANA coaches an honest answer, never a deflection or a lie.
- **No unauthorised advice.** Objection responses stay at the "secure a conversation" level — they never put specific investment advice or financial promotions in the user's mouth.
- **Nothing outbound, no client data.** It's the user practising solo. Tier 1.
- **Roleplay stays professional** — realistic pushback, not abuse; DIANA never models a script that crosses into pressure-selling.

---

## Required Inputs

**From `context/diana.md`** (human-editable; create template if absent):
- `objections[]` — the objection library. Seed with the user's eight:
  *Not interested · Send me an email · Too busy · I have an adviser · Where did you get my details · Bad experience · No money · Called before*
- Each objection entry holds: `intent` (what the prospect really means), `approach` (suggested response/script), `pivot` (how to turn it productive), `principles` (why it works). **User can replace any entry with deVere's approved wording** — DIANA serves whatever's in the config.
- `difficulty` — roleplay realism (warm / neutral / tough). Default neutral.
- `firm_tone` — optional notes on deVere's approved style so DIANA's scripts match it.

If an objection entry has no curated content, DIANA falls back to generating one with Claude (clearly marked as a draft to refine).

---

## Tools To Use

Reuse Phase 0/1 wrappers + ATHENA's interactive-button endpoint. New units:

- `tools/diana-db.ts` — `startSession()`, `appendTurn()`, `getActiveSession(user)`, `endSession()`; optional `logPractice(objection)` to track which objections the user drills most.
- `src/lib/diana.ts` — Claude-facing where needed: `roleplayTurn(transcript, userMsg, scenario, difficulty)` → DIANA's in-character prospect reply; `roleplayFeedback(transcript)` → end-of-session coaching **scored against the `context/diana.md` rubric** (talk ratio, open questions, rapport, need-led, objection handling, stayed in lane, secured next step). `objectionGuide(objection)` → only as a fallback when the config has no curated entry.
- `src/lib/diana-handler.ts` — intent detection, button handling, the roleplay state machine, handlers.

**Reference mode is mostly deterministic** — it serves curated `approach/pivot/principles` from `context/diana.md`, so it's free and consistent. Claude is used for **roleplay** (dynamic) and only as a fallback for un-curated objections.

---

## Data Model (new table — add to `src/db/schema.ts`, migrate; leave existing tables untouched)

`diana_sessions`
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| slack_user | TEXT | who's in the roleplay |
| scenario | TEXT | objection / persona being drilled |
| difficulty | TEXT | warm / neutral / tough |
| transcript_json | TEXT | the running exchange (for multi-turn context) |
| status | TEXT | 'active' / 'ended' |
| created_at / ended_at | INTEGER | |

(Objection library + difficulty live in `context/diana.md`, not the DB.)

---

## Interaction (over Slack)

**Reference mode (buttons, free):**
- "DIANA" / "objections" / "practice objections" → DIANA posts the objection library as **tappable buttons** (reuses the interactive endpoint, `diana_obj_<id>` action ids).
- Tap one → DIANA returns four short blocks: **What they mean** (intent) · **Try** (approach/script) · **Pivot** · **Why it works** (principles) — plus a one-line reminder that firm-approved scripts govern the real thing.
- Optional: log the tap so DIANA can later show which objections the user drills most.

**Roleplay mode (multi-turn, Claude):**
- "DIANA, roleplay" (optionally "...the 'too busy' one" / a difficulty) → `startSession()`; DIANA opens *in character* as a prospect.
- Each subsequent user message is a roleplay turn → `appendTurn()` → `roleplayTurn()` replies in character (escalating realistically per difficulty).
- "done" / "exit" / "stop" → `endSession()` → `roleplayFeedback()` posts coaching.
- **State machine:** while a session is `active` for that user, their messages route to DIANA's roleplay handler (not normal intent routing) until they exit. This is the project's first *stateful mode* — the events route must check for an active DIANA session **before** normal intent detection, and an explicit exit word always breaks out.

Intent routing: add DIANA detection (the triggers above) to the events route. Existing agents + MAIA fallthrough stay intact. The active-session check sits at the top; no-match (and no active session) still falls through to the spine.

---

## Build / Test Order (paid-call discipline)

1. `tools/diana-db.ts` + a small test (session lifecycle) — free.
2. Reference mode with **curated config content, no Claude** — post the objection buttons, tap returns the four blocks from `context/diana.md`. Prove the interactive routing + content — free.
3. Roleplay **state machine with a STUBBED in-character reply** (no Claude) — prove start → turns route to DIANA → exit → session ends, and that an active session correctly intercepts routing — free.
4. **Then** wire Claude: `roleplayTurn`, then `roleplayFeedback` (and `objectionGuide` fallback). HARD STOP before the first live call — show the prompts + a sample and wait for "go ahead". Cheap model (Haiku/Sonnet), not Opus.
5. Full run: drill a few objections, do a roleplay, read the feedback.

---

## Compliance Verification

- Reference scripts and roleplay never coach misleading claims, manufactured urgency, or pressure tactics.
- The "where did you get my details" answer is honest (truthful source), never a deflection.
- No specific investment advice or financial promotion appears in any script.
- Every reference reply carries the "firm-approved scripts govern the real thing" reminder.
- Nothing is ever sent to anyone — DIANA is self-practice only.

---

## Edge Cases

- **Un-curated objection** → DIANA generates a draft guide (marked "draft — refine with firm material"), doesn't error.
- **User abandons a roleplay** (no exit) → session can time out / be ended by "DIANA, reset"; don't leave routing stuck in roleplay forever.
- **Roleplay drifts into real advice** → DIANA stays at the conversation-securing level; if the user asks her to script actual financial advice, she declines and keeps it to technique.
- **Another agent's keyword inside a roleplay** ("quiz me" said to a roleplay prospect) → the active-session check means it's treated as a roleplay turn, not an ATHENA command, until the user exits. (This is why the session check sits above intent routing.)

---

## Done =

- `tools/diana-db.ts` tested (session lifecycle).
- Objection buttons post; tapping returns the four blocks from curated config; firm-script reminder present.
- Roleplay: start → multi-turn in-character exchange (active session intercepts routing) → exit → constructive feedback.
- Claude calls on a cheap model, behind the hard stop; un-curated objections fall back to a marked draft.
- No misleading/pressure scripting; honest data-source answer; nothing outbound.
- All actions logged to `activity` (`agent: 'DIANA'`); update this workflow + `decisions/log.md`.
