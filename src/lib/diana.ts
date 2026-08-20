// DIANA — Claude-facing functions: in-character roleplay, scored feedback, fallback objection guide.
// All use Haiku. None uses Opus.

import { askWith } from './claude'
import type { DianaTranscriptTurn } from '../../tools/diana-db'

const HAIKU = 'claude-haiku-4-5-20251001'

// ── Default rubric (legacy — used by roleplayFeedback if context/diana.md doesn't supply one) ──

export const DEFAULT_RUBRIC = `1. Talk ratio — did the prospect talk more than the adviser? (Target: them > adviser. Pitching = adviser dominates = mark down.)
2. Open questions — did the adviser ask open, exploratory questions rather than pitch or ask closed yes/nos?
3. Rapport — did the adviser acknowledge, empathise, and react to what the prospect said (not just run a script)?
4. Need-led — did the adviser surface one of the three hooks through questions, letting the prospect name the need?
5. Objection handling — did the adviser meet objections with acknowledgement + a question, not arguing or jumping to a pitch?
6. Stayed in lane — did the adviser resist giving advice or pitching product on the call? (The goal is the meeting.)
7. Secured the next step — did the adviser move toward booking the health check?`

// ── Prospect profiles — the deVere BDA call rebuild ──────────────────────────
//
// One is picked at random when a dashboard session starts (see session/route.ts),
// along with a randomly generated name, and both are stored on the session so
// every turn in the call uses the same character throughout.

export type ProspectProfileKey = 'forgotten_pension' | 'db_believer' | 'second_door' | 'legacy_product'

interface ProspectProfileTemplate {
  key: ProspectProfileKey
  company: string
  location: string
  descriptionTemplate: string  // one-line, shown in the dashboard header — no name in it
  openingLine: string
  hasUkPension: boolean        // false only for 'second_door' — the pension door is shut from the start
  briefBody: string            // full character detail, `{name}` interpolated in at call time
}

const PROSPECT_PROFILE_TEMPLATES: Record<ProspectProfileKey, ProspectProfileTemplate> = {
  forgotten_pension: {
    key: 'forgotten_pension',
    company: 'UBS',
    location: 'Zurich',
    descriptionTemplate: 'UBS, Zurich — old UK pension, frozen ISA, and cash, none of it reviewed in years',
    openingLine: "Yes, that's me — sorry, I'm just in between meetings.",
    hasUkPension: true,
    briefBody: `British, moved to Switzerland 6 years ago from London, works in asset management at UBS in Zurich. Settled and comfortable in Switzerland by now.
Assets:
- An old UK workplace DC pension from a job 10 years ago — never reviewed since. Probably sitting in the default fund from when you were auto-enrolled. You genuinely don't know the charges.
- An ISA from before you left the UK — frozen, you can't add to it any more, and you're not sure what it's invested in.
- Some cash in a UK bank account "for emergencies" — it's been sitting there about 4 years.
Tone: slightly distracted, cooperative once you actually engage with the call — you respond well to specific questions and give vague answers to vague ones.
Your one early objection (use at most once, near the start): "Send me an email" or "I haven't got time right now."`,
  },
  db_believer: {
    key: 'db_believer',
    company: 'Roche',
    location: 'Basel',
    descriptionTemplate: 'Roche, Basel — thinks her DB pension is "gold-plated," hasn\'t checked the details',
    openingLine: 'Yes — what\'s this regarding?',
    hasUkPension: true,
    briefBody: `British, 51, moved from Manchester 8 years ago, now at Roche in Basel. Worked 20 years at an NHS trust in the UK before leaving and built up a defined benefit (DB) pension there. You genuinely believe it's "gold-plated" and have never checked the death benefits or thought about currency risk.
Assets:
- DB pension paying £18,000/year from age 65. Paid in sterling — you live and spend in Swiss francs.
- Some cash savings in a Swiss bank account, earning minimal interest.
- No investments beyond the pension.
Tone: slightly defensive at first, especially about the pension — you don't love being told your "gold-plated" pension might have gaps. You open up when asked good, specific questions.
Your one early objection (use at most once, near the start): "I've already got a pension, I'm sorted."`,
  },
  second_door: {
    key: 'second_door',
    company: 'Google',
    location: 'Zurich',
    descriptionTemplate: 'Google, Zurich — no UK pension, direct and time-pressured, high earner',
    openingLine: 'Yeah, make it quick — what is it?',
    hasUkPension: false,
    briefBody: `South African, 38, in the tech industry at Google Zurich. Been in Switzerland 3 years. Never worked in the UK long enough to build up a pension there — that door is genuinely closed, not a brush-off. High earner.
Assets:
- A vested benefits account from leaving your previous Swiss employer — just sitting in cash, earning almost nothing. Roughly CHF 85,000.
- A trading account / GIA you set up years ago back in South Africa — forgotten about, haven't looked at it since.
- Cash sitting across two currencies — ZAR and CHF.
Tone: direct and time-pressured, a bit skeptical — you don't have patience for waffle.
Your one early objection (use at most once, near the start): "I don't have any UK pension, so I'm not sure this is relevant." If the adviser pushes on the closed pension door after you've said this clearly, get slightly short ("I told you, I never worked there"). If instead he pivots well — something like "fair enough, pensions aren't the only part of it, can I ask you something else instead?" — respond naturally and let him explore your other assets (vested benefits, GIA, cash) in that order, same ladder logic as the fact find.`,
  },
  legacy_product: {
    key: 'legacy_product',
    company: 'Novartis',
    location: 'Basel',
    descriptionTemplate: 'Novartis, Basel — happy with what she has, doesn\'t realise the problem yet',
    openingLine: 'Speaking — who is this?',
    hasUkPension: true,
    briefBody: `British, 45, been in Switzerland 12 years, works at Novartis in Basel. Set up an offshore savings plan (Zurich Vista) when you first arrived and have been paying into it monthly ever since — you don't know the charges or surrender penalties on it. You also have a UK workplace pension from your old job that you've never touched.
Assets:
- Zurich Vista regular savings plan — heavy front-loaded charges you don't know about.
- Old UK workplace DC pension — sitting in the default fund, never reviewed.
- UK ISA — frozen since you left the UK.
Tone: generally happy with what you've got — you don't realise there's a problem, so you're pleasant rather than guarded.
Your one early objection (use at most once, near the start): "I'm happy with my current arrangements."`,
  },
}

