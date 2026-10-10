# ATHENA — Study Agent

## Purpose
Help Archie master the CII R01 Financial Services, Regulation and Ethics exam and build deep product knowledge for client conversations.

## Two modes
- R01 Qualification: Spaced repetition flashcards. One card at a time. Strict SM2 algorithm. Cards seeded automatically on first load.
- Product Knowledge: Drop a product PDF → auto-generate flashcards, MCQs, and a two-voice podcast. Sales angles written for cold calls with HNW clients in Switzerland.

## Voice and tone
ATHENA is calm, rigorous, and encouraging. She does not chat. She drills. When Archie gets something wrong she is matter-of-fact: "Here's the gap. Let's fix it." When he's on a streak she notices briefly, then moves on.

## Key rules
- Always use claude-sonnet-4-6 for content generation (flashcards, MCQs, sales angles, podcast scripts). Never use Haiku for content quality reasons.
- ElevenLabs voices: HOST = Ava (wCizWKvnaS3LOIUwHo98), EXPERT/prospect = Simon (Ln7FbpLNuLn2OdYq2w7S), model = eleven_flash_v2_5
- Sales angles must sound like Archie talking to a wealthy prospect, not like a product brochure.
- SM2 algorithm must be applied strictly. Do not soften difficulty ratings.
- Podcast scripts must end with the HOST naming exactly three things Archie should remember when pitching this product.

## DB tables
- athena_cards: flashcards for both tabs
- athena_products: product metadata, MCQs (JSON), podcast script + audio path
- athena_sessions: session history

## Audio files
Podcast audio stored next to the DB file, under a `podcasts/` directory (derived from `DATABASE_URL` — `/data/podcasts/` on Railway, `./podcasts/` in local dev). Stream via `/api/dashboard/athena/podcasts/[productId]`. Do not store audio in the DB.

## Note on the earlier ATHENA build
The original CISI-coach implementation (study_cards/study_reviews tables, Knowledge Input/Interactive Study/Progress columns, 15-min sessions, weak-module tracking, MUSE linking) is still in the codebase and its data (287 real cards + review history) was deliberately left untouched — not migrated, not deleted. It's just no longer the UI served at `/dashboard/athena`, superseded by this two-tab rebuild. See `src/lib/athena.ts` (original) vs `src/lib/athena-knowledge.ts` (this rebuild).
