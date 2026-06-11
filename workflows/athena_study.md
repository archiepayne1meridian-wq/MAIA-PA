# Workflow: ATHENA — CISI Study Coach

**Agent:** ATHENA · **Tier:** 1 (own data, no client/compliance surface) · **Domain:** personal study
**Shaped like:** Meridian's Cooper (design reference only — build clean for MAIA)
**Phase:** 1 (first agent)

---

## Objective

Help the adviser pass their CISI qualification efficiently using **retrieval practice** (testing as the main study mechanism) and **data-directed revision** (let weakness data decide what to study next). ATHENA:

1. Turns study material into structured notes + spaced-repetition flashcards.
2. Runs **flashcard quizzes** (SM2) and **daily multiple-choice quizzes** (default 20 questions) over Slack.
3. **Diagnoses weak topics** from quiz performance.
4. Generates **weakness-driven study plans** that produce a focus list to take into NotebookLM.

ATHENA is a **study aid**, not an authority. Notes, cards and MCQs are generated *from the user's own material* and should be checked against the official CISI workbook — never treated as the definitive source.

---

## The Study Loop (how ATHENA pairs with NotebookLM)

ATHENA and NotebookLM do different jobs and form a closed loop. NotebookLM is **external** — there is no API integration; the handoff is manual copy-paste in both directions.

```
   NotebookLM  ──understand a topic──▶  paste key facts / study guide into ATHENA
        ▲                                              │
        │                                       ATHENA makes cards + MCQs
   focus list                                          │
   (weak topics)                              daily MCQ + flashcard quizzes
        │                                              │
        └──────────  ATHENA weakness report  ◀─────────┘
```

- **NotebookLM = comprehension.** Upload CISI sources; ask questions; listen to audio overviews; generate study guides. Locked to your sources, so it won't invent facts.
- **ATHENA = retention + diagnosis.** Drills recall via spaced repetition and daily MCQs; tracks per-topic accuracy; tells you what to go re-study in NotebookLM.
- **The weekly handoff:** ATHENA's weakness report → your NotebookLM focus list for the week. A NotebookLM study guide → pasted into ATHENA as new cards.

---

## Required Inputs

**From `context/athena.md`** (human-editable config; create if absent and ask the user to fill it):
- `exam_name` — the specific CISI unit being sat
- `exam_date` — target sitting date (ISO)
- `modules[]` — module/topic names from the syllabus
- `weekly_hours` — study hours available per week
- `daily_quiz_size` — MCQs per daily quiz (default 20)
- `priority_topics[]` — optional weighting (for this user, likely pension transfers, cross-border/international tax, investment wrappers)
- `notebooklm` — note that NotebookLM is the paired comprehension tool; optionally a link to the notebook

**From the user, in conversation:**
- Pasted study material (from NotebookLM study guides, the CISI workbook, slides, notes)
- Quiz answers (via buttons during a session)
- Commands / natural language ("add this", "quiz me", "daily quiz", "how am I doing", "what should I study", "plan my week")

---

## Tools To Use

Build as deterministic units (WAT — keep reasoning thin, execution in tools). Reuse Phase 0's Slack and Claude wrappers; don't rebuild them.

- `tools/sm2.ts` — **pure function**, no I/O. `(card{ef,intervalDays,repetitions}, quality 0–5) → {ef,intervalDays,repetitions,dueAt}`. Unit-testable. (Algorithm below.)
- `tools/study-db.ts` — CRUD + queries: `addCards()`, `getDueCards(limit)`, `applyReview(cardId, quality)`, `getProgress()`, `getMaterialForModule(module)` (cards/notes used to ground MCQ generation), `logMcqAttempt()`, `getWeaknessReport(days)`.
- `tools/mcq.ts` — quiz helpers: build a quiz session from generated questions, score an answer, advance the session.
- `src/lib/claude.ts` (existing) — reasoning jobs: (a) generate notes + cards from pasted material; (b) generate MCQs **strictly from supplied module material**; (c) judge free-text answers when not button-graded.

---

## Data Model (new tables — add to `src/db/schema.ts`, migrate)

`study_cards`
| column | type | notes |
|---|---|---|
| id | TEXT PK | `crypto.randomUUID()` |
| module | TEXT | syllabus module |
| front / back | TEXT NOT NULL | Q / A |
| ef | REAL DEFAULT 2.5 | SM2 ease factor (min 1.3) |
| interval_days | INTEGER DEFAULT 0 | current interval |
| repetitions | INTEGER DEFAULT 0 | consecutive correct |
| due_at | INTEGER | Unix ts; due on creation |
| suspended | INTEGER DEFAULT 0 | exclude from quizzes |
| created_at / last_reviewed_at | INTEGER | |

`study_reviews` — flashcard history: id, card_id, quality, ef_after, interval_after, reviewed_at.

`quiz_sessions` — a generated MCQ quiz: id, modules (JSON), questions (JSON: each `{q, options[4], correctIndex, explanation, module}`), current_index, score, total, created_at, completed_at.

`mcq_attempts` — per-question log for analytics: id, session_id, module, question, correct (0/1), created_at.

(Exam date, modules, weekly hours, quiz size live in `context/athena.md`, not the DB.)

---

## SM2 Algorithm (implement exactly in `tools/sm2.ts`)