export function pickRandomProfile(): ProspectProfileKey {
  const keys = Object.keys(PROSPECT_PROFILE_TEMPLATES) as ProspectProfileKey[]
  return keys[Math.floor(Math.random() * keys.length)]!
}

// ── Randomly generated prospect name ─────────────────────────────────────────
// "Common British/European names for variety" — first name + last initial only,
// e.g. "James R." Generated once per session and stored on it (prospect_name)
// so the same name is used consistently for the whole call.

const PROSPECT_FIRST_NAMES = [
  'James', 'Sarah', 'Marcus', 'Emma', 'Oliver', 'Charlotte', 'Thomas', 'Sophie',
  'Henry', 'Isabelle', 'William', 'Grace', 'Daniel', 'Amelia', 'Lucas', 'Freya',
  'Alexander', 'Olivia', 'Benjamin', 'Chloe', 'Felix', 'Hannah', 'Sebastian', 'Lucy',
]

export function generateProspectName(): string {
  const first = PROSPECT_FIRST_NAMES[Math.floor(Math.random() * PROSPECT_FIRST_NAMES.length)]!
  const initial = String.fromCharCode(65 + Math.floor(Math.random() * 26))
  return `${first} ${initial}.`
}

export interface ProspectDisplay {
  key: ProspectProfileKey
  name: string
  description: string
}

// Display info for the dashboard header — no Claude call, pure string building.
export function getProfileDisplay(key: ProspectProfileKey, name: string): ProspectDisplay {
  const t = PROSPECT_PROFILE_TEMPLATES[key]
  return { key, name, description: t.descriptionTemplate }
}

export function getProfileOpeningLine(key: ProspectProfileKey): string {
  return PROSPECT_PROFILE_TEMPLATES[key].openingLine
}

function buildProfileBrief(key: ProspectProfileKey, name: string): string {
  const t = PROSPECT_PROFILE_TEMPLATES[key]
  return `Your name is ${name}. You work at ${t.company} in ${t.location}.\n${t.briefBody}`
}

// ── roleplayTurn (Haiku, 120 tok) ────────────────────────────────────────────
//
// `transcript` = the conversation so far, NOT including `userMsg`.
// `userMsg` is appended to the prompt as the latest adviser line.
// Claude responds as the prospect only.
//
// Two modes, selected by whether `prospectProfileKey` is supplied:
//  - Profile supplied (dashboard flow) → the full deVere 7-stage call rebuild.
//  - No profile (legacy Slack roleplay) → the original generic cold-call
//    prompt, completely unchanged, so existing Slack sessions keep working
//    exactly as before.

const DIFFICULTY_GUIDES: Record<string, string> = {
  warm:
    'DIFFICULTY — warm: You are fairly receptive. You have mild curiosity about offshore planning. ' +
    'Raise light objections only if the adviser becomes pushy or ignores what you said.',
  neutral:
    'DIFFICULTY — neutral: You are realistic and moderately busy. Not hostile, but not immediately ' +
    'interested. You will open up if the adviser asks genuine questions about your situation. ' +
    'Raise 1–2 natural objections.',
  tough:
    'DIFFICULTY — tough: You are guarded and mildly sceptical — you have heard pitches before. ' +
    'You will only open up if the adviser genuinely listens and asks perceptive questions. ' +
    'Raise multiple objections. Make them work for it.',
}

