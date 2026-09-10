// Default HERMES scenario bank — the 11 new prospecting scenarios plus the
// original 4 persona scripts (src/lib/hermes-default-script.ts DEFAULT_PERSONAS),
// migrated into the same scenario shape as scripts/seed-hermes-scenarios.ts's
// first four entries. Text is verbatim from the brief; only structural
// shape (splitting into fields, deriving `angle`/`product_pathway` for the
// migrated four) required judgment calls — documented inline where made.

import { DEFAULT_PERSONAS, DEFAULT_SHARED, type ScriptLine } from './hermes-default-script'

export interface ObjectionPair {
  objection: string
  response: string
}

export interface ScenarioSeed {
  id: string
  name: string
  angle: string | null
  opener: string
  fact_find_questions: string[]
  enlarge_points: string[]
  disturb_points: string[]
  product_pathway: string
  product_questions: string[]
  close_script: string
  soft_landing: string
  objections: ObjectionPair[]
}

// ── Shared blocks — identical across every scenario, per the brief ─────────

export const CLOSE_SCRIPT = `I can assure you the situation you're in is completely normal —
you're not the first person I've spoken to who feels this way.

The logical next move would be to have a proper conversation.

So today I'd like to book you in with my senior consultant
Stephen Smith — he specialises in exactly this.

When works best — this week or next week?
Morning or afternoon?
I'm looking at his calendar — he's available Wednesday or Friday?`

export const SOFT_LANDING = `Before we wrap up — can I just take a few details so Stephen
has everything he needs to make the meeting as valuable as
possible? Does that seem reasonable?

Did you move on your own or did you bring family?
Roughly what do you believe the pension/assets to be worth today?
Who is the provider/where are they held?`

export const CORE_OBJECTIONS: ObjectionPair[] = [
  { objection: 'Not interested',
    response: "Of course — you don't know me yet. One question, and if there's nothing there I'll leave you alone." },
  { objection: 'Send me an email',
    response: "Happy to — but it'd be generic unless I know your situation. One question so I send you the right thing?" },
  { objection: "I've already got an adviser",
    response: 'Good — that\'s the right answer. When did he last actually call you?' },
  { objection: "I haven't got time",
    response: "I won't keep you. When's genuinely better — beginning or end of the week?" },
  { objection: "What are you selling?",
    response: "Right now, nothing. I'm working out whether there's any reason for you to speak to one of our advisers at all. There may not be." },
  { objection: 'I need to speak to my wife/partner',
    response: 'Of course. Should we get them on the call too, rather than you having to relay it?' },
  { objection: "What's it going to cost me?",
    response: "It depends entirely on what's recommended — that's exactly what the adviser walks you through." },
  { objection: "I'll have a think",
    response: 'What specifically would you want clearer? If it\'s the cross-border side I can answer that in a minute.' },
  { objection: "I'll look over it and come back to you",
    response: "Of course — while I've got you, beginning or end of the week works better for a quick follow up?" },
  { objection: "I'm happy with what I've got",
    response: 'Most people I speak to say that. When did anyone last actually review it with you properly?' },
]

// ── The 11 new prospecting scenarios ────────────────────────────────────────
// `angle` is a short keyword phrase used by hermes-db.ts's matchScenarioToAngle
// to compare against today's CASSANDRA call angle text — not shown verbatim to
// the prospect, just used for the "highlight the relevant scenario" match.

