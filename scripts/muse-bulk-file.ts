// One-off script: bulk-file the deVere training documents directly into MUSE
// as active entries. Pure DB writes — no Claude/Haiku calls, no cost.
// Run: npx tsx --env-file=.env scripts/muse-bulk-file.ts

import { saveEntry } from '../tools/muse'

const entries = [

  // TRAINING SECTOR
  {
    sector: 'Training',
    title: 'What is Wealth Management — deVere Week 1',
    summary: 'Wealth management is coordinating a person\'s whole financial life against their goals. Clients are internationally mobile people whose financial life outgrew their advice. PEPSI priority order: Protection, Estate Planning, Pensions, Savings, Investment.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
What is Wealth Management
Trainee handout · Week 1 · Day 1

WHAT YOU SHOULD NOW BE ABLE TO DO
Explain, in one sentence and without jargon, what wealth management is and what our clients need from us — and describe your own role accurately.

KEY LEARNING POINTS

1. Wealth management is the whole picture, not a product.
A bank sees an account. An accountant sees a tax return. An employer sees one pension. Nobody sees the person. Wealth management is the discipline of being the one who does — coordinating someone's entire financial life against what they actually want — and then putting the decisions in a sensible order.

2. Our clients' problems come from moving, not from mistakes.
Internationally mobile people build a financial life in one country, then leave. Nothing rearranges itself to follow. The result is predictable: pensions left behind and never reviewed, assets and income in different currencies, tax residency that's genuinely hard to get right, and estate arrangements that don't travel across legal systems.
They are rarely badly advised. They are usually un-advised, in a life that outgrew the advice.

3. These problems are quiet until they aren't.
Nothing looks wrong from the outside. The cost surfaces at retirement, on death, or when a tax authority asks a question — by which point it's expensive. Stated plainly, this is persuasive on its own. It never needs exaggerating, and we don't exaggerate it.

4. Investment comes last, not first.
The order of advice runs Protection → Estate Planning → Pensions → Savings → Investment (PEPSI). There's little sense growing money that isn't protected, or investing around a pension nobody has looked at. Anyone who opens with investment has misunderstood the job.

5. What deVere offers — and what it's an answer to.

Pillar: Scale — 100,000+ clients, $14bn under management
What it means for a mobile client: We're still there when they move. Continuity, not size for its own sake.

Pillar: Local licences — 30+ of them, across 100+ regulated entities
What it means for a mobile client: Licensed in the jurisdictions we operate in, rather than passporting one licence across borders — which means local protections and local dispute resolution.

Pillar: In-house asset management
What it means for a mobile client: Institutional access and institutional pricing.

Pillar: Structured products
What it means for a mobile client: Institutional-grade structures at retail entry points, with defined outcomes and defined risks.

Pillar: Not tied to one provider
What it means for a mobile client: The recommendation follows the client, not a product shelf.

Pillar: Global servicing and reviews
What it means for a mobile client: The relationship doesn't end at the sale, and it travels with them.

These are answers to challenges, not a script. Recited unprompted they sound rehearsed. Used in response to a real question, they sound like competence.

6. Your role: you are not the adviser — and you're not expected to be.
The chain is you → adviser → client outcome. Your job is to find people with a real problem and open a good conversation. Advice is a regulated activity and it belongs to the adviser.
This matters more than it sounds. You will be asked things you cannot answer — constantly, and from day one. "That's exactly what the adviser will look at properly" is not a failure or a dodge. It is the correct professional answer. You are not expected to know everything. You are expected to ask well, and to be straight about what you don't know.

TWO THINGS TO BE CAREFUL WITH
Never make a performance claim. "Designed to" is not "will." Structured products carry capital risk and counterparty risk, and no product can be described as protecting someone's money. Overclaiming is a far more serious error than forgetting a fact — and nobody has ever been criticised for saying "I'd need to check that properly."
Never inflate a client's problem. The problems are real, and they're persuasive stated plainly. Nothing is gained by making them sound worse than they are, and a great deal is lost.

KEY TERMS
Wealth management — Coordinating a person's whole financial life against their goals — not selling a product.
Expatriate / internationally mobile client — Someone living, earning or holding assets outside their home country — usually across more than one jurisdiction.
Jurisdiction — A country or territory with its own laws, tax rules and regulator.
PEPSI — The priority order of advice: Protection, Estate Planning, Pensions, Savings, Investment.
Structured product — An investment with a defined outcome linked to a market — with defined risks, including capital and counterparty risk.
Regulated advice — A personal recommendation, which may only be given by a qualified, authorised adviser.

BEFORE THE NEXT SESSION
Write down your one-sentence answer to "so what do you actually do?" — no jargon, no product names, and starting from the client's problem rather than from us. Say it out loud until it sounds like something you'd actually say to a friend, rather than something you memorised.
You'll use that sentence more than any other this year. It's worth getting right.

This document is training material and is not financial advice. Firm figures are correct at the time of writing and should be verified before use with clients.`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Training',
    title: 'Problems Clients Face — PEPSI Framework',
    summary: 'Five drawers for every client problem: Protection, Estate Planning, Pensions, Savings, Investment. Tax and borders are the multiplier on all of them, not separate problems. Problems are silent until expensive.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
Problems Clients Face
Trainee handout · Week 1 · Day 1

WHAT YOU SHOULD NOW BE ABLE TO DO
Name the problems our clients actually face, file any of them under the right stage of advice, and ask a good question about one — without reaching for a solution.

KEY LEARNING POINTS

1. You built the list yourself.
Everything on the board came from the room. That's worth noticing: an hour into the job, you could already describe most of what our clients are dealing with. The technical detail comes later. The instinct is already there.

2. PEPSI — the order of advice.
Every problem a client has files under one of five headings, and they run in priority order:

P — Protection: Cover that doesn't follow you abroad. The family is exposed and nobody has noticed.
E — Estate Planning: Wills don't travel. Succession rules differ — some countries override the will entirely.
P — Pensions: Left behind, never reviewed, invested for a life the client no longer lives.
S — Savings: Cash sitting still, in the wrong currency, quietly losing value.
I — Investment: Poor diversification — often everything in one asset, one country, one currency.

The order is deliberate. Protection comes first because there's no sense building wealth that a single event can wipe out. Investment comes last. Anyone who opens a client conversation with investments has started at the bottom of the list.
You will never need to memorise a list of problems. You need five drawers — and everything a client tells you goes in one of them.

3. Tax and borders aren't on the list. They're around it.
This is the one to hold on to.
Cross-border complexity and tax are not two more problems sitting alongside the others — they are the multiplier on all of them. A pension is an ordinary problem. A pension held in one country, by a tax-resident of a second, who plans to retire in a third, with a spouse who's a national of a fourth, is something else entirely.
Our clients don't have more problems than someone who never left home. They have the same problems, entangled across several countries. That's why a domestic adviser genuinely cannot help them — and it's why this firm exists.

4. The problems are silent.
Nothing is on fire. Nothing looks wrong. The client believes he's fine — and "fine" usually means nothing has visibly gone wrong yet. The cost appears at retirement, on death, or when a tax authority asks a question, by which point it's expensive and often irreversible.
This changes what a first conversation is. You are not interrupting someone who is desperate for a solution. You are telling someone something true that they have never looked at. That is a different conversation — and an easier one to have.

5. Your job is the question, not the answer.
When a client says "I've got a pension somewhere from my old job" — the word doing all the work is "somewhere." The right response is not a solution. It's a better question.
You are not the adviser, and you're not expected to be. Noticing the problem and naming it is what earns the meeting. Solving it is someone else's job.

ONE THING TO BE CAREFUL WITH
True beats dramatic. These problems are real, and stated plainly they are persuasive. They never need inflating. Manufactured urgency — "you could lose everything", "you need to act before the rules change" — is a conduct issue, not a technique.
A calm, specific, true observation lands harder than a scare. It's also the only version that survives being repeated back to a compliance officer.

KEY TERMS
PEPSI — The priority order of advice: Protection, Estate Planning, Pensions, Savings, Investment.
Tax residency — The country with the right to tax you — determined by rules, not by where you feel you live.
Forced heirship — Rules in some countries that dictate who must inherit — overriding what a will says.
Concentration risk — Too much wealth in one asset, one country or one currency.
Currency (FX) risk — Earning, holding or spending in different currencies, so exchange-rate moves change what you actually have.
Succession — How wealth passes on death — which differs fundamentally between legal systems.

BEFORE THE NEXT SESSION
Pick one person you know who lives or has worked abroad. Run their situation through the five drawers — Protection, Estate, Pensions, Savings, Investment — and see how many you can't confidently fill in.
That gap, on someone you actually know, is the job.

This document is training material and is not financial advice.`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Training',
    title: 'UK Pensions — DC vs DB, The System',
    summary: 'DC = your pot, your risk, your flexibility. DB = their promise, their risk, no flexibility. State pension frozen abroad outside EEA/Switzerland. CETV, PPF, drawdown explained. Pension access age rising to 57 in 2028.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
UK Pensions — The System
DC vs DB. The plumbing. Week 1 · Day 1 · Keep this — you'll use it every day of the course.

THE WHOLE THING IN ONE LINE
DC = your pot. DB = their promise. Understand that one distinction and everything else is detail.

WHAT A PENSION ACTUALLY IS
A tax-wrapped pot of money for retirement. Four things worth knowing:
- The tax relief is the point. For a 40% taxpayer, £60 out of your pocket becomes £100 in the pension. Nothing else does that.
- Locked until age 55 (rising to 57 in 2028).
- Grows tax-free inside the wrapper — no tax on gains or dividends while it sits there.
- Two main UK workplace types: DC and DB.

DC — DEFINED CONTRIBUTION: A POT YOU BUILD
Money goes in, gets invested, grows or shrinks with markets. At retirement you have a pot, and what you do with it is up to you.
The risk sits with you. Markets fall, your pot falls.

Stage — In: You (~5%) + employer (~3%) + tax relief. Auto-enrolment since 2012 — most people have one per job.
Stage — Invested: Trustee picks funds. Almost everyone is in the default fund — auto-enrolled, never chose it. The default is defensible, not optimal.
Stage — Out: 25% tax-free (capped £268,275), the rest taxed as income. Three options: annuity, drawdown, or lump sums.

DB — DEFINED BENEFIT: A PROMISE, NOT A POT
The employer promises a guaranteed income for life, set by a formula. It doesn't matter what markets do — the income is owed.
The risk sits with the scheme, not you.

How the income is worked out: Years of service × Accrual rate × Salary. Example: 20 years × 1/60th × £60,000 = £20,000 a year, for life.

What DB looks like:
- Usually starts at 60–65 — penalties for early access.
- Fixed income, usually inflation-linked but often capped (2.5–5%).
- Paid in GBP.
- Death benefits: typically around 50% to a spouse — and often nothing beyond that.
- No investment choice and no upside — certainty is the whole product.

A few terms you'll hear:
- CETV (Cash Equivalent Transfer Value) — the cash figure a DB scheme can be exchanged for. Roughly 20× the annual income.
- PPF (Pension Protection Fund) — the safety net if an employer becomes insolvent. Pays reduced, capped benefits.
- Funding level / deficit — whether the scheme has enough set aside to keep its promises.

THE STATE PENSION — TWO THINGS WORTH KNOWING
- Full new State Pension (2026/27): £241.30 a week (~£12,547 a year). Needs 35 qualifying NI years for the full amount.
- It's frozen abroad unless you live in the EEA, Switzerland, or a country with a social-security agreement with the UK. In much of the world — the UAE, Canada, Australia — it stops rising once you start drawing it.

THE CONTRAST TO REMEMBER
What it is — DC: A pot. DB: A promise.
Who carries the risk — DC: You. DB: The scheme.
Flexibility — DC: High. DB: None.
On death — DC: The pot can pass on. DB: ~50% to spouse, often then nothing.
The catch — DC: No guarantee. DB: No upside, no flexibility, paid in GBP.

DC = your pot, your risk, your flexibility, your problem. DB = their promise, their risk, no flexibility, their problem.

WHERE YOU FIT
Your job isn't to advise on pensions, recommend a transfer, or work out what someone should do — that's the adviser's role, and DB transfers in particular are heavily regulated.
Your job is to understand the system well enough to have a real conversation — to recognise what a client has, spot what they may not have looked at, and open the door to someone who can help.
"I don't know, but I know who does" is a perfectly good answer.

This document is training material for deVere Business Development Associates. It is not advice and is not for client distribution. Figures are 2026/27 UK tax year.`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Training',
    title: 'Compounding — The Engine',
    summary: 'Rule of 72: 72 ÷ growth rate = years to double. Time matters more than money. Charges cost more than they look — 0.5% a year over 20 years is significant. Doing nothing is not the safe option.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
Compounding — The Engine
Trainee handout · Week 1 · Day 2

WHAT YOU SHOULD NOW BE ABLE TO DO
Explain why compounding is far more powerful than almost anyone expects, double a number in your head, and describe what delay and charges cost over time.

KEY LEARNING POINTS

1. Your intuition is wrong — and so is everyone else's.
Asked to sketch £10,000 growing at 8% a year for 40 years, almost everyone draws something close to a straight line. The illustrative answer is around £217,000 — of which only £10,000 was ever paid in.
Humans think in straight lines. Compounding doesn't work in straight lines. That gap isn't a detail — it's the whole subject.

2. It isn't that money grows. It's that the growth grows.
In year one, 8% applies to £10,000. In year thirty, the same 8% applies to a much larger number and does far more work. The percentage never changes. The base does.

3. The Rule of 72 — the one calculation worth memorising
72 ÷ the annual growth rate ≈ the number of years for money to double.
Growth rate 6% doubles roughly every 12 years. Growth rate 8% doubles roughly every 9 years. Growth rate 10% doubles roughly every 7.2 years.
It's the only compounding maths you can do live, in conversation, without a calculator.

Example: someone aged 45 retiring at 69 is 24 years away. At around 6%, money doubles roughly every 12 years — so, illustratively, two doublings.
Always describe this as an illustration of how doubling works. It is not a projection of what anyone will actually have, and it should never be presented as one.

4. Time matters more than money
Two savers, both assumed to grow at 7% a year:
Saver A: Pays in £200/month from 25 to 35, then stops entirely. Total paid in £24,000. Illustrative value at 65: £260,000.
Saver B: £200/month from 35 to 65, without missing a month. Total paid in £72,000. Illustrative value at 65: £234,000.
Saver A pays in a third as much, stops at 35, never contributes again — and still ends up ahead.
The ten years at the start were worth more than the thirty years of payments that followed. That is the most important idea in this session.

5. Charges cost more than they look
A charge doesn't only cost you the charge. It costs you the charge and everything that money would have earned afterwards.
£500,000 over 20 years, assumed 6% growth:
No additional annual cost: illustrative ~£1.60m.
0.5% a year in additional cost: illustrative ~£1.46m.
1.0% a year in additional cost: illustrative ~£1.33m.
Half a percent a year sounds like very little. Over twenty years, it isn't. This is a comparison of costs, not a projection of returns.

6. Doing nothing is not the safe option
On realistic numbers, waiting typically costs more than paying higher charges.
This is worth sitting with. Someone who leaves a pension untouched for another ten years usually isn't choosing between acting and not acting. They're choosing between two costs — and, without realising it, they've picked the larger one.
For internationally mobile clients this matters more than most, because the delay has usually already been running for years.

HOW TO USE THIS
The most useful thing you can do with any of it is ask, and then listen:
- How long has that been sitting there?
- When were you planning to look at it?
- Do you know what you're paying — adviser, platform and fund, separately? And what has it got you?

These questions work because the arithmetic is genuinely on your side. Show the maths, ask a fair question, and let people reach their own conclusions. None of it needs exaggerating, and it should never be used to hurry someone into a decision.
And if a client asks what we charge — that is a fair question and it deserves a straight answer. Tell them, clearly, and offer to set it out line by line. Being the person who does that is worth more than any argument about someone else's fees.

KEY TERMS
Compounding — Growth earning growth. Returns are added to the pot and then themselves earn returns.
Simple interest — Growth on the original amount only. Far weaker over time.
Rule of 72 — 72 ÷ growth rate ≈ years to double. An approximation, not a forecast.
Annual charge — A yearly cost, usually a percentage of the amount invested.
Cost drag — The compounding effect of charges — the amount lost, plus everything it would have earned.

BEFORE THE NEXT SESSION
Take any number you like — an old pension, a savings balance, a hypothetical £10,000 — and use the Rule of 72 to work out how many times it would double before you turn 65.
Then work out how many doublings you'd lose by starting ten years later.
That second number is the one worth remembering.

This document is training material and is not financial advice. All figures are illustrative, assume constant rates of growth, and are not projections. Actual investment returns vary and are not guaranteed.`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Training',
    title: 'Why deVere — The Three Questions',
    summary: 'Three questions in order: Why do anything? Why pay for advice? Why this firm? Institutional structured products from £10k-£25k. Local licences across 30+ jurisdictions. Advice that follows the client. Whole of market.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
Why deVere
Trainee handout · Week 1 · Day 2

WHAT YOU SHOULD NOW BE ABLE TO DO
Explain what deVere offers that others structurally cannot — and ask a client a fair question that helps them see their own situation more clearly.

THREE QUESTIONS, IN ORDER
A client has to answer three questions before any of this matters, and they come in sequence:
1. Why do anything at all? — do I actually have a problem?
2. Why pay for advice? — what does a professional add that I couldn't do myself?
3. Why this firm? — and why not the one that called me last week?

Most people new to this work start at three, because it's what they've just learned and it's what they're proudest of. It doesn't land — because nothing underneath it has been established yet. The third question only matters once the first two are answered.

WHAT WE CAN OFFER

Access most advisers don't have
Institutional structured products typically require minimum allocations of £50–100 million from the issuing bank. That's the entry price. Most advisers cannot meet it — not through lack of interest, but because they cannot aggregate that level of demand.
deVere pools demand across its client base, which means these become available from £10,000–£25,000, rather than the £500,000+ typically required to deal directly with a private bank.
These products have defined outcomes and defined risks. Capital is at risk. There is counterparty risk. They are a component within a diversified portfolio — not a strategy in themselves.

Costs, and why they matter more than they look
Scale allows access to institutional fund share classes, typically 0.5–1.0% a year cheaper than retail equivalents.
That sounds small. Over a long horizon it isn't:
£500,000 over 20 years at 6% — No additional annual cost: illustrative ~£1.60m. 0.5% a year additional cost: illustrative ~£1.46m. 1.0% a year additional cost: illustrative ~£1.33m.
The same compounding that builds wealth also erodes it. Half a percent a year is not a small number over twenty years. This is a cost comparison, not a projection of returns.

Advice that can follow the client
This is the structural point, and it's worth understanding properly.
Advising a client legally requires a licence in the country where they live. In practice:
- A home-country adviser usually cannot continue advising once the client has moved abroad.
- A local expat adviser usually cannot follow them when they move on again.
deVere holds local licences across 30+ jurisdictions, which allows continuity — the same firm, the same portfolio, the same records, as a client moves. It also means local regulatory recourse: if something goes wrong, the client raises it with the regulator in their own country.
This matters most at the points where people are least well served — including repatriation, when a client comes home and discovers their expat adviser cannot help and a domestic adviser could not advise them until they landed.

Whole-of-market advice
deVere holds no ownership stake in any product provider, and fees are disclosed line by line. A recommendation follows the client's circumstances rather than a restricted product range.
We are not the only independent firm, and it would be wrong to claim otherwise. The meaningful contrast is with the restricted arrangements many internationally mobile clients have been placed into without realising.

QUESTIONS WORTH ASKING
The most useful thing you can do in a first conversation is ask a fair question the client has never been asked. Not to catch them out — but because the answer is genuinely useful to them.
- When did you last speak to your adviser?
- Can they recommend a product from any provider, or are they restricted to a range?
- What happens to your arrangement if you move country again?
- Do you know what you're paying — adviser, platform and fund, separately?
- Who chose the fund your pension is invested in?

These work because they are true, fair, and reasonable — and because most people have never been asked them and don't know the answers. Ask, then listen. The client's own reflection is worth more than anything you could tell them.

ONE PRINCIPLE TO HOLD ONTO
The truth is already impressive. Specific, verifiable facts are more compelling than superlatives — and they hold up when challenged. A precise number is stronger than a strong adjective.
The same applies to risk. Explaining plainly how a client could lose money is not a weakness in a conversation. It is often the reason they decide to trust you.

KEY TERMS
Institutional share class — A cheaper version of the same fund, available only to large investors.
Platform fee — A charge for the system that holds and administers investments — a layer above the fund's own charge.
Structured product — An investment with a defined outcome linked to a market, with defined risks — including capital and counterparty risk.
Counterparty risk — The risk that the institution behind a product fails to meet its obligations.
Licence / passporting — Permission to advise in a country. A licence from one country does not always work in another.
Whole of market — Able to recommend from any provider, rather than a restricted range.

BEFORE THE NEXT SESSION
Pick the firm's strongest point — the one you'd actually want to tell someone about — and write it in one sentence, with a number in it.
Then write the question you'd ask a client that would make them want to hear it.
The question matters more than the sentence.

This document is training material and is not financial advice. Figures are illustrative and are not a projection of returns. Firm figures should be verified before use with clients.`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Training',
    title: 'Asset Classes — The Four Boxes',
    summary: 'Every investment judged on Returns, Liquidity, Security, Simplicity. Nothing is good at all four. The grid: Cash, Government bonds, Corporate bonds, Equities, Property, Gold, Alternatives. Find the cash pile.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
Asset Classes — The Four Boxes
Trainee handout · Week 1 · Day 3

THE ONE IDEA
Every investment ever created is judged on four things:
RETURNS · LIQUIDITY · SECURITY · SIMPLICITY
Returns — How much does it grow, or pay me?
Liquidity — How fast can I turn it back into money without losing value?
Security — How likely am I to get my capital back?
Simplicity — Could he explain it to his wife in one sentence?
Simplicity is not a nice-to-have. If a client can't explain what he owns, he doesn't understand it — and he'll sell it at the worst possible moment, which is exactly when it's falling.

WHAT EACH ONE ACTUALLY IS
Cash. Money in a bank account. Pays interest. Doesn't grow — and what it buys shrinks.
Government bonds. You lend to a government. They pay you interest and return your money on a fixed date.
Corporate bonds. The same, but lending to a company. They pay more, because they're more likely to fail to pay you back.
Equities. You own a piece of a company. If it does well, you do well. Share price plus dividends.
Property. A building. Rent, plus the price going up.
Gold. A lump of metal. You make money if someone will pay more for it than you did. That's the whole mechanism.
Alternatives. The bucket for everything else — hedge funds, private equity, infrastructure, commodities.

THE GRID (Returns / Liquidity / Security / Simplicity)
Cash: poor returns (loses to inflation) / very strong liquidity / mixed security (secure against falling, not against inflation) / strong simplicity.
Government bonds: middling returns / strong liquidity / mixed security / middling simplicity.
Corporate bonds: middling returns / strong liquidity / poor security / poor simplicity.
Equities: strong returns / strong liquidity / poor security / good simplicity.
Property: good returns / very poor liquidity / mixed security / good simplicity (illusory — see below).
Gold / commodities: no income / strong liquidity / poor security / good simplicity.
Alternatives: good returns / poor liquidity / poor security / very poor simplicity.

THE POINT OF THE GRID
Some things score well on three of the four. Cash does. So do gilts, if you hold them to maturity. That's fine and it's correct.
What matters is that every single row has a cross in it.
Nothing on that board is good at all four. Every one of them is strong somewhere and weak somewhere — and the weak bit is almost always the part nobody ever told him about.
He didn't choose the weakness. He just didn't know it was there.
Every investment is a trade. The only question is what he traded away — and whether anyone ever mentioned it.

THE CELLS WORTH UNDERSTANDING

Cash → Security. Secure against what?
Against falling? Yes. Completely.
Against still buying what he needs in twenty years? No.
Rule of 72: 72 ÷ 3% inflation = 24 years to halve in buying power.
And the subtraction nobody makes: 4% in the bank − 3% inflation = 1%, before tax. He thinks he's getting four.
"Doesn't move" is not the same as "safe." Cash minimises the risk he can see, and maximises the one he can't.
Security is the only word in the grid that means two different things depending on when he needs the money. That's why the adviser asks when before anything else — and why risk is not a property of an asset. It's a property of an asset against a purpose.

Equities → Simplicity. The surprise.
"You own a bit of a company. If it does well, you do well." One sentence. Equities are the simplest thing in the grid.
The complicated ones are corporate bonds and hedge funds — and nobody thinks they are. That's how people get hurt.

Bonds → Security. The trap.
Everyone knows bonds can default. Almost nobody knows the other one.
When interest rates rise, the price of existing bonds falls — nobody wants your old 2% bond when they can buy a new one paying 5%. A fund with 6-year duration falls roughly 6% if rates rise 1%. In 2022 rates rose fast and the "safe" part of a lot of portfolios got hit hard.
If a prospect says he "moved into bonds to be safe" around 2021 — he has a story. Ask him about it.

Property → Simplicity. The illusion.
Everyone thinks they understand property. A mortgaged buy-to-let is a borrowed, hard-to-sell bet on one street in one town, in one currency. The movement is hidden, not absent — nobody prices it daily.

Gold → Returns.
Gold pays you nothing. Nor does crypto. No rent, no dividend, no coupon. Pure bets on price. That's not an insult — it's a fact, and it's usually the first time anyone has said it to him out loud.

THE GRID IS A CALL TOOL
"Of those four — growth, being able to get at it, not losing it, and actually understanding it — which two matter most to you?"
He'll answer. And you'll have learned more about him in one question than most advisers get in a meeting — without giving a single piece of advice.
Then run it backwards:
He says Growth, but he's actually holding all of it in cash → the gap: he wants Returns and optimised for Security.
He says Security, but he's actually holding a mortgaged flat and one company's shares → the gap: he wants Security and bought concentration.
He says Simplicity, but he's actually holding nine funds, three currencies, two pensions → the gap: he wants Simplicity and accumulated chaos.
The gap between what he says he wants and what he actually owns is the whole conversation. He built it one decision at a time, and nobody ever stood back and looked at the whole thing.

THE CASH PILE — WHAT YOU'RE LOOKING FOR
The most common financial problem among internationally mobile people, by a distance.
Russell Investments found the average investor with no adviser holds around 20% in cash — costing roughly 0.3% a year. Expats routinely run at 40%+, across several currencies, for years.
He isn't being reckless. He's being careful.
"I'll invest it once I know where I'm settling." — said in 2017.
He earns in one currency, thinks in another, might retire in a third. Every option feels like a bet, so no decision gets made.
Nobody has ever asked him about it.
He is being careful in the one way that's guaranteed to cost him. Sound like you're judging him and you've lost him. Sound like the first person who understood it and you haven't.

And sometimes cash is exactly right
Money needed in six months. A house completing in March. An emergency fund — always.
The problem isn't cash. The problem is cash held for nine years "temporarily."

FOUR QUESTIONS
Ask one. Then stop talking.
1. "How much are you holding in cash — across how many currencies — and how long has it been sitting there?"
2. "What's it earning?" → then "And what's inflation been doing?"
3. "What's your pension actually invested in?"
4. "What are you waiting for, specifically?"
That last one is the best question here. He usually can't name it — and the moment he tries, he hears himself.

RED LINES
"You should be more in equities." — That's a personal recommendation. Naming a class is fine. Suggesting an allocation is advice — not yours to give.
"Equities will give you 7% a year." — A performance promise. History is not a forecast.
Doing his maths out loud — "you've lost £40k" — You don't know that, you can't stand behind it, and it sounds like an attack. Ask. Then wait.
Sneering at gold, crypto, property, Premium Bonds — He's telling you what he believes. Contempt ends the call. Ask what proportion, and why.
"Cash is bad." — Not always. Say it to a man completing on a house and you'll deserve what follows.
Claiming something has no weak spot — Growth with no risk does not exist. The moment you say it, you've become the salesman this session is meant to protect people from.

WHERE YOU STOP
"That's exactly the sort of thing the adviser looks at properly — he'll ask about your time horizon and how much of a fall you could actually live with."
You are not the analyst. You're the one who noticed.

IF YOU REMEMBER NOTHING ELSE
1. Returns, Liquidity, Security, Simplicity — and nothing is good at all four.
2. "Doesn't move" is not the same as "safe."
3. Ask which two matter most to him. Then look at what he actually holds.
4. Find the cash. How much, how many currencies, how long — and what is he waiting for?
Every investment is a trade. Your job is to find out what he traded away — and whether he knew he was doing it.

deVere BDA Induction · Week 1 · Asset Classes`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Training',
    title: 'Investment Glossary — Full Reference',
    summary: 'Complete investment glossary: UCITS, OEIC, SICAV, ETF, SIPP, QROPS, IORP, GIA, ISA, offshore bond, PPB, platform, alpha, beta, Sharpe ratio, duration, OCF, ATR, capacity for loss, and more.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
Investment Glossary
Reference · keep open during every technical session

A working tool, not a one-pass read. By the end of induction you should be able to define every term in here in one sentence, on demand — get there by referring back to it constantly.
How to use this: every technical session uses these words. When one comes up and you're not completely sure, look it up the moment it happens. The terms stick when you attach them to a real session, not when you memorise a list.

PRODUCT STRUCTURES AND WRAPPERS

UCITS — Undertakings for Collective Investment in Transferable Securities. The EU's gold-standard regulatory framework for retail investment funds: highly regulated, with diversification rules, daily-liquidity requirements, and a passport to be sold across the EU and many other markets. The framework has iterated several times; the current version is UCITS VI (Directive (EU) 2024/927, in force from 2024, applying across member states from April 2026), which tightened liquidity-management and delegation rules.

OEIC / ICVC — Open-Ended Investment Company. UK equivalent of a UCITS fund — a pooled fund that issues and redeems shares daily at NAV. "Open-ended" means the fund grows and shrinks with investor flows.

SICAV — Société d'Investissement à Capital Variable. The Luxembourg/EU-domiciled equivalent of an OEIC — same open-ended structure, different jurisdiction.

ETF — Exchange-Traded Fund. A fund that trades on a stock exchange like a share. Usually passive (tracks an index), can be active. Lower fees than active funds — but tracks an index rather than picking stocks, so won't outperform the market.

Investment Trust — A closed-ended fund listed on a stock exchange. Unlike OEICs the share count is fixed, so the price can trade above or below the value of its assets (premium / discount to NAV).

Offshore Bond — A life-insurance wrapper used to hold investments tax-efficiently. Common in expat advice. Comes in forms (PPB, redemption, life-assured). The wrapper itself isn't an investment — the investments sit inside it.

PPB — Personal Portfolio Bond. An offshore bond where the investor personally controls what's inside. HMRC treats UK-resident PPB holders punitively — deeming a notional gain of 15% of premium per year, cumulative, taxed at marginal rate regardless of actual performance. So PPBs are a structure for non-UK residents only.

SIPP — Self-Invested Personal Pension. A UK pension wrapper letting the holder choose their investments. Standard for UK residents. Non-residents can hold one, but often find an international structure (QROPS / IORP) more tax-efficient.

IORP — Institutions for Occupational Retirement Provision. EU directive framework for cross-border occupational pension schemes. Malta-based IORP schemes are commonly used as international pension solutions for expats.

QROPS — Qualifying Recognised Overseas Pension Scheme. A non-UK pension scheme meeting HMRC's transfer criteria — the structure that lets a UK pension transfer overseas without an unauthorised-payment charge, provided the rules are followed.

GIA — General Investment Account. A "trading account". Holds anything, no contribution limits, and fully taxable — tax on income and gains as they arise.

ISA — Individual Savings Account. A UK wrapper, completely tax free on growth, income and withdrawal. Cannot be contributed to by a non-UK resident, though existing ISAs keep their tax treatment.

Platform — The administrative system that holds and administers investments. Tax-neutral in itself — the wrapper around it decides the tax. Charges its own fee, separately.

ASSET CLASSES AND INSTRUMENTS

Equities — Shares in a company. Owners share in growth and receive dividends. Highest long-term return potential; highest short-term volatility.
Fixed Income / Bonds — Debt instruments. You lend to a government or company and get paid interest. Lower return than equities, less volatile, not risk-free — bonds can fall when interest rates rise.
Government Bonds — Issued by national governments (UK gilts, US Treasuries, German bunds). Generally the safest fixed income — the issuer can print money to repay.
Corporate Bonds — Issued by companies. Higher yield than governments because the company can default. Investment-grade is safer; sub-investment grade ("high yield") is riskier.
Investment Grade — Credit ratings AAA, AA, A, BBB — the four highest tiers. AAA highest; BBB is the cut-off. Below BBB = sub-investment grade.
Cash / Money Market — Bank deposits, treasury bills, short-term commercial paper. Lowest return, lowest risk, highest liquidity. Loses purchasing power to inflation over time.
Alternatives — Anything that isn't equities, bonds or cash: property/REITs, commodities, hedge funds, private equity, infrastructure. Used for diversification — they should behave differently from traditional assets.
Liquid Alternatives — Alternative strategies packaged in a daily-dealing UCITS fund. Alternatives exposure without the lock-ups of traditional hedge funds.

PERFORMANCE METRICS

Total Return — The full return: capital growth plus income (dividends/interest), assuming income is reinvested.
Annualised Return — A return expressed as a per-year average. 72% over 7 years is roughly 7.9% per year compounded. Lets you compare different periods like-for-like.
ITD — Inception-To-Date. Cumulative return since launch. Different from a fixed period like "5 Year" — ITD's meaning depends on when the fund started.
Cumulative Return — Total return over a period without annualising. Up 50% over 5 years is 50% cumulative (roughly 8.4% annualised). Cumulative looks bigger; annualised is more comparable.
CAGR — Compound Annual Growth Rate. Another name for annualised return.
Volatility / Standard Deviation — How much returns vary from their average. High volatility means big swings. Equity funds run around 14–18%; cash-like 1–3%. A higher number isn't automatically worse — it depends what you compare it to.
Sharpe Ratio — Risk-adjusted return: return per unit of risk, calculated as (return minus risk-free rate) divided by volatility. Higher is better. Above 1.0 good; above 2.0 exceptional.
Max Drawdown — The largest peak-to-trough fall a fund has had. Tells you the worst outcome a client would have lived through — key for matching to real emotional tolerance. (Different from pension drawdown, below.)
Alpha — The manager's value-add after adjusting for risk taken. Positive means added value; negative means you'd have been better in a tracker.
Beta — A fund's sensitivity to market moves. 1.0 moves with the market; 0.8 is less volatile; 1.2 is more volatile.
Tracking Error — How much a fund's performance differs from its benchmark. Under 1% is a tracker or closet indexer; 3–6% typical active; 8%+ high-conviction active.
Active Share — How different a fund's holdings are from its benchmark. 100% completely different; 0% identical to the index. Below 60% is "closet indexing" — active fees, index returns. 80–90%+ is genuine high-conviction active.
Yield — Income from an investment as a percentage of its current price. A £1,000 bond paying £40 a year yields 4%.
Cash-plus Return — A target expressed as a margin above cash. "Cash + 2%" aims for two points above whatever cash earns — the target moves with the rate cycle.

FIXED-INCOME SPECIFICS

Duration — How sensitive a bond fund is to interest-rate changes. Higher duration means a bigger fall when rates rise; a 6-year-duration fund loses roughly 6% if rates rise 1%. Measured in years, but it's price sensitivity, not time. Long-duration bond funds got hammered in 2022 when rates rose.
Credit Risk — The risk a bond issuer defaults. Higher-yielding bonds compensate for more credit risk.
Floating-Rate Note (FRN) — A bond whose interest rate resets with prevailing rates, so its price barely moves when rates change — near-zero duration.
Coupon — The interest rate a bond pays. A £1,000 bond with a 5% coupon pays £50 a year.
Credit Spread — The extra yield a corporate bond pays over a government bond of the same maturity. Wider means the market thinks it's riskier; narrowing means improving conditions.

INVESTMENT APPROACHES

Active Management — A manager picks investments trying to beat the market. Higher fees, potential for higher (or lower) returns.
Passive Management — A fund tracks an index automatically, no stock-picking. Very low fees. Won't beat the market — won't badly lag it either.
Discretionary vs Advisory — Discretionary means the manager acts without asking each time. Advisory means the manager recommends and the client decides. Almost all multi-asset solutions are discretionary.
Benchmark — The reference index or peer group a fund is measured against. The choice matters — easy benchmarks flatter average managers.
Concentrated Portfolio — A fund holding a small number of high-conviction stocks (20–50). Higher single-stock risk; higher potential reward if right.
Diversified Portfolio — Spreads across many holdings, sectors and regions to cut single-stock risk.
Diversification — Spreading across uncorrelated assets so when one falls others may hold or rise. The core risk-reduction principle. Diversification is about correlations, not just the number of holdings.
Correlation — How closely two investments move together. +1.0 identical; 0.0 independent; −1.0 opposite. The diversification benefit comes from low or negative correlation.
Multi-Asset — A fund or portfolio holding multiple asset classes — equities, bonds, alternatives, cash — in one wrapper.
Asset Allocation — The split between asset classes. The single biggest driver of long-term returns — more important than which specific funds are picked.
Rebalancing — Periodically returning a portfolio to its target allocation. If equities surge, the portfolio drifts overweight equities; rebalancing trims them and tops up what's lagged.
Hedge / Hedging — An offsetting trade to remove a specific risk. Interest-rate hedging neutralises rate risk; currency hedging removes FX risk on foreign-currency assets.

REGULATION AND STRUCTURE

AUM — Assets Under Management. The total a manager directly runs, with discretion to trade.
AUA — Assets Under Advice (or Administration). Money a firm advises on but the client owns and directs — no discretion to trade.
ISIN — International Securities Identification Number. The unique 12-character code identifying a specific security or fund share class. On a client statement, the ISIN confirms exactly what they own.
Share Class — Different versions of the same fund with different fees or currencies. Retail classes cost more than institutional. Each has its own ISIN.
Bid-Offer Spread — The gap between the sell price (bid) and buy price (offer) — a hidden cost of trading.
Liquidity — How easily you can buy or sell at a fair price. Daily liquidity means you can sell any business day at that day's NAV. Locked-up means you can't sell for months or years.
Custodian / Depositary — The bank that holds the actual securities for the fund. Separation from the manager protects clients from fraud.
Administrator — Calculates daily NAVs, handles subscriptions and redemptions, produces investor statements.
Operational Due Diligence (ODD) — A review of a manager's operations — controls, custody, IT, compliance, governance — separate from investment due diligence.
Investment Mandate — The agreed brief a manager operates under: what they can and can't invest in, benchmark, risk level. Staying inside it is the manager's first obligation.
Manager Drift — When a manager moves away from the strategy they were hired for. Subtle and hard to detect without independent oversight.
NAV — Net Asset Value. The per-share value of a fund: assets minus liabilities, divided by shares in issue. Calculated daily for UCITS.

CLIENT-FACING AND SUITABILITY

ATR — Attitude to Risk. The questionnaire assessing how much investment risk a client tolerates. Used to match them to the right portfolio.
Capacity for Loss — How much loss a client can financially withstand before it hits their lifestyle. Different from ATR — someone may be willing to take risk but not able to afford it.
Time Horizon — How long until the money's needed. A shorter horizon means lower risk capacity, regardless of ATR.
Suitability — The regulatory requirement that any recommendation fits the specific client's circumstances, knowledge, risk tolerance and capacity for loss.
TER / OCF — Total Expense Ratio / Ongoing Charges Figure. OCF is the current EU standard. The annual cost of holding a fund, as a percentage. Includes the manager's fee plus operating costs; does not include trading costs, entry/exit fees, or performance fees.
Pension Drawdown (UK) — Taking income from a pension pot while leaving the rest invested. (Different from investment drawdown above.)

deVere BDA Induction · Investment Glossary · Keep open during every technical session`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Training',
    title: 'Investments — The Deeper Picture',
    summary: 'Portfolio is a mix of things that behave differently on purpose. Bonds and equities offset in growth shocks but not inflation shocks (2022). Correlation, duration, asset allocation. Active vs passive. Three risk questions: ATR, capacity for loss, risk required.',
    content: `WEEK 2 · HANDOUT
Investments: The Deeper Picture
How a portfolio actually works, and the words prospects use. Keep with your Building Blocks sheet.

A portfolio isn't a pile of good investments.
It's a mix of things that behave differently on purpose.
The skill isn't picking winners — it's the mix.

RISK, IN REAL TERMS
Volatility — how much an investment swings up and down. The standard measure of risk. Equities swing a lot (roughly 14–18 per cent a year); cash barely moves (1–3 per cent). A higher number isn't automatically "worse" — it depends on the person and how long they've got.
Max drawdown — the worst fall an investment has ever had, top to bottom. This is the one clients actually feel: "your £100k became £62k for eight months." Match an investment to the drop someone could genuinely live through.
Sharpe ratio — return per unit of risk. Higher means a smoother ride to the same place.

WHY BONDS AND EQUITIES GO TOGETHER
Bonds do two different jobs alongside equities — and only the second one is a real offset. Most people never get told the second one.

1 · The coupon — a cushion
A share is a claim on profits: if there are no profits, there's nothing. A bond is a contract — a set amount of interest on set dates, capital back on a fixed date. It gets paid whether the company is having a good year or a terrible one, and bondholders are paid before shareholders. So in a bad year, the bond half keeps paying. That steadies the pot.
But notice what that isn't: a cushion is not a hedge. It softens the fall. It doesn't go up.

2 · Falling interest rates — the actual offset
Bond prices move opposite to interest rates. If you hold a bond paying 4 per cent and new bonds start being issued at 2 per cent, yours is the better deal — so its price gets bid up.
When do interest rates get cut? When the economy is weak. That's what cuts are for — to stimulate something that's struggling.
When do equities fall? When the economy is weak. Profits shrink.
The economy weakens → profits fall → equities down. The economy weakens → interest rates get cut → bonds up.
One event, two opposite effects. That isn't sentiment or people "running to safety" — it's structural. The same bad news that hurts shares is the news that brings cheaper borrowing, and cheaper borrowing is what lifts bond prices.
Shares pay you when things go well. Bonds pay you regardless — and they gain in value precisely when the news is bad enough for rates to be cut. That second half is why bonds are a hedge and not just a cushion.

CORRELATION — THE WORD FOR IT
Correlation is how closely two investments move together. +1 = identical. 0 = independent. −1 = opposite.
If everything you own moves together, you don't have a portfolio — you have one big bet in disguise.
What happened in 2022: the classic "safe" portfolio was 60 per cent shares, 40 per cent bonds — the idea being they move opposite, so bonds cushion a share crash. Then interest rates spiked and shares and bonds fell together — the worst year for that mix in decades. People who thought they were diversified weren't. The exact mechanism that normally makes bonds the offset ran in reverse:
An inflation shock → interest rates rise sharply → bonds down. An inflation shock → cost of borrowing rises → equities down.
The lesson isn't "bonds failed." It's that bonds work as the offset when the shock is a growth shock — and don't when the shock is an inflation shock. Same mechanism, different starting news. That's why a third category, alternatives, exists — things built to behave differently from both.
Real diversification isn't lots of holdings — you can own 200 tech stocks that all move together. It's holding things with low correlation to each other.

TWO THINGS WORTH KNOWING ABOUT BONDS
Not all bonds do the ballast job. These two points will make you sound like you've been doing this a while.
Which bonds. The offset comes from government and high-quality bonds. Corporate bonds carry credit risk — the risk the company doesn't pay you back — and that risk rises in a recession, which is exactly when you wanted the offset. High yield behaves much more like equity than like ballast. So when someone says "bonds are my safe bit," the useful thing to know is which bonds.
How long — duration. Duration measures how sensitive a bond is to rate changes. Short or near-zero duration barely moves when rates fall — more a cash substitute than ballast. Longer duration is where the offset actually lives, and it's also what fell hardest in 2022. "I've got a bond fund" doesn't tell you whether someone is really hedged.

QUESTIONS THIS OPENS UP
"Is there anything in there that isn't shares or bonds?"
"When was the portfolio put together — and has anyone looked at it since?"
"Do you know what kind of bonds you're holding?"
These are questions, not conclusions. Noticing that nobody has looked at something is your job. Saying what should be done about it is the adviser's.

ASSET ALLOCATION — THE BIGGEST LEVER
Asset allocation is the high-level split — how much in equities versus bonds versus alternatives versus cash. It drives more of your long-term return than which specific funds you pick. Get the split right and you've done most of the job.
Rebalancing keeps the split honest: if shares surge, your 60/40 drifts to 70/30 — more risk than you signed up for. Rebalancing trims the winners and tops up the laggards. Unglamorous, and the opposite of what instinct says.

SO WHO DECIDES THE SPLIT?
Not the adviser's preference. Three separate things — and they're not the same question:
Attitude to risk — How do you feel watching it fall? — Psychological.
Capacity for loss — What can you afford to lose without it changing how you live? — Financial.
Risk required — What return does the goal actually demand? — Mathematical.
They routinely disagree — cautious by nature but a target needing 7 per cent a year; or comfortable with risk but drawing on it in two years with nothing else behind you. Reconciling the three is most of what advice actually is.
Most people were profiled once, at the start, and nobody revisited it. A profile set at 35 and single is not the profile for 48 with a mortgage and two children.
Your question: "When was your risk profile last assessed, and by whom?" — and whether anything has changed since. You never assess it yourself. That's suitability, and suitability is regulated advice.

HOW PEOPLE ACTUALLY OWN INVESTMENTS
Through funds — you rarely own shares directly; a fund pools many together, giving instant diversification within an asset class.
Active: A manager picks, trying to beat the market. Higher fee; may beat or lag.
Passive: Tracks an index automatically. Very low fee; won't beat or badly lag.
Neither is simply "better" — it depends on the asset class and the manager. A dogmatic view is the junior view.
OCF (Ongoing Charges Figure) — the annual cost of a fund. A tracker might be 0.1 per cent, an active fund 0.75 per cent or more. The question is never "is the fee high?" — it's "what did the fee buy?"
Discretionary vs advisory — discretionary means the manager makes changes without asking each time; advisory means they recommend and the client decides. Most managed portfolios are discretionary.

THE DISTINCTION THAT RUNS THROUGH EVERYTHING NEXT
What you invest in (the funds) is a separate question from what you hold it inside (the wrapper).
The contents — the funds, the mix, the allocation.
The wrapper — the box: a SIPP, a QROPS, an ISA, a portfolio bond. It changes the tax, not the investments.
The same portfolio can sit in different wrappers. Choosing the box and choosing what goes in it are two different decisions — keep them separate in your head. (And remember: a bond the investment is not a portfolio bond the wrapper.)

WHERE YOU FIT
You're not here to design portfolios or recommend an allocation — that's the adviser. You're here to understand how a portfolio works well enough to look at what a prospect owns and see whether it's a real portfolio or just a pile of the same bet — and to ask the questions that open that up.

deVere BDA Induction · Week 2 · Investments: The Deeper Picture`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },

  // SALES & PROSPECTING SECTOR
  {
    sector: 'Sales & Prospecting',
    title: 'Objection Handling — The Loop (Week 1)',
    summary: 'Deflect → Raise Certainty → Back to the Ask. Three certainty gaps: IDEA, YOU, deVere. Reflex vs real objection. Feel Felt Found Ask tool. Seven quick objection responses. Never ask permission to carry on.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
Objection Card
Keep this beside you on live calls · Week 1 · Day 3

THE LOOP — NEVER LET GO OF THE LINE
DEFLECT → RAISE CERTAINTY → BACK TO THE ASK
Every objection is him pulling you off the line. Don't answer and retreat. Loop — and never ask "is that ok?"
Ask more than once. One deflection is not a no. Meetings get booked on the third and fourth loop. Same energy each time.

WHICH CERTAINTY IS LOW?
The words usually aren't the real gap. Aim at the gap, not the words.
IDEA — Is a meeting worth his time? Signals: "send me an email" · "no money" · "not into investments"
YOU — Does he trust you? Signals: "what are you selling?" · "how did you get my number?"
deVere — Does he trust the firm? Signals: "I've got an adviser" · "I'm happy as I am"

REFLEX OR REAL?
A reflex arrives before he's heard you. An objection arrives after.
Reflex (most of them) — absorb it lightly, don't argue it, loop. Argue a flinch and you make it real.
Real (about something you actually said) — it deserves a proper answer, then loop back to the ask.

THE DEFLECT TOOL — FEEL · FELT · FOUND · ASK
"I understand how you feel. Others felt the same. What they found, when they looked properly, was that it was worth reviewing — when did yours last get looked at?"
- Once per call. Maximum.
- Never on a reflex.
- The "found" must be TRUE. Never invent one.
- End on the question — that's your return to the ask.

THE SEVEN, QUICK
"Not interested." (idea gap) → "Of course — you don't know me yet. One question, and if there's nothing there I'll leave you alone."
"Just send me an email." (idea gap) → "Happy to, but it'd be generic unless I know your situation. One question, so I send you the right thing?"
"How did you get my number?" (you gap) → [straight answer, no defensiveness] "...out of the blue, I know. Thirty seconds on why I called, and then you can decide."
"I haven't got time." (idea gap) → "I won't keep you. When's genuinely better — beginning or end of the week?" A booked callback is a win.
"I've already got an adviser." (deVere gap) → Don't compete. Agree, then: "Good — that's the right answer. When did he last actually call you?"
"What are you trying to sell me?" (you gap) → The truth is the disarm: "Right now, nothing. I'm working out whether there's any reason for you to speak to one of our advisers at all. There may not be."
"I need to speak to my wife." (idea gap) → "Of course. Should we get her on the call too, rather than you having to relay it?"

THREE THAT SOUND LIKE A NO AND AREN'T
"What's it going to cost me?" — He's imagining it happening. Nobody prices something they've declined.
"Send me something first." — A request for reassurance, not a refusal.
"I'd need to check with my wife." — Usually genuine — and a buying signal.
Each one gets an answer, and then the ask again. Answering and stopping is where the meeting dies.

DON'T
- Ask permission to carry on. "Is that ok?" steps off the line.
- Argue a reflex. You'll win the point, lose the call, and make the flinch real.
- Quote a fee. "It depends entirely on what's recommended — that's exactly what the adviser walks you through."
- Promise returns, invent a "found," or manufacture urgency.
- Give advice, even to rebut something.

AND IF IT'S A REAL NO
"No problem at all — I'll leave you to it. Thank you for your time."
Clean. Courteous. Finished.
You ask again through a reflex. You stop at a real no. "Not interested" four seconds in is a flinch — loop it. "I've genuinely got no UK assets, I'm not interested, please take me off your list" is a no — honour it.
Telling them apart is the whole skill.

deVere BDA Induction · Week 1 · Objection Card · Keep it by the phone`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Sales & Prospecting',
    title: 'Objection Handling — Four Frameworks (Week 2)',
    summary: 'Four tools: Understand/Voss (name the emotion), Absorb & Ask Small/Blount (specific small ask), Step Back/Sandler (once per call), Clarify/Diagnostic (find the real gap). Ten most common objections with responses. Kill upward inflection on the ask.',
    content: `WEEK 2 · OBJECTION CARD
Objection Handling — The Frameworks
One card. Four tools. The ten lines you'll hear most.

This lives by your phone. Glance at it — don't read from it. Four tools. The ten lines you'll hear most.

THE MOVE, EVERY TIME
Absorb → raise certainty → come back to the ask.
Don't argue the objection, and don't ask permission to carry on. Acknowledge it, answer the real gap underneath, then ask again — warmly, and as a statement, not a question.
Most first objections are a reflex, not a decision. Ask more than once. A meeting is often agreed on the third try, not the first. Stop only at a clear, specific no.

FOUR TOOLS — WHICH ONE, WHEN
Understand (Voss) — use it when there's real emotion or irritation. The core of it: name what you're hearing: "It sounds like…" Then go quiet. Never "I understand."
Absorb & ask small (Blount) — use it when it's a quick brush-off. The core of it: "Fair enough — that's exactly why I called. Two quick questions?" The ask is small and specific.
Step back (Sandler) — use it when you're stuck and about to push. The core of it: "This might not even be relevant to you…" Once per call. Light, never sharp.
Clarify (Diagnostic) — use it when the line is vague. The core of it: "Have you done a role like mine? Usually it's one of three things: …, …, or something else. Which is it?"

THE TEN YOU'LL HEAR MOST
"Not interested." → "It sounds like you've had calls like this go nowhere. That is exactly why I called — two quick questions and you decide. Fair?"
"I already have an adviser." → "Most people I speak to do. The question is whether they are set up for the cross-border side. Where are they based?"
"Send me an email." → "I can send one — but any email I send is generic. Two questions tells me what is actually worth sending you."
"How did you get my number?" → "You enquired through one of our ads a while back. While we are here, I need to ask you one quick thing."
"No time right now." → "That is exactly why I called instead of emailing. Sixty seconds tells you whether it is worth a longer conversation. Sixty seconds, fair?"
"No money to invest." → "I am not asking you to add a penny. This is about what you already have — the pension, the savings. Which of those do you have?"
"What are you selling?" → "Nothing on this call. My job is to work out whether we can help, then connect you to the right person. If we cannot, neither of us has wasted any time."
"Not into investments." → "Most people I speak to say exactly that. If you have a UK pension or savings, you are already an investor — you simply have not called it that. Which of those do you have?"
"I'll think about it." → "What specifically would you want clearer? If it is the cross-border side, I can answer that in a minute."
"Happy with what I've got." → "Most people I speak to cannot say that. When did anyone last review it with you properly?"

SAY IT RIGHT
Cut the filler. "Yeah", "honestly", "thing is", "sort of", "just", "I get it" — every one of them is a hedge, and a hedge tells the prospect you are not sure of what you are about to say. You are not their mate; you are the competent person who rang them. Say the sentence without the padding and it carries.
- Warm when you're understanding them. Light when you're absorbing a brush-off. Certain when you ask.
- Kill the upward inflection on the ask. "Let's get you fifteen minutes with an adviser" — flat, like a plan. Not "…could we maybe?" A rising ask invites a no.

Everything here only works when it's true.
Ask real questions, give honest answers, and let the facts do the work.
That's what makes you easy to trust — and trust is what books the meeting.

deVere BDA Induction · Objection Handling · The Framework System`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Sales & Prospecting',
    title: 'The Close — Gate, Funnel, Gauntlet',
    summary: 'Gate: agree the problem. Funnel: beginning or end of week → morning or afternoon → specific time. He is choosing when, never whether. Qualify after yes, never before. One deflection is not a no — meetings booked on third and fourth ask.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
The Close
The gate, the funnel, the gauntlet · Week 1 · Day 4

1. THE GATE — agree the problem · 2. WHAT NEXT — and who with · 3. THE FUNNEL — wide, then narrow

1 · THE GATE
"Right — so three things. [what he told you], [what he told you], and nobody's reviewed any of it since [year]. Every one of those is worth a proper look. Sound fair?"
Say it with certainty. "It sounds like" and "seems like" are you sounding unsure about facts he gave you thirty seconds ago. State it, then tie it down. Once he says yes you are not asking a favour — you are both looking at a problem he just agreed he has.

2 · WHAT HAPPENS NEXT
"What I'd like to do is set up a quick follow-up with one of our senior advisers who specialises in exactly this. They'll take a proper look at where you're at and identify any blind spots — no pressure at all."
Do not invent a name. "One of our senior advisers" is honest and enough. Once you know who it is, use it — it's stronger.

3 · THE FUNNEL
He is choosing when — never whether. He can answer "Thursday or Friday" with "neither." He cannot do that to "beginning or end of the week."
Wide: "When's typically best for you — beginning or end of the week?"
Narrower: "Morning or afternoon?"
Land it: "Tuesday at three, or would four be easier?"
Confirm: Phone or video? Read his email back. Confirmation coming today.

WHEN HE PUSHES BACK
Acknowledge it. Then ask again. Same ask, same energy.
"No problem at all — so is the beginning or the end of the week better for you?"
- The ask does not get smaller. Shrink it to "or I could just send you something" and you've talked him out of it yourself.
- One deflection is not a no. Meetings get booked on the third and fourth ask.

THREE THAT SOUND LIKE A NO AND AREN'T
"What's it going to cost me?" → He's imagining it happening → Answer straight, then funnel again.
"Send me something first." → Reassurance, not refusal → "Of course, today. And while I've got you — beginning or end of the week?"
"I'd need to check with my wife." → Usually genuine. A buying signal → "Should we get her on the call too, so you're not relaying it?"
Each gets an answer — then the ask again. Answering and stopping is where the meeting dies.

AFTER HE SAYS YES — THE CALL IS NOT OVER
"To make the meeting go smoothly, I'd just like to ask a few more questions so I can prepare them properly — is that ok?"
1. What has he got, bands are fine · 2. Where is he based · 3. Family — who else this affects · 4. Where he expects to be in five years · 5. "Anything else we haven't covered?"
You qualify after he's agreed, never before. Before, it's an interrogation from a stranger. After, it's admin for a meeting he's already said yes to.
And if it's a real no: "No problem at all — I'll leave you to it. Thank you for your time." Clean, courteous, finished. You ask again through a reflex. You stop at a real no. Telling them apart is the whole skill.

THE GAUNTLET
In pairs. One is the prospect, one is the BDA. Swap halfway.
The BDA closes. You refuse. The BDA closes again.
Every refusal different. Say yes on the fifth — not before.
Be difficult. Being kind to your partner today is not doing them a favour.

Your refusals — any order, don't repeat one:
1. "I'm quite busy at the moment."
2. "Can you email me some details first?"
3. "I'd need to think about it."
4. "What's it going to cost me?"
5. "I've got someone already."
6. "I'm away next week."
7. "Is this going to be a sales pitch?"
8. "Let me come back to you."
9. "I don't really have that much to talk about."
10. "Just send me something and I'll look at it."

Your job as the prospect — two things to watch:
Does the ask get smaller? If your partner starts softening it — "or I could just send you something instead" — say so. The ask should be identical on the fifth attempt as on the first.
Does the voice go up at the end? You don't need to fix it — just tell them you heard it.

deVere BDA Induction · Week 1 · The Close · Keep this by the phone`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Sales & Prospecting',
    title: 'The Fact Find — The Ladder',
    summary: 'Four things: WHAT, WHERE, WHO, WHEN. WHEN opens the meeting. Follow-up ladder: go deeper into the answer, not wider. Scale question: 1-10 how happy, what would make it a 9? The first answer is never the answer.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
The Fact-Find
The second question is the one that matters · keep this by the phone

THE FIRST ANSWER IS NEVER THE ANSWER.
Nobody gives a stranger a full answer to a first question. You get vague, short and incomplete — every time. That isn't him being difficult, it's how people talk to someone they've just met. So the first question only exists to give you something to go deeper into.

THE FOUR THINGS YOU NEED
WHAT — What has he got, roughly? → Scale — worth an adviser's time?
WHERE — What's it sitting in? → The structure — usually where the problem is
WHO — Who set it up, who looks after it now? → Whether anyone is actually doing anything
WHEN — When was it last reviewed? → Almost always the answer that does the work
That's the whole fact-find. You never need to know what fund he's in, what it's returned, or what he thinks about markets. You're not analysing his portfolio — you're finding out whether anybody is looking after him.
WHEN opens the meeting. "Nobody's looked at this since 2017" is the reason he needs an adviser — and he'll say it himself if you ask.

THE FOLLOW-UP LADDER
Every answer has a second question in it. Find it.
"When you say roughly — roughly what?" · "And where's that sitting?"
"Who set that up?" · "When did you last hear from them?"
They aren't new questions — they go deeper into the answer he just gave. They don't feel like an interrogation because you're obviously listening, and he can't deflect them because he raised the subject.
You're not changing the subject. You're staying on it. A questionnaire moves on; a conversation goes deeper.
The phrase that buys you another question: "Sorry, one more on that —" Sounds like interest, not process. It never runs out.

THE SCALE QUESTION
"On a scale of one to ten, how happy are you with how that's being looked after?"
"What would need to change to make it a nine?"
It's almost never a ten. He tells you the problem himself, in his own words. You never had to name it.

THE SAME CALL, TWICE
The questionnaire version:
You: Got any investments? Him: Yeah, a bit.
You: And any pensions? Him: Not UK ones, no.
You: Right. And savings? Him: Some in the bank.
You: Great, that's really useful...

The ladder version:
You: Got any investments? Him: Yeah, a bit.
You: When you say a bit — roughly what? Him: Maybe a hundred and fifty.
You: And where's that sitting? Him: An ISA and a trading account.
You: One more on that — who set the trading account up? Him: A guy back in the UK, years ago.
You: When did you last hear from him? Him: ...God. Not since I moved, probably.

Same number of questions. Same prospect. One asked four questions about four different things. The other asked four about one thing — and ended with him saying out loud that nobody has spoken to him in eight years.
He said it. You didn't.

WHAT TO DO WITH WHAT YOU FIND
Existing investments, someone else managing — most likely, easiest. He's already accepted the idea of investing; you're only asking whether the structure still makes sense. Go at WHO and WHEN. → "Has anyone looked at whether that's still the right place for it, since you moved?"
Cash sitting still — harder. He hasn't accepted investing at all. Don't judge it, don't do his maths. Go at the plan, not the amount. → "What was the plan for it when you first put it aside?" · "What are you waiting for, specifically?"
"I don't really know" — most common, and the best answer you'll get. Not a dead end — it's the reason for the meeting. → "Would it be useful to actually find out?"

TEN SECOND QUESTIONS
"A bit put away." → "When you say a bit — roughly what?"
"It's in an ISA." → "Do you know what it's invested in?"
"My adviser looks after it." → "When did you last hear from him?"
"It's done alright I think." → "Compared to what?"
"Some bank, some invested." → "Which is the bigger of the two?"
"I set it up years ago." → "How many years are we talking?"
"One of the big firms." → "Which one?"
"A few different bits." → "Talk me through them — biggest first."
"It's all a bit of a mess." → "What makes you say that?"
"I don't really know." → "Would it be useful to find out?"

DON'T
- Don't ask a new question when there's a second one available in the answer you just got
- Don't run a checklist. If he can hear you working down a list, you've lost him
- Don't do this to every answer — collect a few facts lightly, then chase the one that made him pause
- Don't do his maths out loud. You don't know the numbers and it sounds like an attack
- Don't treat "I don't know" as a failed call. It's the finding

You don't need to be clever on the phone. You need to be interested. Ask. Listen properly. Then ask about the thing he just said. Nobody has done that to him in years. That, on its own, is often enough.

deVere BDA Induction · The Fact-Find · Keep this by the phone`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Sales & Prospecting',
    title: 'The Second Door — When Pension Route Closes',
    summary: 'When pension door shuts, call does not end. Pivot: "Fair enough — pensions aren\'t the only part of it." Hunt order: existing investments first (already accepted the idea), then cash second (harder sale). Same close either way.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
The Second Door
When the pension route closes · keep this beside you

When the pension route closes, the call does not.

THE TRIGGERS
Any of these means the pension door is shut. Do not push it.
- "I never worked in the UK."
- "I've only been there a couple of years."
- "My pension's with my current employer, it's fine."
- "I've already transferred it all."
- "I'm not interested in pensions."
Pushing a closed door is the single fastest way to lose a call. He has answered you honestly. Take the answer and move.

THE PIVOT
"Fair enough — pensions aren't the only part of it. Can I ask you something else instead?"
"When you think about retirement, what's actually going to fund it?"
Why "retirement provision" and not "investments":
- It is broader — catches ISAs, portfolios, property, cash, all of it
- It does not sound like you are selling anything
- He has to answer it. Everyone has a retirement, whether or not they have a plan
- "Have you got any investments?" gets a yes or a no. This gets a description

THEN HUNT IN THIS ORDER

FIRST — what he already has invested
ISAs · portfolios · a trading account · anything a previous adviser set up
Why first: he has already accepted the idea of investing. You are not selling him a concept — you are asking whether the structure around it still makes sense. That is a far shorter conversation and a far more likely meeting.
The questions: "Where's that sitting — an ISA, a trading account, something offshore?" "Who set that up, and when?" "When did you last hear from them?" "Has anyone looked at whether that's still the right place for it since you moved?"

What you are listening for:
"It's an ISA from before I left." → Frozen. Can't contribute. Probably not reviewed since.
"My adviser back home sorted it." → Can he still advise a non-resident? Usually not.
"It's in a trading account." → Taxable, and he may not know where the tax lands now.
"I don't actually know." → The best answer you will get. That is the reason for the meeting.
"Some offshore bond thing from years ago." → Who sold it, what does it cost, has anyone looked since.

SECOND — the cash
Only after you have asked about investments.
Why second: if it is all in cash, he has not accepted the idea of investing at all. That is a bigger sale and a slower one. Real, worth having, but it is the harder door — so try the easier one first.
The questions: "And is there anything sitting in cash alongside that?" "How long's that been there?" "What was the plan for it when you first put it aside?" "What are you waiting for, specifically?"
The last one is the best question you own. He usually cannot name it — and the moment he tries, he hears himself.

THE RULES
- Do not judge him. He is not being reckless. He is being careful, in the one way that costs him. If you sound like you are criticising, the call is over
- Do not do his maths out loud. No "you've probably lost thirty grand." You do not know that and it sounds like an attack
- Do not tell him what to do. You are not the adviser. Ask, then be quiet
- Cash is sometimes right. House deposit, emergency fund, money he needs this year. The failure is not cash. It is cash held for nine years by accident

THE CLOSE IS THE SAME
Nothing changes because you switched doors. Recap what he told you, get him to agree, then funnel.
"So it sounds like there are a few areas where you could do with more clarity — does that sound fair?"
"What I'd like to do is set up a quick follow-up with one of our senior advisers who specialises in exactly this. When's typically best for you, beginning or end of the week?"
Do not invent an adviser's name. You do not know yet who it will be. "One of our senior advisers" is honest and it is enough. Once you know who it is, use the name — it is stronger. Until then, do not.

Training material for deVere Business Development Associates. Not advice, not a compliance-approved script, not for client distribution.`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Sales & Prospecting',
    title: 'Pension Questions — The Card',
    summary: 'TED panic button: Tell me, Explain, Describe. Two beats: fact then so what. DC questions: passive choice, stale strategy, no review, hidden cost, cross-border. DB questions: gold-plated myth, fixed age, inflation cap, currency, death benefits. Scale question.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
Pension Questions — The Card
Keep this by the phone · Week 1 · Day 3

Keep this by the phone. The right question for every moment of a pension conversation.

THE ONE RULE
Doubt by questions, never by statements.
Don't tell him there's a problem. Ask the question only a problem could answer badly — and let the silence do the work.

TED — YOUR PANIC BUTTON
When a call is dying and your mind goes blank, start your next sentence with:
Tell me about… · Explain… · Describe…
You will always get the conversation back.

THE TWO BEATS — FACT, THEN "SO WHAT?"
A fact-find question gets him talking. The next question is the one that matters.
Fact: "When did anyone last review it?" → "Years ago."
So what: "So what's changed in your life since then that nobody's adjusted for?"

Three ways to ask the "so what":
Time-stretch — "How long's that been the case? Where does that leave you in ten years?"
Consequence-chain — "So what does that mean for your wife, your children, retiring when you want?"
Gap-namer — "So who's actually been looking after that?"
Don't do this to every answer — you'll sound like an interrogation. Collect a few facts lightly, then chase the ONE that made him pause.

DC PENSION — QUESTIONS THAT OPEN IT UP
Passive choice → "Who actually chose the funds — you, or the default?"
Stale strategy → "What's changed in your life since those choices were made?"
No review → "When did anyone last review it with you?"
Absent provider → "When did the scheme last reach out to you?"
Hidden cost → "Do you know what you're paying in annual charges?"
Cross-border → "Does the scheme even know you live outside the UK now? What currency will you draw it into?"

DB PENSION — QUESTIONS THAT OPEN IT UP
"Gold-plated" → "You called it gold-plated — what makes you feel that way? Has anyone walked you through what it actually does?"
Fixed age → "What if you wanted to retire earlier — or later — than it allows?"
Inflation cap → "Is the income level, or inflation-linked? Is there a cap?"
Currency → "It pays in sterling — how does that work for you, living where you do?"
Death benefits → "What does your spouse get if something happens to you? What passes to your children?"
Scheme funding → "Have you ever checked the scheme's funding position?"
Transfer value → "Have you ever been quoted a transfer value?" (information only)

THE SCALE QUESTION
One of the most useful questions you own, and it works on almost anything:
"On a scale of one to ten, how happy are you with how that's being looked after?"
It is almost never a ten. And whatever number he gives you, the follow-up writes itself:
"What would need to change to make it a nine?"
He tells you the problem himself, in his own words. You never had to name it.

CURIOUS HUMILITY — THE TONE UNDER ALL OF IT
You understand the system now. Ask like you're still learning their story.
"I might be missing something — help me understand what's kept you with that provider?"
Interested, not intrusive. They should feel heard, not handled.

WHERE YOU STOP
- You ask the questions. You don't answer them. "So what should I do?" → "That's exactly what the adviser works through with you. My job is making sure the right questions get asked."
- Never tell someone to transfer a pension. DB transfers are heavily regulated and never a BDA's call.
- The transfer-value question is information only — never a nudge.

deVere BDA Induction · Week 1 · Pension Questions · Keep by the phone`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },

  // PRODUCTS SECTOR
  {
    sector: 'Products',
    title: 'Where the Money Sits — Wrappers Explained',
    summary: 'What you hold is not the same as what you hold it in. Six wrappers: bank account, ISA (frozen for non-residents), GIA (fully taxable), pension SIPP, offshore bond (defers tax), platform (plumbing). When someone leaves the UK nothing rearranges itself.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
Where the Money Sits
Trainee handout · Week 1 · Day 4

THE ONE IDEA
What you hold is not the same as what you hold it in.
Every investment has to live somewhere. Nobody owns a share floating in space — it sits inside something, and the something changes what happens to it.
That something is a wrapper.
Two men own exactly the same fund. One pays tax on it every year and one doesn't. The fund is not the difference. The box around it is.

HOLDING OR WRAPPER?
What you hold / What you hold it in:
Shares in a company / A bank account
A tracker fund / An ISA
Government or corporate bonds / A trading account (GIA)
Cash / A pension — SIPP or workplace
Gold / An offshore bond
A buy-to-let / (a platform sits underneath most of these)

THE SIX WRAPPERS

Bank account
Holds: cash only. Tax: interest taxed as income, where he's resident. Access: instant.
This is where most expat money actually is.

ISA
Holds: stocks and shares, or cash. UK only. Tax: completely free. No tax on growth, income or withdrawal. Access: any time.
You cannot contribute as a non-UK resident. Existing ISAs keep the tax treatment — but nothing new goes in.
Most prospects have an ISA they can't pay into and haven't looked at since they left. It's frozen — not broken, but going nowhere, and nobody has ever told them.

General Investment Account (GIA) — a "trading account"
Holds: anything. No limits, no rules. Tax: fully taxable. Tax on income and on gains, as they arise. Access: any time.
The default place money goes when the ISA is full or unavailable.

Pension — SIPP or workplace
Holds: investments. Tax: grows tax free inside; taxed on the way out as income. Access: locked until 55, rising to 57 in 2028.

Offshore bond / portfolio bond
Holds: funds and other investments, inside an insurance wrapper. Tax: no tax on growth while it stays inside. It defers — it does not remove. Access: via withdrawals, with its own rules.
Costs more than a platform. The saving has to justify the cost, or it's the wrong answer.

Platform
The administrative system that holds the investments. Tax-neutral in itself — the wrapper around it decides the tax. Charges its own fee, separately.
Often confused with a wrapper. It's plumbing, not a wrapper.

WHAT HAPPENS WHEN SOMEONE LEAVES THE UK
1. The ISA freezes. Still tax free, still theirs, can't be added to. The best wrapper he owns, and it's stopped growing by contribution.
2. Everything new goes somewhere worse. No ISA available, so it lands in a GIA or a bank account — taxable, in a country whose rules he's probably never checked.
3. Nobody rearranges anything. The wrappers were chosen for a UK life. He isn't in the UK. Nothing has moved and nothing has been reviewed.
He picked his wrappers for a life he isn't living any more. Nobody goes back and asks whether they still fit — and the wrapper is the bit that decides what he actually keeps.

SAME FUND, THREE WRAPPERS
£200,000. Same global fund. Same growth. Three different boxes.
ISA: Nothing. No tax on growth, income, or withdrawal.
GIA: Taxed as it arises — on dividends each year, on gains when sold.
Bond: Nothing while it stays inside. Tax comes later, on withdrawal.
Identical fund. Identical performance. Three completely different outcomes — and not one of those differences has anything to do with picking a good investment.
Everybody obsesses about what to buy. Almost nobody asks what it's sitting in. That's the bit that's usually wrong, and it's the bit nobody has ever checked.
Never quantify this for a client. How much it matters depends entirely on where he lives, and that's the adviser's job. That it matters is the point.

THE FOUR QUESTIONS
1. "Where does that money actually sit?"
2. "Is that a bank account, an ISA, a trading account — do you know?"
3. "When did you last look at it?"
4. "Has anyone reviewed whether that's still the right place for it, since you moved?"
Question 2 does the work. Most prospects don't know — and hearing themselves not know is the whole event.
Question 4 opens everything else. Nobody has ever asked him.
You're not asking him what he's invested in. You're asking what it's sitting in — and that's a question almost nobody has ever put to him, including whoever sold it to him.

WHAT YOU'LL HEAR, AND WHERE IT GOES
"About £90k in the bank back home." → Bank account. Taxable, doing nothing → "How long's it been there?"
"I've got an ISA from before I left." → Frozen — tax free, can't add to it → "Do you know what it's invested in?"
"It's in a trading account." → GIA — fully taxable → "Has anyone looked at the tax on that since you moved?"
"Some kind of offshore bond thing." → Bond — deferring → "Who set that up, and when did you last hear from them?"
"It's all in Premium Bonds." → A wrapper and a product at once. UK, going nowhere → "What were you waiting for?"
"I don't really know, my adviser sorted it." → Unknown — and that IS the finding → "Would it be useful to actually find out?"
That last one is the most common answer you'll get, and the best. It is not a dead end. It is the reason for the meeting.

RED LINES
- Never tell him which wrapper he should be in. That's a personal recommendation and it isn't yours to make.
- Never quantify his tax. Rates depend on residence, and a made-up number is a false statement.
- Never say a bond "avoids" tax. It defers it. Deferred is not never.
- Never sneer at where his money is. He didn't choose badly — mostly he didn't choose at all.

IF YOU REMEMBER NOTHING ELSE
1. What you hold is not the same as what you hold it in.
2. The ISA is frozen. The GIA is taxable. The bond defers. The platform is plumbing.
3. He picked his wrappers for a life he's no longer living.
4. "Where does that sit?" — then "do you know?"
If he has no UK pension, he still has money somewhere. And it is sitting in something. Ask him what.

deVere BDA Induction · Week 1 · Where the Money Sits`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Products',
    title: 'The Portfolio Bond — Full Mechanics',
    summary: 'Tax wrapper for liquid money built for internationally mobile clients. Gross roll-up inside. 5% annual withdrawal allowance. Time-apportionment relief on return to UK. PPB is non-residents only. Segments like pizza slices. Bond vs platform cost comparison.',
    content: `WEEK 2 · HANDOUT
The Portfolio Bond
A tax wrapper for liquid money, built for internationally mobile clients.

FIRST — HOW INVESTMENT RETURNS GET TAXED
A wrapper only makes sense once you know what it's protecting you from.
- Three different taxes, not one. Interest is taxed as income. Dividends have their own rates. Gains are taxed when you sell. Different rules, different rates.
- Selling is what triggers it. A gain is only taxed when you realise it — so every rebalance outside a wrapper is a disposal. The discipline that makes a portfolio work costs tax every time you do it.
- Deferred is not free. Tax-free means never. Tax-deferred means later. Almost nothing is tax-free; a lot of good structure is tax-deferred.
- Tax is just another drag. Money that leaves the pot stops compounding, and it makes no difference whether it left as a fee or a tax bill. Same hole, same mechanism.
Which tells you what a tax wrapper actually is: a drag-reduction tool. And because the rate depends on where somebody is tax resident, the value of any wrapper depends entirely on the person — which is why we can honestly tell some clients it does nothing for them.
You never quote a rate. Rates change, they differ by country, and stating one as fact puts you on the hook for it. Know the categories exist. The adviser does the numbers.

THE IDEA IN ONE LINE
A portfolio bond is a tax wrapper for money that's already liquid. It's designed for people who move across borders.
Where a pension wrapper holds pension money, a portfolio bond holds other liquid money — house-sale proceeds, an inheritance, accumulated savings. It's an insurance contract: the provider owns the underlying assets, the client owns the contract. That single fact drives the tax treatment.

THE STRUCTURE — "THE PIZZA"
The bond is divided into many identical segments — like slices of a pizza. Each is a mini-policy in its own right, so a client can cash in whole segments individually, giving precise access without disturbing the rest of the bond.
Key features — these work for any holder, anywhere:
- 101 per cent life cover, or a redemption bond with a fixed end date.
- Joint-life last-survivor basis — relatives have the option to cash in, not the obligation.
- Multi-currency — funded and held in several currencies. Valuable for mobile clients.
- Can be funded in specie — by transferring assets in, not only cash.
- Investment choice inside — self-managed, advised, or run by a discretionary manager. The investments are a separate decision from the wrapper.
- Domiciled in the Isle of Man, Dublin (for EEA clients), or Mauritius.

THE TAX TREATMENT — TWO PARTS, KEPT SEPARATE

Universal — true wherever the client lives
Gross roll-up — investments grow free of income and capital gains tax inside the wrapper. Funds can be switched or rebalanced without triggering a tax event, because the client owns the contract, not the assets. The money compounds without that annual tax drag.
Non-reclaimable withholding tax on dividends can still apply to the underlying assets — so it's gross of income and capital gains tax within the wrapper, not entirely tax-free. Don't oversell it.

UK reliefs — these matter when the client is, or becomes, UK-resident
For a genuinely non-UK-resident client, no UK tax is typically due on a chargeable event. These reliefs become valuable if the client returns to the UK — which makes them central for a British expat planning to come home.
- The 5 per cent allowance — up to 5 per cent of the premium can be withdrawn each policy year for 20 years with no immediate UK income-tax charge, and it's cumulative. It's tax-deferred, not tax-free — settled at the eventual chargeable event.
- Time-apportionment relief — the eventual gain is reduced in proportion to the time the holder spent non-UK-resident. Someone non-resident for half the bond's life sees the taxable gain roughly halved. This is the key "held it abroad, come home, pay less" benefit.
- Top-slicing relief — softens a one-off gain by spreading it over the policy's life. A UK-resident mechanic.
- UK chargeable-event gains are taxed as income, not capital gains.

TWO THINGS TO WATCH
The PPB residency rule — a Personal Portfolio Bond held by a UK resident is taxed punitively: HMRC assumes an annual gain of 15 per cent of the premium, taxed whether or not the investments grew. So a PPB is a structure for non-UK residents.
The temporary-non-residence trap — a non-resident who cashes in abroad and then returns to the UK within about five years can have the gain pulled back into UK tax under anti-avoidance rules. Worth raising with an adviser for anyone planning a short spell overseas.

THE DEFERRAL EFFECT
Deferring tax rather than paying it each year lets the whole amount keep compounding. Over a long horizon, and where tax applies, that difference alone can be substantial.
Worked through in the session: £300,000 growing at 7 per cent a year, with tax at 26 per cent. Both figures are shown after tax — the deferred route still pays in full at the end.
After 10 years: taxed every year £497,110; deferred, after tax £514,708; difference £17,597.
After 20 years: taxed every year £823,729; deferred, after tax £937,070; difference £113,341.
After 30 years: taxed every year £1,364,948; deferred, after tax £1,767,921; difference £402,972.
After 40 years: taxed every year £2,261,767; deferred, after tax £3,402,330; difference £1,140,562.
7 per cent taxed every year is 5.18 per cent. You haven't lost a quarter of the return — you've lost 1.8 points off the compounding rate, every year. And notice the shape: barely any difference for the first decade, then it runs away.
Where there's no tax to defer, the benefit disappears — so the bond earns its place through tax, not automatically. Figures are illustrative and depend entirely on individual circumstances.

BOND OR PLATFORM?
The same liquid money can go into a bond or onto an investment platform. They cost differently:
Bond — charge around 1 per cent a year for 10 years on the premium, plus admin. Best when the tax saving genuinely beats the cost.
Platform — charge around 0.35 per cent a year on the whole pot. Best when there's no tax reason — cheaper and simpler.
The right wrapper is the one matched to the client's needs and tax position. Recommending that one — rather than the one that pays the most — is what independence looks like.

WHERE YOU FIT
You don't recommend a bond, choose between bond and platform, or quote what someone would save — that's the adviser. Your job is to recognise the shape — liquid money, an internationally mobile client, no wrapper in place, possibly heading back to the UK one day — and open the conversation.
A useful opening question: "When you eventually take money out, do you know whether you'll be living abroad or back in the UK? Because that changes how it's taxed."

deVere BDA Induction · Week 2 · The Portfolio Bond`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },
  {
    sector: 'Products',
    title: 'Asset Classes — Full Grid Reference',
    summary: 'Returns/Liquidity/Security/Simplicity grid for all asset classes. Cash secure against falling but not inflation. Bonds fall when rates rise. Property illusion of simplicity. Gold pays nothing. Alternatives for diversification. Nothing good at all four.',
    content: `deVere · WEALTH MANAGEMENT TRAINING
Asset Classes — The Four Boxes
Trainee handout · Week 1 · Day 3

THE ONE IDEA
Every investment ever created is judged on four things:
RETURNS · LIQUIDITY · SECURITY · SIMPLICITY
Returns — How much does it grow, or pay me?
Liquidity — How fast can I turn it back into money without losing value?
Security — How likely am I to get my capital back?
Simplicity — Could he explain it to his wife in one sentence?
Simplicity is not a nice-to-have. If a client can't explain what he owns, he doesn't understand it — and he'll sell it at the worst possible moment, which is exactly when it's falling.

WHAT EACH ONE ACTUALLY IS
Cash. Money in a bank account. Pays interest. Doesn't grow — and what it buys shrinks.
Government bonds. You lend to a government. They pay you interest and return your money on a fixed date.
Corporate bonds. The same, but lending to a company. They pay more, because they're more likely to fail to pay you back.
Equities. You own a piece of a company. If it does well, you do well. Share price plus dividends.
Property. A building. Rent, plus the price going up.
Gold. A lump of metal. You make money if someone will pay more for it than you did. That's the whole mechanism.
Alternatives. The bucket for everything else — hedge funds, private equity, infrastructure, commodities.

THE GRID (Returns / Liquidity / Security / Simplicity)
Cash: poor returns (loses to inflation) / very strong liquidity / mixed security (secure against falling, not against inflation) / strong simplicity.
Government bonds: middling returns / strong liquidity / mixed security / middling simplicity.
Corporate bonds: middling returns / strong liquidity / poor security / poor simplicity.
Equities: strong returns / strong liquidity / poor security / good simplicity.
Property: good returns / very poor liquidity / mixed security / good simplicity (illusory — see below).
Gold / commodities: no income / strong liquidity / poor security / good simplicity.
Alternatives: good returns / poor liquidity / poor security / very poor simplicity.

THE POINT OF THE GRID
Some things score well on three of the four. Cash does. So do gilts, if you hold them to maturity. That's fine and it's correct.
What matters is that every single row has a cross in it.
Nothing on that board is good at all four. Every one of them is strong somewhere and weak somewhere — and the weak bit is almost always the part nobody ever told him about.
He didn't choose the weakness. He just didn't know it was there.
Every investment is a trade. The only question is what he traded away — and whether anyone ever mentioned it.

THE CELLS WORTH UNDERSTANDING

Cash → Security. Secure against what?
Against falling? Yes. Completely.
Against still buying what he needs in twenty years? No.
Rule of 72: 72 ÷ 3% inflation = 24 years to halve in buying power.
And the subtraction nobody makes: 4% in the bank − 3% inflation = 1%, before tax. He thinks he's getting four.
"Doesn't move" is not the same as "safe." Cash minimises the risk he can see, and maximises the one he can't.
Security is the only word in the grid that means two different things depending on when he needs the money. That's why the adviser asks when before anything else — and why risk is not a property of an asset. It's a property of an asset against a purpose.

Equities → Simplicity. The surprise.
"You own a bit of a company. If it does well, you do well." One sentence. Equities are the simplest thing in the grid.
The complicated ones are corporate bonds and hedge funds — and nobody thinks they are. That's how people get hurt.

Bonds → Security. The trap.
Everyone knows bonds can default. Almost nobody knows the other one.
When interest rates rise, the price of existing bonds falls — nobody wants your old 2% bond when they can buy a new one paying 5%. A fund with 6-year duration falls roughly 6% if rates rise 1%. In 2022 rates rose fast and the "safe" part of a lot of portfolios got hit hard.
If a prospect says he "moved into bonds to be safe" around 2021 — he has a story. Ask him about it.

Property → Simplicity. The illusion.
Everyone thinks they understand property. A mortgaged buy-to-let is a borrowed, hard-to-sell bet on one street in one town, in one currency. The movement is hidden, not absent — nobody prices it daily.

Gold → Returns.
Gold pays you nothing. Nor does crypto. No rent, no dividend, no coupon. Pure bets on price. That's not an insult — it's a fact, and it's usually the first time anyone has said it to him out loud.

THE GRID IS A CALL TOOL
"Of those four — growth, being able to get at it, not losing it, and actually understanding it — which two matter most to you?"
He'll answer. And you'll have learned more about him in one question than most advisers get in a meeting — without giving a single piece of advice.
Then run it backwards:
He says Growth, but he's actually holding all of it in cash → the gap: he wants Returns and optimised for Security.
He says Security, but he's actually holding a mortgaged flat and one company's shares → the gap: he wants Security and bought concentration.
He says Simplicity, but he's actually holding nine funds, three currencies, two pensions → the gap: he wants Simplicity and accumulated chaos.
The gap between what he says he wants and what he actually owns is the whole conversation. He built it one decision at a time, and nobody ever stood back and looked at the whole thing.

THE CASH PILE — WHAT YOU'RE LOOKING FOR
The most common financial problem among internationally mobile people, by a distance.
Russell Investments found the average investor with no adviser holds around 20% in cash — costing roughly 0.3% a year. Expats routinely run at 40%+, across several currencies, for years.
He isn't being reckless. He's being careful.
"I'll invest it once I know where I'm settling." — said in 2017.
He earns in one currency, thinks in another, might retire in a third. Every option feels like a bet, so no decision gets made.
Nobody has ever asked him about it.
He is being careful in the one way that's guaranteed to cost him. Sound like you're judging him and you've lost him. Sound like the first person who understood it and you haven't.

And sometimes cash is exactly right
Money needed in six months. A house completing in March. An emergency fund — always.
The problem isn't cash. The problem is cash held for nine years "temporarily."

FOUR QUESTIONS
Ask one. Then stop talking.
1. "How much are you holding in cash — across how many currencies — and how long has it been sitting there?"
2. "What's it earning?" → then "And what's inflation been doing?"
3. "What's your pension actually invested in?"
4. "What are you waiting for, specifically?"
That last one is the best question here. He usually can't name it — and the moment he tries, he hears himself.

RED LINES
"You should be more in equities." — That's a personal recommendation. Naming a class is fine. Suggesting an allocation is advice — not yours to give.
"Equities will give you 7% a year." — A performance promise. History is not a forecast.
Doing his maths out loud — "you've lost £40k" — You don't know that, you can't stand behind it, and it sounds like an attack. Ask. Then wait.
Sneering at gold, crypto, property, Premium Bonds — He's telling you what he believes. Contempt ends the call. Ask what proportion, and why.
"Cash is bad." — Not always. Say it to a man completing on a house and you'll deserve what follows.
Claiming something has no weak spot — Growth with no risk does not exist. The moment you say it, you've become the salesman this session is meant to protect people from.

WHERE YOU STOP
"That's exactly the sort of thing the adviser looks at properly — he'll ask about your time horizon and how much of a fall you could actually live with."
You are not the analyst. You're the one who noticed.

IF YOU REMEMBER NOTHING ELSE
1. Returns, Liquidity, Security, Simplicity — and nothing is good at all four.
2. "Doesn't move" is not the same as "safe."
3. Ask which two matter most to him. Then look at what he actually holds.
4. Find the cash. How much, how many currencies, how long — and what is he waiting for?
Every investment is a trade. Your job is to find out what he traded away — and whether he knew he was doing it.

deVere BDA Induction · Week 1 · Asset Classes`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },

  // REGULATIONS SECTOR
  {
    sector: 'Regulations',
    title: 'Global Taxes — You Don\'t Leave a Tax System',
    summary: 'You don\'t leave a tax system, you add one. UK IHT tail: 10 of last 20 years = worldwide estate in scope, 3-10 year tail after leaving. IHT on pension death benefits from April 2027. US persons: escalate immediately. Deemed residence (India). Exit taxes (Canada, Australia). "Has anyone actually checked?"',
    content: `HANDOUT
Global Taxes — You Don't Leave a Tax System
You will never give tax advice. You are learning to spot a question nobody has asked him.

Read this first. You will never give tax advice. Not "you'll pay this." Not "you won't pay this" — reassurance is advice too. You are not learning tax. You are learning to spot a question nobody has asked him.
The only sentence you need: "Has anyone actually checked?"
He'll say no. He'll say no nearly every time. That's the meeting.

THE ONE IDEA
Every UK tax rule you grew up with was built on one assumption: that you live in the UK. Take the assumption away and the rules don't disappear. They just stop being the only ones.
You don't leave a tax system. You add one.

WHAT SURVIVES WHEN HE LEAVES
A prospect in Dubai will tell you he doesn't pay tax. He believes it. Here's what's actually still live:
UK income tax — he assumes it's gone. Reality: the flat he rents out back home is UK-source income. Still UK-taxable, however long he's been away.
UK capital gains tax — he assumes it's gone. Reality: non-residents pay UK CGT on UK property. Twenty years in Dubai doesn't change that.
UK pension — he assumes it's gone. Reality: generally still taxable at source — unless a treaty says otherwise. Which treaty, and which type of pension, changes the answer.
His ISA — he assumes it's gone. Reality: he can't contribute any more. And most countries don't recognise an ISA at all — so it may be fully taxable where he now lives, while he thinks it's his tax-free pot.
Inheritance tax — he assumes it's gone. Reality: he almost certainly did not escape it. See below.

THE ONE NOBODY KNOWS ABOUT
On 6 April 2025 the UK changed how inheritance tax works. It used to depend on domicile. It doesn't any more — now it's about residence.
- If someone was UK tax resident for 10 of the last 20 tax years, their worldwide estate is in scope for UK inheritance tax — 40 per cent above the nil-rate band.
- Leaving doesn't switch it off. There's a tail: at least three years, and up to ten, depending on how long they lived in the UK.
The rules changed just over a year ago. Most prospects left the UK long before that — and nobody has written to them about it.
"You left the UK in 2017. Has anyone told you your worldwide estate is probably still in the UK inheritance tax net?"
That question is true, it's about him, and it's about his estate — which he cares about more than almost anything else you could raise. And the natural next question is: "When did your adviser last call you about it?"

ONE MORE — THE SPOUSE
If someone in the UK inheritance tax net leaves everything to a spouse who isn't, the usual unlimited spousal exemption can be restricted. A British man in Dubai with a Portuguese wife is not an edge case. He's the typical prospect.
"Is your wife British?" — an innocent question with a very sharp edge. Then stop. "That's exactly the sort of thing the adviser needs to look at."

WHY TWO COUNTRIES CAN TAX THE SAME MONEY
Because they grab you by different handles.
Residence — Where do you live? Most countries. Usually taxes worldwide income. "I left in 2017" is not the same as "I'm non-resident."
Source — Where does the money come from? The UK taxes UK rent, UK property gains, most UK pensions — wherever you live.
Long-term residence — How long were you there, and how recently? The estate hook.
Citizenship — What passport? The United States — and almost nowhere else.
Double tax treaties don't mean you pay nothing twice. They decide which country gets to tax what — and sometimes that means paying the higher of the two rates.

THE UK NUMBERS — 2026/27
Know these. "About forty percent" sounds like a guess. "Forty per cent above £325,000, and it's been frozen since 2009" sounds like you know what you're talking about. Specificity is credibility.
Personal allowance: £12,570 — frozen since 2021, frozen until 2031
Basic rate — 20%: £12,571 – £50,270
Higher rate — 40%: £50,271 – £125,140
Additional rate — 45%: above £125,140
The 60% band: £100,000 – £125,140 — the personal allowance tapers at £1 for every £2. The real marginal rate is 60%, and almost nobody knows it exists.
Dividends: £500 allowance · 10.75% / 35.75% / 39.35% (the first two rose in April 2026)
Savings allowance: £1,000 basic · £500 higher · £0 additional
National Insurance: 8% on £12,570–£50,270 · 2% above
Capital gains: £3,000 exempt (it was £12,300 three years ago) · 18% / 24%
ISA: £20,000 (LISA £4,000 within it · JISA £9,000)
Pension annual allowance: £60,000 · tapers to £10,000 for high earners · tax-free lump sum capped at £268,275
Inheritance tax: 40% above £325,000 (plus a £175,000 residence band) — unchanged since 2009, frozen until 2031
Scotland sets its own income tax bands. Dividends and savings are UK-wide.

WHAT'S CHANGING — AND THE DATES ARE ALREADY LAW
6 April 2027 — Most unused pension funds come INTO the estate for inheritance tax.
6 April 2027 — Separate, higher rates on property income and savings income — 22% / 42% / 47%
April 2028 — Pension access age rises from 55 to 57
Look at the first one. The UK pension — the exact thing you're calling people about — has always sat outside the estate. In April next year, it doesn't. Stack that on the inheritance tax tail, and a man who thinks he escaped UK IHT is about to have his pension pulled back into it. Two changes. Nobody has told him about either.
"Do you know what's happening to UK pensions and inheritance tax in April next year?"

The line between sharp and sleazy:
"The rules change on 6 April 2027." — a fact with a date on it.
"You need to act now before it's too late." — manufactured urgency. Never.
State the date. Let him supply the urgency.

NOT EVERY CLIENT IS BRITISH
The UK is where we started because it's where most of you started. It is not the model. You'll call Indians, South Africans, Australians, Dutch, French, Americans. Some countries let go. Some never do.

1 · The passport follows you — the United States
US citizens and green-card holders are taxed by America on worldwide income wherever they live, forever. Their rules also make most of the funds we'd normally use actively punitive for them to hold.
A US person is not a harder client. He's a different animal. Stop, flag, escalate. Ask about the spouse too.

2 · You left — but they haven't finished with you
UK: 10 of 20 years → worldwide estate, with a 3–10 year tail after leaving
India: Deemed residence — an Indian citizen with Indian income above ₹15 lakh who isn't paying tax anywhere else can be treated as resident even without setting foot in India
Netherlands: A deferred claim on the pension — for up to 10 years after leaving
Sweden / Nordics: Residence can persist until he can prove he cut his ties
Read the India rule again. Indian citizen. Indian income. Living somewhere with no income tax. That is an Indian national living in Dubai — and the rule was written to catch him.
"Has anyone ever explained deemed residence to you?"

3 · Some tax you on the way out
Canada, Australia, South Africa, Germany, France, Spain. They can charge you for leaving — usually by pretending you sold everything on the day you stopped being resident.
"When you left — did anyone deal with the tax side of leaving, or did you just go?"
The answer is nearly always: "I just went."

4 · Sometimes it's the asset, not the person
If someone dies holding more than $60,000 of US shares or US-listed ETFs — Apple, Microsoft, an S&P 500 tracker — their estate can face US tax of up to 40 per cent. They do not have to be American. At all. A British engineer in Dubai who's never set foot in the States is exposed.
"Do you hold any US shares or US-listed ETFs directly, in your own name?" Then stop. "There's a rule about US-listed holdings and estates that catches a lot of people. Has anyone ever looked at how yours are held?"

THE MOST VALUABLE QUESTION YOU OWN
"Which passport do you hold — and which one does your wife hold?"
That is not small talk. It's a tax question wearing a friendly hat.

THE FLAGS — WHAT YOU'RE LISTENING FOR
UK property → "Do you still own anything back in the UK?"
UK pension → "Did you build up a pension before you left?"
How long, and when → "How long were you in the UK before you went?"
The spouse → "Is your wife British?"
The will → "Which country's law does your will fall under?"
Going back → "Are you planning to come back at some point?"
Filings → "Have you filed anything in the UK since you left?"
US connection → "Any US citizenship or green card — you or your wife?" → STOP. Flag it. Escalate.
Every one of those is a question. Not one is a claim. That's the design.

RED LINES
"So you're non-resident." — Never. That's a statement of fact you're not qualified to make. The test involves day counts and ties.
"You won't owe anything." — Never. Reassurance is advice. It's the one you won't see coming.
"Avoid tax." — Never. Not in any room, in any tone. The words are: mitigate, structure, plan — legally, with an adviser.
"You'd probably owe about £40k." — Never quantify. He'll repeat it, act on it, and it'll be wrong.
"HMRC will find you." — Fear-mongering. Say instead: "Everything's visible now — which means it's worth knowing your position is right."
Proceeding with a US person — FATCA and PFIC rules make most non-US funds toxic. Real damage to a real person. Escalate.

WHERE YOU STOP
"I'm not the person who can tell you that — and honestly, anyone who gives you a number on a first phone call is guessing. That's exactly what my consultant does properly."
That is not a dodge. It's the truth — and it's more reassuring than a confident wrong answer.

IF YOU REMEMBER NOTHING ELSE
1. You don't leave a tax system. You add one.
2. The UK estate rules changed in April 2025 — and he almost certainly doesn't know.
3. Not every client is British. Some countries let go. Some never do.
4. Every flag becomes a question. Never an answer.
5. "Has anyone actually checked?"

You will never tell him what he owes.
You will tell him that nobody has ever looked.

deVere BDA Induction · Global Taxes
Tax rules change. This document reflects the position as at July 2026 and is training material, not advice.`,
    brief_depth: 'detailed',
    source: 'devere_training',
    source_agent: 'APOLLO',
  },

]

// Run the filing
async function main() {
  console.log(`Filing ${entries.length} entries to MUSE...`)
  for (const entry of entries) {
    const now = Math.floor(Date.now() / 1000)
    await saveEntry({
      ...entry,
      status: 'active',
      date_filed: now,
      last_updated: now,
    })
    console.log(`✅ Filed: ${entry.title} → ${entry.sector}`)
  }
  console.log('Done.')
}

main().catch(console.error)