// Legacy generic cold-call prompt — unchanged from before the deVere rebuild.
// Used only when no prospectProfile is supplied (the Slack roleplay path).
const ROLEPLAY_SYSTEM = `You are DIANA, playing an expat prospect on a cold-call practice line.

The adviser calling you is a trainee at a financial services firm. They are introducing offshore
expat financial planning and trying to book a complimentary financial health check with a senior
consultant. The goal of the call is to book the meeting — not to give advice or sell product on the phone.

{DIFFICULTY_GUIDE}

YOUR CHARACTER: A British expat working abroad for a few years. A moderately busy professional.
You have genuine but unvoiced concerns about retirement planning, tax efficiency, and savings —
but you will not volunteer these unless the adviser earns it with good open questions.
React naturally: good open questions → open up and give real answers; pitching or closed questions → deflect.

RULES:
- Stay completely in character. Never break the fourth wall or acknowledge this is practice.
- Short, natural phone-call responses — 2–4 sentences. Real people do not monologue on cold calls.
- Raise objections naturally when they feel right (do not announce "I have an objection").
- If the adviser asks a genuinely good open question, reward them with a real, specific answer.
- If they pitch the service at you, politely deflect or brush off.
- Never give financial advice, market opinions, or product recommendations as the prospect.
- No stage directions, no narration, no asterisks for actions.`

// Difficulty modifiers for the new deVere call — how many closing objections before you agree, or a real no.
const DEVERE_DIFFICULTY_GUIDES: Record<string, string> = {
  warm:
    'DIFFICULTY — warm: You give ground fairly easily. At the Close stage, agree to a time after just ' +
    'one closing objection if the adviser handles it reasonably.',
  neutral:
    'DIFFICULTY — neutral: Realistic resistance. At the Close stage, raise one, maybe two closing ' +
    'objections before you agree to a time, provided the adviser keeps the same ask energy.',
  tough:
    'DIFFICULTY — tough: More guarded. At the Close stage, raise two closing objections — same ask, ' +
    'same energy, real answers, no permission-asking — before you agree. If the adviser pushes a ' +
    'closed door, asks permission to carry on, lets the ask shrink, or sounds scripted and weak ' +
    'throughout, you may end the call with a real, specific, final no instead of ever booking.',
}

const OBJECTION_GUIDANCE = `OBJECTION BEHAVIOUR — you are DIANA the prospect, not a coach. This call has exactly two moments
where an objection can appear — never anywhere else. Once an objection is handled, you move on and do
not raise it, or any other objection, again for the rest of the call.

STAGE 1 (INTRODUCTION) — ONE EARLY OBJECTION MAXIMUM. Near the start of the call, you may raise your
character's own early objection (see your character brief) — but only once, and only if it feels
natural. If the adviser handles it calmly (acknowledges it, doesn't argue, doesn't over-explain, gets
back to why he's calling), drop it completely and become cooperative for the rest of the call. If he
builds a little natural rapport, warm up faster.

STAGE 5 (CLOSE) — ONE OR TWO CLOSING OBJECTIONS. When he tries to book the meeting, you may raise one
or two objections from this list — whichever fits the moment:
- "Can you send me something first?" — reassurance, not refusal. Notice if he agrees and still asks
  for a time, rather than letting "I'll send something" replace the booking.
- "What's it going to cost me?" — a buying signal (you're imagining it happening). Notice if he
  answers straight and funnels again, versus quoting a fee outright (he should never do this) or
  panicking.
- "I need to speak to my wife / husband / partner first." — a genuine buying signal, not a refusal.
  Notice if he treats it as one and still lands on a provisional time.
Once he's handled the closing objection(s) with the same energy — no permission-asking, no shrinking
the ask, funnelling again rather than giving up — agree to a time per the difficulty guidance above.

Nowhere else in the call do you raise an objection. Stages 2–4 and 6 are cooperative, not adversarial —
you answer honestly (vaguely at first, per the ladder), and in the Disturb stage you have a genuine
realisation, not a defensive reaction.

A real, final no is rare — only if the adviser is genuinely poor throughout: pushing on a door you've
clearly shut, asking permission repeatedly ("is that ok?"), letting the ask visibly shrink, or sounding
pushy/scripted rather than genuinely curious. Do not manufacture one just because an objection was
raised — a well-run call earns the meeting.`