export const NEW_SCENARIOS: ScenarioSeed[] = [
  {
    id: 'new-to-switzerland',
    name: 'New to Switzerland',
    angle: 'recently relocated to Switzerland, new arrival, moved to Switzerland',
    opener: `Good morning/afternoon, is this [name] speaking?

My name is Archie, I'm calling on behalf of deVere and Partners Switzerland.

The reason for my call — I've been reaching out to professionals who have
recently moved to Switzerland. There are a few things that tend to catch
people off guard when they first arrive that are genuinely worth knowing about.

Is that something you'd have 30 seconds to hear?`,
    fact_find_questions: [
      'Roughly how long have you been in Switzerland?',
      'Where in the world were you based before you came here?',
      'How long were you there before moving?',
      'Do you see yourself staying in Switzerland long term, or is this a stepping stone?',
      'When the day comes when you no longer have to work — what provisions do you have in place?',
      'Are those assets held back home or have you brought anything over to Switzerland?',
      'Can you tell me what company the pension was with?',
      'Is there anything else in place — cash savings, investments, anything like that?',
    ],
    enlarge_points: [
      'When was the last time your pension provider contacted you about your pension?',
      'Can you describe what funds are held within it?',
      'Are you aware of the risk level on those funds?',
      "Are you aware of the tax implications now you're no longer living in the UK?",
      'On a scale of 1-10, how would you describe the performance?',
      "What's kept you with your current provider?",
    ],
    disturb_points: [
      "Given what you've told me — [relay their words back] — is it safe to say there's a possibility your pension is underperforming?",
      'What are the two most important things to you regarding your future?',
      'Safe to say at this rate it could be hard to maintain your current lifestyle?',
      'The two things you mentioned may not be achievable if nobody looks at this properly.',
    ],
    product_pathway: 'International SIPP consolidation / Portfolio bond for savings',
    product_questions: [
      "Does your pension provider even know you're no longer living in the UK?",
      'What currency are you planning to draw that pension in?',
      'Are you aware of how cross-border tax works on that pension now?',
      'Where are your savings sitting — what structure are they in?',
    ],
    close_script: CLOSE_SCRIPT,
    soft_landing: SOFT_LANDING,
    objections: CORE_OBJECTIONS,
  },
  {
    id: 'uk-connected',
    name: 'UK Connected',
    angle: 'UK pension, UK savings, UK property held while living in Switzerland, British expat',
    opener: `Good morning/afternoon, is this [name] speaking?

My name is Archie, calling from deVere and Partners Switzerland.

The reason for my call — I've been reaching out to British professionals
based in Switzerland who still have financial ties back in the UK.
There are some things that tend to get missed when you move abroad that
are worth being aware of.

Is that something worth 30 seconds of your time?`,
    fact_find_questions: [
      'How long have you been based in Switzerland?',
      'Do you still have financial ties back in the UK — pension, savings, property?',
      'When did you last review anything you have back home?',
      'Can you tell me what the pension was with?',
      'Are those assets still sitting in the UK or have you done anything with them?',
      'Is there anything else — ISA, cash, investments, property?',
      'Do you plan to go back to the UK at some point or are you here long term?',
    ],
    enlarge_points: [
      'When was the last time anyone from that pension contacted you?',
      'Do you know what it\'s invested in?',
      "Are you aware of how your UK pension is taxed now you're non-resident?",
      'Do you know what the pension is worth today?',
      'Has anyone ever explained how inheritance tax works on UK assets when you live abroad?',
    ],
    disturb_points: [
      "Given that nobody's reviewed this since you left — is it safe to say it's still set up for a life you're no longer living?",
      'What are the two most important things to you for your future?',
      "If nothing changes — what does that look like in 10 years?",
    ],
    product_pathway: 'SIPP consolidation / Portfolio bond / Structured notes',
    product_questions: [
      'Are you aware of the UK inheritance tax changes coming in April 2027 that affect pension holders living abroad?',
      'Do you know what wrapper your savings are sitting in?',
      "Have you ever looked at whether there's a more tax-efficient structure for someone in your position?",
    ],
    close_script: CLOSE_SCRIPT,
    soft_landing: SOFT_LANDING,
    objections: CORE_OBJECTIONS,
  },
  {
    id: 'leaving-switzerland',
    name: 'Leaving Switzerland',
    angle: 'planning to leave Switzerland, relocating abroad, moving away from Switzerland',
    opener: `Good morning/afternoon, is this [name] speaking?

My name is Archie, from deVere and Partners Switzerland.

The reason for my call — I speak to a lot of people who are either
planning to leave Switzerland or have recently left, and there are
a few things around your Swiss pension and assets that are really
worth sorting before you go.

Worth 30 seconds?`,
    fact_find_questions: [
      'Are you still based in Switzerland currently?',
      "Where are you planning to go — or where have you moved to?",
      'How long were you in Switzerland?',
      'Do you have a Swiss pension — either through your employer or a vested benefits account?',
      "Do you know what's happening to your Pillar 2 when you leave?",
      'Do you still have anything back in your home country — pension, property, savings?',
      "What's the timeline — when are you planning to make the move?",
    ],
    enlarge_points: [
      'Do you know what your vested benefits account is currently earning?',
      'Are you aware that by default it sits in cash at around 0.02% interest?',
      "Do you know the tax implications of withdrawing your Swiss pension when you leave — does it depend on where you're going?",
      'Has anyone explained what happens to UK assets you still hold?',
    ],
    disturb_points: [
      "So if I've understood correctly — [relay their situation] — is it fair to say this hasn't been properly looked at?",
      'What are the two most important things to you about this move financially?',
      'If the Swiss pension just sits there doing nothing — what does that cost you over 5 years?',
    ],
    product_pathway: 'Liberty VB invest option / Portable wrapper (RL360/Providence) / SIPP',
    product_questions: [
      'Have you looked at investing your vested benefits rather than leaving them in cash?',
      'Are you aware there are structures specifically designed to hold assets portably as you move between countries?',
      'What currency are you planning to retire in — and how does that affect what you hold and where?',
    ],
    close_script: CLOSE_SCRIPT,
    soft_landing: SOFT_LANDING,
    objections: CORE_OBJECTIONS,
  },
  {
    id: 'restructuring-job-loss',
    name: 'Restructuring / Job Loss',
    angle: 'company restructuring, layoffs, job cuts, redundancies',
    opener: `Good morning/afternoon, is this [name] speaking?

My name is Archie, from deVere and Partners Switzerland.

I've been reaching out to a number of professionals [at company name /
in your sector] — there's been a lot of change recently and it tends
to raise some important questions around people's financial arrangements,
particularly around Swiss pensions and what happens to them in transition.

Worth a quick conversation?`,
    fact_find_questions: [
      'Are you still with [company] currently?',
      'How long have you been there — or how long were you there?',
      'Do you have a Pillar 2 / vested benefits from your time there?',
      "Do you have a sense of what that's worth?",
      "What's the plan — staying in Switzerland, moving on, going back home?",
      'Do you have anything else in place — back home or elsewhere?',
    ],
    enlarge_points: [
      'Do you know what happens to your Pillar 2 now that your employment has ended?',
      "Are you aware what it's currently earning sitting in a vested benefits account?",
      "Have you thought about what you're going to do with it?",
      'Is there anything else that needs looking at given the change in your situation?',
    ],
    disturb_points: [
      'So the pension is just sitting there for now — is that the plan long term?',
      'What are the most important financial priorities for you right now given everything?',
      'If this sits untouched for another year — what does that cost you?',
    ],
    product_pathway: 'Liberty VB invest / RL360 lump sum / SIPP if UK pension also involved',
    product_questions: [
      'Are you aware you can invest your vested benefits rather than leaving them in cash?',
      'Have you thought about consolidating everything into one structure that moves with you wherever you end up?',
      'Do you still have anything back in the UK that also needs attention?',
    ],
    close_script: CLOSE_SCRIPT,
    soft_landing: SOFT_LANDING,
    objections: CORE_OBJECTIONS,
  },
  {
    id: 'iht-pension-angle',
    name: 'IHT Pension Angle',
    angle: 'UK pension inheritance tax April 2027, pensions in estate, IHT changes',
    opener: `Good morning/afternoon, is this [name] speaking?

My name is Archie, from deVere and Partners Switzerland.

The reason for my call — there's a significant change coming to UK pensions
in April 2027 that most British professionals living abroad haven't been told about.
It directly affects anyone with a UK pension, wherever they live.

Worth 30 seconds to explain what it is?`,
    fact_find_questions: [
      'Do you have a UK pension from your time working back home?',
      'When did you last look at it or hear from the provider?',
      "Do you know roughly what it's worth?",
      'Are you aware of the inheritance tax changes coming in April 2027?',
      'Has anyone explained how your estate planning works now you live abroad?',
      'Do you have any other UK assets — property, savings, ISA?',
    ],
    enlarge_points: [
      "So the pension hasn't been reviewed since you left the UK?",
      'Do you know what it\'s invested in currently?',
      'Are you aware your worldwide estate may already be in scope for UK inheritance tax — even though you live in Switzerland?',
      'Has anyone looked at how the April 2027 change affects your specific situation?',
    ],
    disturb_points: [
      "So to summarise — [relay their situation] — nobody's looked at this in the context of the new rules?",
      'What are the two most important things to you about what you leave behind?',
      'If the pension falls into your estate at 40% tax on death — has anyone shown you what that actually means in pounds?',
    ],
    product_pathway: 'SIPP review / Estate planning conversation / Portfolio bond for non-pension assets',
    product_questions: [
      'Are you aware there are pension structures specifically designed for people in your position — outside the UK system but HMRC compliant?',
      'Has anyone ever looked at the most tax-efficient way to hold your UK pension given where you live?',
      'What about the rest of your estate — is that structured efficiently?',
    ],
    close_script: CLOSE_SCRIPT,
    soft_landing: SOFT_LANDING,
    objections: CORE_OBJECTIONS,
  },
  {
    id: 'market-drop-volatility',
    name: 'Market Drop / Volatility',
    angle: 'market drop, volatility, portfolio performance, markets falling',
    opener: `Good morning/afternoon, is this [name] speaking?

My name is Archie, from deVere and Partners Switzerland.

Given what's been happening in the markets recently, I've been
reaching out to people who hold investments to see how things are
sitting and whether the structure still makes sense in this environment.

Worth a quick conversation?`,
    fact_find_questions: [
      'Do you have investments or a portfolio at the moment?',
      'Is this something you manage yourself or is someone looking after it?',
      'How has it held up recently — are you happy with how it\'s performed?',
      'Do you know what you\'re invested in — which funds, which sectors?',
      'What platform or structure are you using?',
      'How does the tax work on that currently?',
      'How would that change if you moved countries?',
    ],
    enlarge_points: [
      'Can you describe what funds or stocks you\'re in?',
      "Are you happy with the performance so far compared to what you expected?",
      "Do you know what you're paying in charges — separately, adviser, platform, fund?",
      'Has the structure been reviewed since markets started moving?',
    ],
    disturb_points: [
      "So the portfolio hasn't been looked at in this context — is that fair to say?",
      'If markets drop another 20% — how does your current structure respond?',
      'What would need to happen for you to feel like something needed looking at?',
    ],
    product_pathway: 'Structured notes (defined outcome, capital protection) / Diversified portfolio bond / Ardan for cost transparency',
    product_questions: [
      "Are you aware there are investment structures that can still generate income even when markets drop — as long as they don't fall below a certain level?",
      "Have you ever looked at the charges you're paying and what they're actually costing you over 10-20 years?",
      'Is your current structure designed for someone living cross-border, or was it set up when you were still back home?',
    ],
    close_script: CLOSE_SCRIPT,
    soft_landing: SOFT_LANDING,
    objections: CORE_OBJECTIONS,
  },
  {
    id: 'second-door-no-uk-pension',
    name: 'Second Door (No UK Pension)',
    // Triggered contextually mid-call (prospect says no UK pension), not from
    // a CASSANDRA news angle — no keyword match target.
    angle: null,
    opener: `[Triggered when prospect says no UK pension / never worked in UK long enough]

Fair enough — pensions aren't the only part of it.

Can I ask you something else instead?

When you think about retirement — what's actually going to fund it?`,
    fact_find_questions: [
      'Do you have any investments at the moment — ISA, trading account, anything set up?',
      'Where is that sitting — what structure?',
      'Who set that up and when did you last hear from them?',
      'Is there anything sitting in cash — here or back home?',
      'How long has that been there?',
      'What was the plan for it when you first put it aside?',
      "What are you waiting for specifically before doing something with it?",
    ],
    enlarge_points: [
      "So it's been sitting there for [X years] — what's it earned in that time?",
      'Are you aware what inflation has done to the real value of that cash?',
      "Has anyone ever looked at whether there's a better structure for it?",
    ],
    disturb_points: [],
    product_pathway: 'Liberty VB invest / RL360 for cash lump sum / Ardan / Structured notes',
    product_questions: [
      'Are you aware there are structures specifically designed for internationally mobile people that hold investments across currencies?',
      "Have you ever looked at what your cash is actually worth in real terms after inflation?",
      "Is there a reason it's been sitting in cash rather than working harder for you?",
    ],
    close_script: CLOSE_SCRIPT,
    soft_landing: SOFT_LANDING,
    objections: CORE_OBJECTIONS,
  },
  {
    id: 'investments-exclusive-access',
    name: 'Investments / Exclusive Access',
    angle: 'institutional investment access, structured notes, high entry point investments',
    opener: `Good morning/afternoon, is this [name] speaking?

My name is Archie, from deVere and Partners Switzerland.

The reason for my call — we work with some institutional-grade investment
structures that most people simply can't access through a regular bank.
The entry point is normally £500,000 or more — but because of the scale
we operate at, our clients can access them from around £10-25,000.

I've been reaching out to professionals in your position who might find
that relevant. Worth 30 seconds?`,
    fact_find_questions: [
      'Do you currently have investments or a portfolio in place?',
      'Can you describe what you\'re invested in?',
      'Is this something you manage yourself or does someone manage it for you?',
      'Are you happy with the performance so far?',
      'Do you know what you\'re paying in charges — adviser, platform, and fund separately?',
      'What platform or structure are you using?',
      'How does the tax work on your current structure?',
      'How would that change if you moved countries?',
    ],
    enlarge_points: [
      'When was the last time someone reviewed the structure with you?',
      "Are you aware of what the charges are actually costing you over 20 years?",
      'Does your current structure follow you if you move again?',
      'Is it designed for someone living cross-border or was it set up back home?',
    ],
    disturb_points: [
      "So nobody's looked at the cost drag on this in [X years]?",
      "If the structure isn't designed for cross-border living — what does that cost you in tax and flexibility?",
      "What would it take for you to feel like it was worth a proper review?",
    ],
    product_pathway: 'Structured notes / Portfolio bond / Ardan platform',
    product_questions: [
      'Have you ever had access to investment structures with defined outcomes — where you know the rules before you invest?',
      'Are you aware of how much cheaper institutional fund share classes are compared to what most people pay retail?',
      'Has anyone ever shown you the full cost breakdown — adviser, platform, fund — separately and what they\'re each getting you?',
    ],
    close_script: CLOSE_SCRIPT,
    soft_landing: SOFT_LANDING,
    objections: CORE_OBJECTIONS,
  },
  {
    id: 'international-professional-non-uk',
    name: 'International Professional (Non-UK)',
    angle: 'international professional, non-UK expat, cross-border assets, financial ties to another country',
    opener: `Good morning/afternoon, is this [name] speaking?

My name is Archie, from deVere and Partners Switzerland.

I work specifically with internationally mobile professionals based in
Switzerland who have financial ties to another country — assets, pensions,
savings that haven't necessarily moved with them.

I've been reaching out to people in your position. Worth a quick conversation?`,
    fact_find_questions: [
      'Where in the world were you based before Switzerland?',
      'How long have you been here?',
      'Do you still have financial ties back home — pension, savings, property?',
      'When did you last do anything with those?',
      "Are you aware of how your home country's tax rules apply to assets held abroad?",
      'Do you plan to stay in Switzerland long term or is this a step along the way?',
      'When retirement comes — where do you see yourself?',
    ],
    enlarge_points: [
      'Has anyone explained how [home country] treats assets held abroad?',
      'Do you know what your pension back home is worth today?',
      'Is it still invested the same way it was when you were living there?',
      'Has anyone reviewed whether the structure still makes sense for someone living in Switzerland?',
    ],
    disturb_points: [
      "So the assets back home haven't been looked at since you left?",
      'What are the two most important financial things to you right now?',
      "If nothing changes for another 5 years — what does that cost you?",
    ],
    product_pathway: 'Portfolio bond / Liberty VB / Ardan / SIPP if any UK connection',
    product_questions: [
      'Are you aware there are structures specifically designed for internationally mobile people that hold assets across currencies and jurisdictions?',
      'Has anyone looked at the most tax-efficient way to hold your assets given where you live now?',
      'What currency are you planning to retire in — and does your current structure reflect that?',
    ],
    close_script: CLOSE_SCRIPT,
    soft_landing: SOFT_LANDING,
    objections: CORE_OBJECTIONS,
  },
  {
    id: 'cash-pile',
    name: 'Cash Pile',
    angle: 'large cash holdings, sitting in cash, inflation erosion, multiple currencies cash',
    opener: `Good morning/afternoon, is this [name] speaking?

My name is Archie, from deVere and Partners Switzerland.

The reason for my call — a lot of the professionals I speak to in Switzerland
are holding significant amounts in cash across multiple currencies.
It feels safe, but it's actually one of the most expensive things you
can do long term once you factor in inflation.

Worth 30 seconds to explain what I mean?`,
    fact_find_questions: [
      'Do you have savings or cash sitting anywhere at the moment?',
      'Roughly how much — and across how many currencies?',
      'How long has it been sitting there?',
      "What's it earning at the moment?",
      'What was the plan for it when you first set it aside?',
      "What are you waiting for specifically before doing something with it?",
      'Do you have anything invested alongside that or is it mainly cash?',
    ],
    enlarge_points: [
      "Do you know what inflation has been running at while that's been sitting there?",
      "So in real terms — what's actually happened to the value of that money?",
      "Has anyone ever shown you what that cash is actually worth in purchasing power terms in 10 years at current inflation?",
    ],
    disturb_points: [
      "So the cash has been sitting there for [X time] effectively going backwards in real terms — is that a deliberate decision or has it just never been looked at?",
      'What are the two most important things to you financially?',
      "If you'd invested that [X years] ago — what might it look like today?",
    ],
    product_pathway: 'Structured notes for income / Portfolio bond / Ardan',
    product_questions: [
      'Have you ever looked at structures that give you a defined return — so you know exactly what you\'ll get and under what conditions?',
      'Are you aware there are tax-efficient wrappers that let your money grow without paying tax on it every year?',
      'What would you need to see to feel comfortable putting some of that cash to work?',
    ],
    close_script: CLOSE_SCRIPT,
    soft_landing: SOFT_LANDING,
    objections: CORE_OBJECTIONS,
  },
  {
    id: 'repatriation-to-uk',
    name: 'Repatriation to UK',
    angle: 'returning to the UK, repatriation, moving back to the UK',
    opener: `Good morning/afternoon, is this [name] speaking?

My name is Archie, from deVere and Partners Switzerland.

The reason for my call — a lot of people planning to return to the UK
don't realise how their time abroad affects their tax position when they
land back. There are a few things worth getting right before you return
that can make a significant difference.

Worth 30 seconds?`,
    fact_find_questions: [
      'Are you planning to return to the UK at some point?',
      "What's the timeline — roughly when?",
      'How long have you been abroad in total?',
      'Do you have any investments or savings set up while you\'ve been away — offshore bonds, portfolios, anything like that?',
      'Do you have a UK pension from before you left?',
      'Do you still own property in the UK?',
      'Has anyone looked at your situation in the context of returning?',
    ],
    enlarge_points: [
      'Are you aware of how time-apportionment relief works when you return — and how it reduces the tax on offshore investments?',
      'Do you know your UK inheritance tax position — even though you\'ve been living abroad?',
      'Has anyone explained what happens to your offshore investments when you become UK resident again?',
      'Do you know what the pension is worth and whether it\'s in the right structure?',
    ],
    disturb_points: [
      "So nothing has been reviewed in the context of returning?",
      'If you land back in the UK without this sorted — what does that cost you?',
      'What are the two most important financial things to get right before you go back?',
    ],
    product_pathway: 'Portfolio bond (time-apportionment relief) / SIPP consolidation before return',
    product_questions: [
      'Are you aware that the longer you hold an offshore bond while non-resident, the lower your UK tax bill is when you eventually cash it in?',
      "Have you looked at whether your pension is in the right structure before you become UK resident again?",
      'Is your estate set up efficiently for your return — or was it structured for living abroad?',
    ],
    close_script: CLOSE_SCRIPT,
    soft_landing: SOFT_LANDING,
    objections: CORE_OBJECTIONS,
  },
]