Given `quality` q (0–5):
1. If `q < 3` (lapse): `repetitions = 0`, `intervalDays = 1`.
2. Else: `repetitions===0 → 1`; `repetitions===1 → 6`; `repetitions>=2 → round(intervalDays * ef)`; then `repetitions += 1`.
3. Always: `ef = ef + (0.1 - (5-q)*(0.08 + (5-q)*0.02))`, clamp **min 1.3**.
4. `dueAt = now + intervalDays*86400`.

Flashcard button → quality: **Again→1 · Hard→3 · Good→4 · Easy→5**.

---

## Interaction (over Slack)

Routing: MAIA detects an ATHENA intent (keywords: study, quiz, flashcard, "add this", "what should I study"). A simple keyword/prefix router is fine for Phase 1.

**A) Ingest material** — user pastes content ("ATHENA, add this to <module>"):
1. Claude → concise structured note + atomic flashcards (one fact each), tagged to a module.
2. `addCards()` (due immediately). 3. Reply: "Added 12 cards to *Pensions*."

**B) Flashcard quiz** — "quiz me":
1. `getDueCards(limit)`; none due → offer to study ahead or add material.
2. Post card **front** + **Show answer** button (`athena_reveal_<cardId>`).
3. Reveal → show back + grade buttons (`athena_grade_<cardId>_<again|hard|good|easy>`).
4. Grade → `applyReview()` → "✓ scheduled in N days" → post next due card. Stateless (id in `action_id`).
5. End → short session summary.

**C) Daily MCQ quiz** — "daily quiz" (or a chosen module):
1. Pick scope: weak/priority topics + due modules (or a module the user names). `getMaterialForModule()` to gather the grounding content.
2. Claude → `daily_quiz_size` MCQs (default 20), **strictly from that material**, each with 4 options, one correct, a one-line explanation, tagged to its module. If a module has too little material, say so and suggest adding a NotebookLM study guide.
3. Save as a `quiz_sessions` row. Post Q1 with four option buttons (`athena_mcq_<sessionId>_<qIndex>_<choiceIndex>`).
4. On answer: score against the stored `correctIndex`, write an `mcq_attempts` row, `updateMessage` to show ✓/✗ + the one-line explanation, advance `current_index`, post the next question.
5. End → score + **per-module breakdown** (e.g. "Pensions 6/8 · Tax 4/7 · Wrappers 9/10"), and offer: "Want tomorrow's quiz weighted to your weak topics?"

**D) Progress** — "how am I doing": mastery (% cards with interval ≥ 21d), cards due today, streak, days to exam, last quiz score.

**E) Weakness report + NotebookLM focus list** — "what should I study":
- `getWeaknessReport(days)` combines MCQ per-module accuracy + flashcard lapse rates → ranks weakest modules.
- Output a focus list framed for NotebookLM: "**Focus in NotebookLM this week:** 1) Cross-border tax (52%) 2) Pension transfers (61%) 3) …", plus offer to weight upcoming quizzes to those topics.

**F) Study plan** — "plan my week":
- Combine the weakness report + `exam_date` + `weekly_hours` → a simple weekly plan: daily MCQ quiz (the retrieval habit), which weak topics to study in NotebookLM on which days, and flashcard review load. Output as a message; **do not auto-schedule** anything.

---

## Extend `/api/slack/interactive`

Add prefix routing (keep the HMAC → 200-in-3s → async pattern; approvals routing untouched):
- `athena_reveal_*`, `athena_grade_*` → flashcard handlers.
- `athena_mcq_*` → MCQ scoring/advance handler.
ATHENA does **not** use the approvals table — study interactions are internal and need no sign-off.

---

## Expected Outputs

- Cards in `study_cards`, scheduled by SM2; flashcard quizzes runnable end-to-end.
- Daily MCQ quizzes generated from the user's own material, scored, with per-module breakdown stored in `mcq_attempts`.
- A weakness report that produces a NotebookLM focus list, and a weekly study plan.
- Every ATHENA action logged to `activity` (`agent: 'ATHENA'`).

---

## Edge Cases

- **No `context/athena.md`** → create a template; ask for exam date + modules before planning. Adding/quizzing still works.
- **Thin material for a module** → don't fabricate MCQs; tell the user to add a NotebookLM study guide or more notes first. (Accuracy guard.)
- **No due cards** → offer to study ahead or add material.
- **Long paste** → chunk; generate per chunk; dedupe near-identical fronts.
- **Types instead of tapping** ("good", or an option letter) → accept and map.
- **Card/question looks wrong** → let the user suspend/fix it; always remind that content is a revision aid to verify against the official workbook.
- **Paid-call discipline** → batch generation (cards per chunk; a full MCQ set in one call). Don't regenerate on every message.

---

## Done =

- Paste material → notes + cards saved, count confirmed.
- "Quiz me" → flashcards flow with SM2 rescheduling.
- "Daily quiz" → 20 grounded MCQs, scored, per-module breakdown.
- "What should I study" → weakness report + NotebookLM focus list.
- "Plan my week" → weakness-driven plan with a daily quiz habit.
- `tools/sm2.ts` unit-tested; all actions in `activity`.
- Update this workflow with anything learned; log the build in `decisions/log.md`.