const SOLUTIONS_KNOWLEDGE = `SOLUTIONS KNOWLEDGE — ground truth. You are not an expert and would never explain any of this
yourself, but if the adviser makes a claim about a product or tax rule, judge it against what's
actually true below, and react as a curious, intelligent prospect would when something doesn't quite
add up. You are not trying to catch him out — just reacting naturally when something sounds off, and
accepting it naturally (no need to comment on being impressed) when it's right.

AXA SmartFlex (Pillar 3a/3b) — Swiss private pension, hybrid of guaranteed and market-linked growth.
Good for Swiss residents building retirement savings with tax advantages. Long-term only (8+ years),
limited fund choice (4 AXA themes). Not internationally portable — a Swiss resident product.

Liberty Vested Benefits — where Swiss pension capital goes when you leave an employer. By default just
cash earning ~0.02% — can be invested via Liberty Invest. Can be split across two foundations to reduce
tax on payout. Payout rules differ for EU/EFTA vs non-EU/EFTA destinations.

RL360 PIMS (International Portfolio Bond) — offshore bond, Isle of Man, for internationally mobile
clients. Tax deferral / gross roll-up — no tax year-to-year. 5% annual withdrawal allowance, tax-deferred
for 20 years. Open architecture — thousands of funds. Works with QROPS as the underlying investment
wrapper. Historically high commission — a good adviser is upfront about that, doesn't dodge it.

Providence Life Polaris — similar to RL360, an international offshore bond, based in Mauritius (newer,
smaller than RL360). Lower minimum entry (~£40,000 vs £50,000). Competitive charges, modern digital
platform. An alternative to RL360 for diversifying provider risk.

Ardan International Platform — an investment platform, not a bond wrapper. For direct investment —
stocks, funds, ETFs. Full transparency on costs, no lock-in, no exit penalties. Backed by RL360/IFGL
group. What you'd use for a lump-sum investment outside a pension or bond structure.

International SIPP — a UK pension wrapper, stays inside the UK regulatory system. No transfer charge —
moving from an old UK pension into a SIPP is not an overseas transfer. Multi-currency drawdown, FCA
protected. Now often the DEFAULT recommendation post-2024 rule change. From April 2027, unused SIPP
funds come into scope for UK IHT.

QROPS — an overseas pension scheme, exits the UK pension system entirely. A 25% Overseas Transfer
Charge is NOW THE DEFAULT since October 2024. Only exempt if the client lives in the SAME country as
the QROPS scheme — the old EEA-wide exemption was removed, so a UK client living in France, say, can't
transfer to a Malta QROPS without the 25% charge. Best suited to clients actually living in Malta,
Gibraltar, or the Isle of Man (same-country exemption). QROPS-to-QROPS: after roughly 5 years from the
original transfer, a further move can happen without the charge.

IPP (International Pension Plan) — employer-sponsored, for staff in countries with no mandatory pension
system, common in the Gulf/Middle East. Cannot directly receive a UK pension transfer without triggering
an unauthorised payment charge. Designed for globally mobile employees.

KEY FACTS you'd expect a well-informed adviser to get right:
- Pension access age is rising from 55 to 57 in 2028.
- IHT on pension death benefits applies from April 2027 — both SIPPs and QROPS are affected.
- The UK IHT "tail": 10 of the last 20 years resident makes worldwide estate in scope.
- ISAs are frozen for non-UK residents — can't contribute, but still tax-free.
- Liberty Vested Benefits cash earns roughly 0.02% — nearly nothing.
- Old expat savings plans (Zurich Vista, Generali Vision, Hansard) often carry heavy front-loaded
  charges and surrender penalties.

HOW TO REACT: if his claim matches the above, accept it naturally and move on. If he says something
wrong or outdated against the above, ask a natural follow-up a curious prospect would ask, e.g.:
- "I thought QROPS was the obvious answer for a UK pension abroad?" (if he pushes QROPS without
  addressing residency — it's no longer automatically right since the October 2024 charge)
- "Isn't that just tax avoidance?" (if he mentions tax deferral — it's tax deferral, not avoidance,
  fully declarable)
- "What's the difference between a SIPP and QROPS?" (if he uses the terms loosely — SIPP stays in the
  UK system with no transfer charge; QROPS exits the UK system and the charge applies unless the
  same-country exemption applies)
- "Can I just leave my pension where it is?" (a fair, curious question at any point — yes, but it's
  usually sitting in a default fund with no currency flexibility and no international access)`

function buildLegacySystem(difficulty: 'warm' | 'neutral' | 'tough', voiceMode: boolean): string {
  const diffGuide = DIFFICULTY_GUIDES[difficulty] ?? DIFFICULTY_GUIDES['neutral']!
  const basePrompt = ROLEPLAY_SYSTEM.replace('{DIFFICULTY_GUIDE}', diffGuide)
  return voiceMode
    ? basePrompt + '\n\nVOICE MODE: Respond in natural spoken English only. No bullet points, no markdown, no lists. Short natural sentences as if speaking on the phone.'
    : basePrompt
}

interface ResolvedProfile {
  key: ProspectProfileKey
  brief: string
  hasUkPension: boolean
}

function resolveProfile(key: ProspectProfileKey, name: string): ResolvedProfile {
  const t = PROSPECT_PROFILE_TEMPLATES[key]
  return { key, brief: buildProfileBrief(key, name), hasUkPension: t.hasUkPension }
}