// ── The original 4 persona scripts, migrated into scenario format ──────────
// Field mapping (the legacy Persona shape has no 1:1 match to the new
// schema, so this is a judgment-call adaptation, not a verbatim port):
//   intro                       -> opener
//   opener (the old fact-find Qs list) -> fact_find_questions
//   drawers.{pension,investments,cash} -> enlarge_points (flattened, .q text only)
//   DEFAULT_SHARED.disturb       -> disturb_points (same shared list every legacy persona used)
//   *Pivot fields                -> product_pathway (combined) / product_questions
//   CLOSE_SCRIPT / SOFT_LANDING  -> same identical blocks as the new scenarios
//   CORE_OBJECTIONS              -> same shared set as the new scenarios

function lineText(line: ScriptLine): string {
  return typeof line === 'string' ? line : line.q
}

function buildMigratedScenario(id: string, personaKey: keyof typeof DEFAULT_PERSONAS): ScenarioSeed {
  const p = DEFAULT_PERSONAS[personaKey]
  const enlargePoints = [
    ...p.drawers.pension.map(lineText),
    ...p.drawers.investments.map(lineText),
    ...p.drawers.cash.map(lineText),
  ]
  const pivots = [p.pensionPivot, p.investmentsPivot, p.cashPivot].filter((v): v is string => Boolean(v))
  return {
    id,
    // " (Legacy)" suffix avoids a confusing duplicate name with the new
    // scenarios of the same underlying topic (e.g. "New to Switzerland" is
    // both a legacy persona and one of the 11 new scenarios) — not specified
    // in the brief, added so the scenario list is actually navigable.
    name: `${p.label} (Legacy)`,
    angle: null,   // general personas, not tied to a CASSANDRA news event
    opener: p.intro,
    fact_find_questions: p.opener,
    enlarge_points: enlargePoints,
    disturb_points: DEFAULT_SHARED.disturb,
    product_pathway: pivots.length > 0 ? pivots.join('\n\n') : 'No specific product pathway recorded for this legacy persona.',
    product_questions: [],
    close_script: CLOSE_SCRIPT,
    soft_landing: SOFT_LANDING,
    objections: CORE_OBJECTIONS,
  }
}

export const MIGRATED_PERSONA_SCENARIOS: ScenarioSeed[] = [
  buildMigratedScenario('legacy-generic', 'generic'),
  buildMigratedScenario('legacy-uk', 'uk'),
  buildMigratedScenario('legacy-new-ch', 'new_ch'),
  buildMigratedScenario('legacy-leaving-ch', 'leaving_ch'),
]

// Migrated four first, then the 11 new scenarios — per the brief's ordering.
export const ALL_SEED_SCENARIOS: ScenarioSeed[] = [...MIGRATED_PERSONA_SCENARIOS, ...NEW_SCENARIOS]