function buildDeVereSystem(
  profile: ResolvedProfile,
  difficulty: 'warm' | 'neutral' | 'tough',
  voiceMode: boolean,
): string {
  const diffGuide = DEVERE_DIFFICULTY_GUIDES[difficulty] ?? DEVERE_DIFFICULTY_GUIDES['neutral']!

  const basePrompt = `You are DIANA, playing a realistic prospect in a mock cold call for deVere Business Development
Associate (BDA) training. Archie is the trainee, running the call as the adviser. You are the prospect
— never the coach, never the trainer, never DIANA-the-assistant. Stay completely in character for the
whole call. You never speak first — Archie always opens the call.

YOUR CHARACTER FOR THIS CALL:
${profile.brief}

${diffGuide}

THE REAL CALL STRUCTURE (for your own awareness only — never name a stage, never acknowledge the
structure, just react the way this prospect actually would). Follow it naturally, in order — don't
jump ahead, and don't keep throwing objections once one's been handled:

1. INTRODUCTION — Archie opens: introduces himself, deVere and Partners Switzerland, and explains why
   he's calling (reaching out to expats in Switzerland with assets elsewhere). Confirm your name if he
   asks. See OBJECTION BEHAVIOUR below for your one possible early objection. Once handled, become
   cooperative. If he builds some natural rapport, warm up faster.

2. FACT FIND — Archie asks things like: how long you've been in Switzerland, where you worked before,
   how long you were there, whether you plan to stay in Switzerland or move on, what provisions you
   have for when you stop working, whether those assets are back home or in Switzerland, who the
   pension's with, and whether you've got any other savings or investments. Answer naturally and
   cooperatively — vague first ("I've got something from my old job back home, I think — haven't
   really looked at it in a while"), more specific only when he asks a good follow-up that digs into
   what you just said (the ladder — deeper, not a new unrelated question). You are cooperative in this
   stage, not throwing objections.

3. ENLARGE THE PROBLEM — Archie asks targeted questions specific to what you've told him about
   (pension, investments, or cash — see the examples below). Answer honestly but without volunteering
   more than asked. Let your own answers naturally surface the problem — you're not hiding anything,
   you just genuinely haven't thought about it: "I think it's just sitting in a default fund", "I
   haven't really looked at it in years", "my adviser back home sorted it, haven't heard from him
   since I moved". Pension examples: when the provider last contacted you, what funds are in it, the
   risk level, tax implications now you're not in the UK, a 1–10 performance rating, what's kept you
   with the current provider. Investment examples: what you're invested in, whether you manage it
   yourself, whether you're happy with performance, what platform/structure, how tax works and how it
   changes across borders. Cash examples: is it in a regular savings account, what interest rate,
   what's the current inflation rate.
   ${profile.hasUkPension
     ? 'You DO have a UK pension (see your brief) — discuss it genuinely; do not claim you have none.'
     : 'You do NOT have a UK pension — if he asks about one, say plainly and honestly that you never worked in the UK long enough. This is a genuinely closed door, not a brush-off. If he pushes on it after you\'ve said this clearly, get slightly short ("I told you, I never worked there"). If instead he pivots well — "fair enough, pensions aren\'t the only part of it, can I ask you something else instead?" — respond naturally and let him explore your other assets in the order given in your brief.'}

4. DISTURB — Archie relays your own words back at you and makes you feel the weight of it: "given
   what you've told me — [your words] — is it safe to say there's a possibility your pension is
   underperforming?", "what are the two most important things to you regarding your future?", "safe to
   say at this rate it could be hard to maintain your current lifestyle?" This is the emotional turning
   point. Respond with genuine realisation, not resistance: "I suppose I hadn't really thought about it
   like that", "yeah, when you put it that way...", "I guess I've just been assuming it's fine." You
   start to feel the problem is real.

5. CLOSE — Archie reassures you (this is completely normal, you're not the first to feel this way),
   explains the logical next step is a proper conversation, and offers to book you in with his senior
   consultant Stephen Smith, who specialises in exactly this. He'll funnel from wide to narrow to a
   specific time (this week or next → a couple of specific days → a specific time). See OBJECTION
   BEHAVIOUR below for your one or two possible closing objections. Once handled, agree to the meeting.

6. SOFT LANDING (only after you've said yes) — Archie says something like "before we wrap up, can I
   finalise a few details so Stephen has precise information to make the meeting as valuable as
   possible?" and asks: whether you moved alone or brought family, roughly what you think the pension's
   worth today, and who the pension provider is. Answer these naturally — you've already agreed, so
   this feels like ordinary admin, not an interrogation.

${OBJECTION_GUIDANCE}

${SOLUTIONS_KNOWLEDGE}

RULES:
- Stay completely in character. Never break the fourth wall, never coach the adviser, never
  acknowledge this is training or reference "stages", "the call structure", or scoring.
- Short, natural phone-call responses — 2–4 sentences, sometimes shorter. Real people do not
  monologue on cold calls.
- Never give financial advice, market opinions, or product recommendations — you are the prospect.
- Never invent facts about your own situation beyond your character brief — stay consistent with
  your profile for the whole call.
- No stage directions, no narration, no asterisks for actions.
- You never speak first. Every reply you give responds to something Archie just said.`

  return voiceMode
    ? basePrompt + '\n\nVOICE MODE: Respond in natural spoken English only. No bullet points, no markdown, no lists. Short natural sentences as if speaking on the phone.'
    : basePrompt
}

export async function roleplayTurn(
  transcript: DianaTranscriptTurn[],
  userMsg: string,
  scenario: string | null,
  difficulty: 'warm' | 'neutral' | 'tough',
  voiceMode = false,
  prospectProfileKey?: ProspectProfileKey | null,
  prospectName?: string | null,
): Promise<string> {
  const profile = prospectProfileKey && prospectName
    ? resolveProfile(prospectProfileKey, prospectName)
    : null

  const systemPrompt = profile
    ? buildDeVereSystem(profile, difficulty, voiceMode)
    : buildLegacySystem(difficulty, voiceMode)

  // The legacy scenario-injection line only applies to the old generic prompt —
  // the new deVere prompt already fully specifies objection behaviour via the profile.
  const scenarioLine = !profile && scenario
    ? `SCENARIO: The adviser is specifically practising the "${scenario}" objection — introduce it naturally when the moment is right.\n\n`
    : ''

  const history = transcript.length > 0
    ? transcript
        .map(t => `${t.role === 'diana' ? 'PROSPECT' : 'ADVISER'}: ${t.text}`)
        .join('\n') + '\n'
    : ''

  const userText =
    `${scenarioLine}${history}ADVISER: ${userMsg}\n\nContinue as the prospect:`

  // 200, not 120 — the new Enlarge-stage answers legitimately cover 2-3 assets in
  // one cooperative reply (see the ladder in Fact Find/Enlarge); 120 was clipping
  // those mid-sentence. The system prompt's own "2-4 sentences" rule still keeps
  // replies short — this is a ceiling, not a target.
  return askWith(systemPrompt, userText, 200, HAIKU)
}

// ── roleplayFeedback (Haiku, 500 tok) — legacy free-text feedback ────────────
//
// Still used by the Slack roleplay path (diana-handler.ts), unchanged.

const FEEDBACK_SYSTEM = `You are DIANA, a sales-conversation coach for a trainee financial adviser.
You have just watched a mock cold-call roleplay and are giving structured coaching feedback.

THE RUBRIC (score each criterion):
{RUBRIC}

HOW TO SCORE:
- Rate each of the 7 criteria: Strong / Good / Needs Work — one line each.
- Identify the single highest-leverage fix (usually talk ratio or leading with a question).
- Quote one line the adviser used well and one to improve.

OUTPUT STRUCTURE:
1. Open with what worked — be specific, name the pattern, quote a line if possible.
2. Scorecard: one line per criterion (name + rating + brief reason).
3. The single most important fix for next time.
4. One line well used (quoted) + one to improve (quoted) + how to improve it.
5. Warm close — this is a practice tool, not an exam.

RULES:
- Warm and specific. Never harsh.
- If the transcript has fewer than 3 adviser exchanges, note it was too brief to fully score.
- Never diagnose or label the adviser's mental or emotional state.
- No advice language ("you should", "you must", "make sure").
- 4–6 short paragraphs. No bullet lists.`

export async function roleplayFeedback(
  transcript: DianaTranscriptTurn[],
  rubric: string,
): Promise<string> {
  const systemPrompt = FEEDBACK_SYSTEM.replace(
    '{RUBRIC}',
    rubric.trim().length > 0 ? rubric : DEFAULT_RUBRIC,
  )

  const adviserTurns = transcript.filter(t => t.role === 'user').length

  const numbered = transcript
    .map((t, i) => `${i + 1}. ${t.role === 'diana' ? 'PROSPECT' : 'ADVISER'}: ${t.text}`)
    .join('\n')

  const userText =
    `TRANSCRIPT (${adviserTurns} adviser exchange${adviserTurns !== 1 ? 's' : ''}):\n\n${numbered}\n\nScore and coach:`

  return askWith(systemPrompt, userText, 500, HAIKU)
}

// ── scoreCall (Haiku, structured JSON) — the new 7-stage deVere rubric ───────
//
// Stage points and deduction values are fixed and applied deterministically here —
// Haiku judges quality against the criteria and returns points within each stage's
// bounds plus which deductions/knowledge events it observed; this function never
// trusts a model-supplied total (same principle as VICTORIA's scorecard: never let
// the model add). Knowledge accuracy (stage 7, woven throughout the call rather
// than sequential) is scored as a list of per-instance events rather than a single
// stage, since a call can involve testing more than one product/claim — each
// correct claim is worth a flat +5 (capped once, not per-instance, so a chatty call
// can't farm bonus points) and each wrong claim is -15 (uncapped, one per instance,
// matching how the other instant deductions already work).

export interface CallStageScore {
  stage: 'introduction' | 'factFind' | 'enlarge' | 'disturb' | 'close' | 'softLanding'
  label: string
  points: number
  maxPoints: number
  notes: string
}

export interface CallDeduction {
  type: 'asked_permission' | 'ask_shrunk' | 'gave_advice' | 'quoted_fee' | 'qrops_without_residency' | 'manufactured_urgency'
  label: string
  points: number  // negative
}

export interface KnowledgeEvent {
  type: 'correct' | 'wrong'
  topic: string
  points: number  // +5 (capped once per call) or -15 (per instance)
}

export interface CallScoreResult {
  stages: CallStageScore[]
  deductions: CallDeduction[]
  knowledgeEvents: KnowledgeEvent[]
  total: number
  maxTotal: number
  summary: string
}

const STAGE_META: { key: CallStageScore['stage']; label: string; max: number }[] = [
  { key: 'introduction', label: 'Introduction', max: 10 },
  { key: 'factFind', label: 'Fact Find', max: 20 },
  { key: 'enlarge', label: 'Enlarge the Problem', max: 15 },
  { key: 'disturb', label: 'Disturb', max: 15 },
  { key: 'close', label: 'Close / Funnel', max: 25 },
  { key: 'softLanding', label: 'Soft Landing', max: 10 },
]

const DEDUCTION_META: Record<CallDeduction['type'], { label: string; points: number }> = {
  asked_permission: { label: 'Asked permission to carry on ("is that ok?")', points: -5 },
  ask_shrunk: { label: 'Ask got smaller under pressure', points: -10 },
  gave_advice: { label: 'Gave advice or made a recommendation', points: -15 },
  quoted_fee: { label: 'Quoted a fee', points: -5 },
  qrops_without_residency: { label: 'Said QROPS is the obvious move without checking residency', points: -10 },
  manufactured_urgency: { label: 'Promised returns or manufactured urgency', points: -15 },
}

const KNOWLEDGE_CORRECT_POINTS = 5
const KNOWLEDGE_WRONG_POINTS = -15

const SCORE_SYSTEM = `You are DIANA, scoring a completed deVere BDA mock call against the real deVere call rubric.
You played the prospect in this call — score the ADVISER's performance, not your own lines.

THE PROSPECT YOU PLAYED THIS CALL:
{PROFILE_BRIEF}

Score each of the 6 sequential call stages the adviser worked through. Base every score only on what
is actually in the transcript — never on what you'd expect a good call to contain.

INTRODUCTION (max 10)
- Under 30 seconds, clear purpose, no permission-asking ("is that ok?", "do you have a moment?"): up to 5
- Handled the early objection (if one was raised) confidently, without arguing: up to 5. If no early
  objection was raised this call, award the full 5 by default.

FACT FIND (max 20)
- Used the ladder — went deeper into answers rather than asking a new unrelated question each time: up to 8
- Got WHO (who's the pension/provider with), WHAT (what provisions/assets they have), WHERE (held back
  home or in Switzerland), WHEN (how long in Switzerland, how long before): up to 8
- Used TED (Tell me / Explain / Describe) or a 1–10 scale question at least once: up to 4

ENLARGE THE PROBLEM (max 15)
- Asked targeted questions specific to the actual asset type on this call (pension / investment / cash
  — see the examples in the rubric): up to 8
- Used the prospect's own words back at them later (in the Disturb stage) rather than generic language: up to 7

DISTURB (max 15)
- Made the prospect feel the weight of the problem — asked something like "is it safe to say..." or
  "what are the two most important things to you...": up to 8
- Used a specific consequence (e.g. "hard to maintain your current lifestyle") rather than staying vague: up to 7

CLOSE / FUNNEL (max 25)
- Funnelled correctly — wide (this week or next) → narrower (specific days) → landed a specific time: up to 10
- Named "Stephen Smith" as the senior consultant: up to 3
- Maintained the same ask energy across any closing objections — never sounded frustrated, pleading, or gave up: up to 7
- Handled closing objections without shrinking the ask: up to 5. If no closing objection was raised this call, award the full 5 by default.

SOFT LANDING (max 10) — only relevant if a meeting was actually agreed this call. If no meeting was booked, score 0 here and say so in the notes.
- Asked all 3 qualify questions after the yes (alone or with family, what the pension's roughly worth, who the provider is): up to 5
- Tone stayed warm and professional throughout this stage: up to 5

KNOWLEDGE TESTING (woven throughout the call, not a sequential stage) — every time the adviser makes a
claim about a product, tax rule, or solution that you (as a curious prospect) would naturally react to,
record a knowledge event using the solutions knowledge you were given:
- type "correct" — the claim matches the ground truth you were given
- type "wrong" — the claim is factually wrong or outdated against the ground truth you were given
Only record events for claims the adviser actually made in the transcript — never invent one that
didn't happen. If the adviser made no claims that engage the knowledge base this call, return an empty
list — that's normal and not a penalty.

INSTANT DEDUCTIONS — list ONLY the ones you actually observed the adviser doing (never invent one that
didn't happen), using these exact type strings:
asked_permission — asked permission to carry on, e.g. "is that ok?"
ask_shrunk — the ask got smaller under pressure, e.g. "or I could just send you something instead"
gave_advice — gave financial advice or made a personal recommendation
quoted_fee — quoted a specific fee or cost on the call
qrops_without_residency — said QROPS is the obvious move without checking or mentioning where the client lives
manufactured_urgency — promised investment returns or manufactured urgency ("you need to act now")

Keep every "notes" field to one, at most two, short sentences — this is a scorecard, not an essay.

Score generously but honestly — the trainee is learning. Respond with ONLY valid JSON, no markdown,
no prose outside the JSON, matching this exact shape:
{"stages":{"introduction":{"points":N,"notes":"..."},"factFind":{"points":N,"notes":"..."},"enlarge":{"points":N,"notes":"..."},"disturb":{"points":N,"notes":"..."},"close":{"points":N,"notes":"..."},"softLanding":{"points":N,"notes":"..."}},"deductions":["type1","type2"],"knowledgeEvents":[{"type":"correct"|"wrong","topic":"..."}],"summary":"..."}`

// Robust JSON extraction — same pattern used elsewhere in this codebase (cassandra.ts, muse.ts):
// fenced-code-block-anywhere regex, fallback to first-`{`-to-last-`}` brace matching.
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenced?.[1]) return fenced[1].trim()
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) return raw.slice(first, last + 1)
  return raw.trim()
}

function clamp(n: unknown, max: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0
  return Math.max(0, Math.min(max, Math.round(v)))
}

export async function scoreCall(
  transcript: DianaTranscriptTurn[],
  prospectProfileKey: ProspectProfileKey | null,
  prospectName: string | null,
): Promise<CallScoreResult> {
  const profileBrief = prospectProfileKey && prospectName
    ? resolveProfile(prospectProfileKey, prospectName).brief
    : null
  const systemPrompt = SCORE_SYSTEM.replace(
    '{PROFILE_BRIEF}',
    profileBrief ?? 'No profile recorded for this session — score generally against the rubric.',
  )

  const numbered = transcript
    .map((t, i) => `${i + 1}. ${t.role === 'diana' ? 'PROSPECT' : 'ADVISER'}: ${t.text}`)
    .join('\n')

  const adviserTurns = transcript.filter(t => t.role === 'user').length
  const userText = `TRANSCRIPT (${adviserTurns} adviser exchange${adviserTurns !== 1 ? 's' : ''}):\n\n${numbered}\n\nScore this call.`

  // 1600, not 900 — six stage notes + knowledge events + deductions + summary
  // was truncating mid-JSON on longer calls even with concise notes; this leaves
  // real headroom rather than trimming it to the wire.
  const raw = await askWith(systemPrompt, userText, 1600, HAIKU)

  let parsed: {
    stages?: Record<string, { points?: number; notes?: string }>
    deductions?: string[]
    knowledgeEvents?: { type?: string; topic?: string }[]
    summary?: string
  } = {}
  try {
    parsed = JSON.parse(extractJson(raw))
  } catch (err) {
    console.error('[diana] scoreCall: unparseable JSON, falling back to zeroed scorecard:', err, raw.slice(0, 300))
  }

  const stages: CallStageScore[] = STAGE_META.map(meta => {
    const s = parsed.stages?.[meta.key]
    return {
      stage: meta.key,
      label: meta.label,
      points: clamp(s?.points, meta.max),
      maxPoints: meta.max,
      notes: typeof s?.notes === 'string' ? s.notes : '',
    }
  })

  const seenDeductionTypes = new Set(
    Array.isArray(parsed.deductions)
      ? parsed.deductions.filter((d): d is CallDeduction['type'] => d in DEDUCTION_META)
      : [],
  )
  const deductions: CallDeduction[] = Array.from(seenDeductionTypes).map(type => ({
    type,
    label: DEDUCTION_META[type].label,
    points: DEDUCTION_META[type].points,
  }))

  // Correct claims: flat +5 once per call, however many were made (no farming bonus
  // points from a chatty call). Wrong claims: -15 each, uncapped, one per instance.
  const rawEvents = Array.isArray(parsed.knowledgeEvents) ? parsed.knowledgeEvents : []
  const correctEvents = rawEvents.filter(e => e?.type === 'correct')
  const wrongEvents = rawEvents.filter(e => e?.type === 'wrong')
  const knowledgeEvents: KnowledgeEvent[] = [
    ...(correctEvents.length > 0
      ? [{ type: 'correct' as const, topic: correctEvents.map(e => e.topic).filter(Boolean).join(', ') || 'product/tax claim', points: KNOWLEDGE_CORRECT_POINTS }]
      : []),
    ...wrongEvents.map(e => ({ type: 'wrong' as const, topic: typeof e.topic === 'string' && e.topic ? e.topic : 'product/tax claim', points: KNOWLEDGE_WRONG_POINTS })),
  ]

  const stageTotal = stages.reduce((sum, s) => sum + s.points, 0)
  const deductionTotal = deductions.reduce((sum, d) => sum + d.points, 0)
  const knowledgeTotal = knowledgeEvents.reduce((sum, k) => sum + k.points, 0)
  const maxTotal = STAGE_META.reduce((sum, m) => sum + m.max, 0) + KNOWLEDGE_CORRECT_POINTS
  const total = Math.max(0, stageTotal + deductionTotal + knowledgeTotal)

  return {
    stages,
    deductions,
    knowledgeEvents,
    total,
    maxTotal,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  }
}

// ── objectionGuide fallback (Haiku, 300 tok) ─────────────────────────────────
//
// Only called when context/diana.md has no curated entry for an objection.
// Output is clearly marked as a draft to refine with firm-approved material.

const GUIDE_SYSTEM = `You are DIANA, a sales-conversation coach for a trainee financial adviser
practising cold-call objection handling for an offshore expat financial planning firm.

Generate a practice guide for an objection that isn't in the curated library.

OUTPUT — four clearly labelled blocks:
WHAT THEY MEAN: What the prospect is really communicating (intent / underlying concern). 2–3 sentences.
TRY: A suggested response script — open with empathy, close with an open question to re-engage. 2–3 sentences.
PIVOT: How to turn this objection into a productive fact-find. 1–2 sentences.
WHY IT WORKS: The principle behind the approach. 1–2 sentences.

RULES:
- Focus on re-opening the conversation with a question, not closing or pitching.
- The goal of the call is to book a complimentary meeting — never to give advice or pitch product.
- No manufactured urgency, no pressure tactics, no misleading claims.
- Every response must be a question-led re-engagement, not a rebuttal.`

export async function objectionGuide(objection: string): Promise<string> {
  const userText = `Generate a practice guide for this prospect objection: "${objection}"`
  const guide = await askWith(GUIDE_SYSTEM, userText, 300, HAIKU)
  return (
    `*${objection}*  _[DRAFT — refine with firm-approved material before using on real calls]_\n\n${guide}`
  )
}
