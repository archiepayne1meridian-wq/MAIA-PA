// Seeds the full deVere Products flashcard deck (10-14 cards per module, on top of the
// anchor card from seed-devere-modules.ts). Content is drawn directly from the deVere BDA
// training material already filed to MUSE (muse_entries: What is Wealth Management, Problems
// Clients Face — PEPSI Framework, UK Pensions — DC vs DB, Pension Questions — The Card,
// QROPS, Where the Money Sits, The Portfolio Bond — Full Mechanics, Asset Classes — Full Grid
// Reference, Compounding — The Engine, Global Taxes, Why deVere — The Three Questions).
// No fact here is outside that material.
//
// Idempotent — re-running skips any card whose front text already exists for its module+track.
//
// Run: npx tsx scripts/seed-devere-flashcards.ts (run seed-devere-modules.ts first)

import path from 'path'
process.loadEnvFile(path.join(process.cwd(), '.env'))

import { getDb } from '../src/db'
import { study_cards } from '../src/db/schema'
import { eq, and } from 'drizzle-orm'
import { addCards } from '../tools/study-db'
import { DEVERE_PRODUCTS_MODULES } from './seed-devere-modules'

interface CardSeed { front: string; back: string }

const MODULE_CARDS: Record<string, CardSeed[]> = {
  'Wealth Management Fundamentals': [
    { front: "What's the real cause of most clients' financial problems — bad advice or something else?", back: "Moving, not mistakes. Internationally mobile people build a financial life in one country then leave — nothing rearranges itself to follow. They're usually un-advised, not badly advised." },
    { front: "Why are clients' financial problems described as \"quiet\"?", back: "Nothing looks wrong from the outside — the cost only surfaces at retirement, on death, or when a tax authority asks a question, by which point it's expensive." },
    { front: 'What does PEPSI stand for, and why does the order matter?', back: "Protection, Estate Planning, Pensions, Savings, Investment — in that priority order. There's little sense growing money that isn't protected, or investing around a pension nobody has reviewed. Investment comes last." },
    { front: "What is a BDA's role in the advice chain?", back: 'You are not the adviser. The chain is BDA → adviser → client outcome — your job is to find people with a real problem and open a good conversation; advice is a regulated activity that belongs to the adviser.' },
    { front: 'A prospect asks "so what should I do?" mid-call. What\'s the correct BDA answer?', back: '"That\'s exactly what the adviser will look at properly." Not a dodge — the correct professional answer, since giving advice isn\'t the BDA\'s role.' },
    { front: "What does deVere's scale offer a mobile client?", back: "100,000+ clients and $14bn under management — continuity: deVere is \"still there\" when the client moves, not size for its own sake." },
    { front: 'How many local licences does deVere hold, and why does that matter for a mobile client?', back: '30+ local licences across 100+ regulated entities — meaning local protections and local dispute resolution, rather than passporting one licence across borders.' },
    { front: "What are the two things to be careful with in a BDA's language?", back: 'Never make a performance claim ("designed to" is not "will" — structured products carry capital and counterparty risk), and never inflate a client\'s problem — the truth is persuasive enough on its own.' },
    { front: 'What is an "internationally mobile client"?', back: 'Someone living, earning, or holding assets outside their home country — usually across more than one jurisdiction.' },
    { front: 'What is "regulated advice"?', back: 'A personal recommendation, which may only be given by a qualified, authorised adviser — not a BDA.' },
    { front: 'What is a structured product, per deVere training material?', back: "An investment with a defined outcome linked to a market, with defined risks — including capital risk and counterparty risk. It's never described as protecting someone's money." },
    { front: 'Why does a domestic, single-country adviser struggle to help an internationally mobile client?', back: "Cross-border complexity and tax aren't extra problems alongside the others — they're a multiplier on all of them. The client has the same problems as someone who never left home, just entangled across several countries." },
  ],
  'UK Pensions — DC & DB': [
    { front: 'How does a DC pension build up ("in")?', back: 'You (~5%) + employer (~3%) + tax relief go in. Auto-enrolment since 2012 means most people have one per job.' },
    { front: 'How does money come out of a DC pension?', back: '25% tax-free (capped at £268,275), the rest taxed as income — via annuity, drawdown, or lump sums.' },
    { front: "How is a DB pension's income calculated?", back: 'Years of service × accrual rate × salary. E.g. 20 years × 1/60th × £60,000 = £20,000 a year, for life.' },
    { front: 'What is a CETV?', back: 'Cash Equivalent Transfer Value — the cash figure a DB scheme can be exchanged for, roughly 20× the annual income.' },
    { front: 'What is the PPF, and when does it matter?', back: "The Pension Protection Fund — the safety net if a DB scheme's employer becomes insolvent. Pays reduced, capped benefits." },
    { front: "What typically happens to a DB pension on death?", back: 'Around 50% passes to a spouse — and often nothing beyond that. Compare DC, where the whole remaining pot can pass on.' },
    { front: 'When does the UK pension access age rise from 55 to 57?', back: 'April 2028.' },
    { front: 'What are the rules on the UK state pension for someone living abroad?', back: "It's frozen abroad unless the person lives in the EEA, Switzerland, or a country with a UK social-security agreement — e.g. in the UAE, Canada, or Australia it stops rising once drawn." },
    { front: 'A client calls his DB pension "gold-plated." What\'s the right BDA response?', back: 'Ask, don\'t tell — "You called it gold-plated — what makes you feel that way? Has anyone walked you through what it actually does?"' },
    { front: 'What is the "scale question" and why is it useful?', back: '"On a scale of one to ten, how happy are you with how that\'s being looked after?" It\'s almost never a ten, and the follow-up ("what would need to change to make it a nine?") gets the client to name the problem themselves.' },
    { front: 'What is TED, and when do you use it?', back: "The BDA's panic button for a dying call — start the next sentence with Tell me about… / Explain… / Describe… to get the conversation back." },
    { front: 'What cross-border question is worth asking about a DC pension?', back: '"Does the scheme even know you live outside the UK now? What currency will you draw it into?"' },
    { front: 'What is QROPS?', back: "Qualified Recognised Overseas Pension Scheme — a vehicle for transferring UK-registered pension assets into an HMRC-recognised overseas scheme, commonly used by UK expats relocating abroad. Eligibility and host-country tax treatment must be checked by an adviser." },
  ],
  'Wrappers — Where the Money Sits': [
    { front: 'What\'s the difference between "what you hold" and "what you hold it in"?', back: 'What you hold is the investment (shares, a fund, cash); what you hold it in is the wrapper (bank account, ISA, GIA, pension, bond) — and the wrapper is what decides the tax treatment.' },
    { front: 'What does a bank account hold, and how is it taxed?', back: 'Cash only — interest is taxed as income, wherever the holder is resident. Instant access. This is where most expat money actually sits.' },
    { front: 'What happens to an ISA when someone leaves the UK?', back: "It freezes. Still tax-free, still theirs — but they can't contribute any more. Nothing new goes in." },
    { front: 'What can a GIA ("trading account") hold, and how is it taxed?', back: "Anything, with no limits — but it's fully taxable: tax on income and on gains as they arise. It's the default place money goes once the ISA is full or unavailable." },
    { front: 'How is a pension (SIPP or workplace) taxed, and when can it be accessed?', back: 'Grows tax-free inside the wrapper, taxed as income on the way out. Locked until age 55, rising to 57 in 2028.' },
    { front: 'How does an offshore/portfolio bond treat tax compared to an ISA?', back: 'It defers tax rather than removing it — no tax on growth while it stays inside, but tax is due later. An ISA is genuinely tax-free; a bond is tax-deferred.' },
    { front: 'Is a platform a wrapper?', back: "No — it's the administrative system that holds investments. It's tax-neutral in itself (plumbing, not a wrapper) and charges its own separate fee." },
    { front: 'When someone leaves the UK, what happens to money that would previously have gone into an ISA?', back: "It has nowhere tax-free to go, so it lands in a GIA or bank account instead — taxable, in a country whose rules the client has probably never checked." },
    { front: 'Same £200,000 fund, three wrappers — what\'s the tax difference?', back: 'In an ISA: no tax on growth, income or withdrawal. In a GIA: taxed as it arises, each year. In a bond: no tax while it stays inside — deferred to withdrawal. Identical fund, three different outcomes.' },
    { front: 'What are the four wrapper questions to ask a prospect?', back: '"Where does that money actually sit?" / "Is that a bank account, an ISA, a trading account — do you know?" / "When did you last look at it?" / "Has anyone reviewed whether that\'s still the right place for it, since you moved?"' },
    { front: "What's the red line on discussing a client's wrapper choice?", back: "Never tell them which wrapper they should be in (that's a personal recommendation) and never quantify their tax — a made-up number is a false statement." },
    { front: 'A prospect says "I don\'t really know, my adviser sorted it." What should a BDA do with that answer?', back: 'Treat it as the finding, not a dead end — "Would it be useful to actually find out?" It\'s the most common answer, and the reason for the meeting.' },
  ],
  'The Portfolio Bond': [
    { front: 'What is "gross roll-up" inside a portfolio bond?', back: "Investments grow free of income and capital gains tax inside the wrapper — funds can be switched or rebalanced without triggering a tax event, because the client owns the contract, not the underlying assets." },
    { front: 'What is the 5% annual withdrawal allowance?', back: "Up to 5% of the premium can be withdrawn each policy year for 20 years with no immediate UK income-tax charge — cumulative, but tax-deferred, not tax-free (settled at the eventual chargeable event)." },
    { front: 'What is time-apportionment relief?', back: 'The eventual taxable gain is reduced in proportion to the time the holder spent non-UK-resident — someone non-resident for half the bond\'s life sees the taxable gain roughly halved.' },
    { front: 'What is the PPB residency rule?', back: 'A Personal Portfolio Bond held by a UK resident is taxed punitively — HMRC assumes a notional gain of 15% of premium per year. PPBs are for non-UK residents only.' },
    { front: 'How does a portfolio bond compare in cost to an investment platform?', back: 'A bond charges around 1% a year for 10 years on the premium, plus admin; a platform charges around 0.35% a year on the whole pot. The bond only earns its place if the tax saving genuinely beats the cost.' },
    { front: 'What is the "pizza" structure of a portfolio bond?', back: 'The bond is divided into many identical segments, like slices of a pizza — each a mini-policy in its own right, so a client can cash in individual segments without disturbing the rest.' },
    { front: 'Where is a deVere portfolio bond typically domiciled?', back: 'Isle of Man, Dublin (for EEA clients), or Mauritius.' },
    { front: 'Who owns what in a portfolio bond structure?', back: "It's an insurance contract — the provider owns the underlying assets, the client owns the contract. That single fact drives the tax treatment." },
    { front: 'What is top-slicing relief?', back: "A UK-resident mechanic that softens a one-off gain by spreading it over the policy's life." },
    { front: 'What is the temporary-non-residence trap?', back: 'A non-resident who cashes in a bond abroad and then returns to the UK within about five years can have the gain pulled back into UK tax under anti-avoidance rules.' },
    { front: 'Can a portfolio bond be funded with existing assets rather than cash?', back: 'Yes — it can be funded "in specie," by transferring assets in rather than only cash.' },
    { front: 'Is a portfolio bond ever the wrong answer?', back: "Yes — where there's no tax to defer, the benefit disappears, so a bond only earns its place through tax, not automatically. The right wrapper is matched to the client's needs and tax position, not the one that pays the most." },
  ],
  'Asset Classes': [
    { front: 'Why is "simplicity" not just a nice-to-have when picking an investment?', back: "If a client can't explain what he owns, he doesn't understand it — and he'll sell it at the worst possible moment, which is exactly when it's falling." },
    { front: 'In the four-box grid, what is cash secure against, and what is it not secure against?', back: "Secure against falling — completely. Not secure against still buying what you need in real terms over time, i.e. inflation." },
    { front: 'Using the Rule of 72, how long does it take buying power to halve at 3% inflation?', back: '72 ÷ 3% ≈ 24 years.' },
    { front: 'Which asset class is described as the "simplest thing in the grid," and why does that surprise people?', back: '"You own a bit of a company, if it does well, you do well" is one sentence. People assume equities are complicated when actually corporate bonds and hedge funds are the complicated ones.' },
    { front: 'What happened to existing bond prices when interest rates rose sharply in 2022?', back: "They fell — nobody wants an old 2% bond when a new one pays 5%. A fund with 6-year duration falls roughly 6% if rates rise 1%." },
    { front: "Why is property's \"simplicity\" described as an illusion?", back: 'A mortgaged buy-to-let is a borrowed, hard-to-sell bet on one street in one town, in one currency — the movement is hidden, not absent, because nobody prices it daily.' },
    { front: 'What does gold actually pay an investor?', back: "Nothing — no rent, no dividend, no coupon. It's a pure bet on price, the same as crypto." },
    { front: 'What is the "grid" call tool question?', back: '"Of those four — growth, being able to get at it, not losing it, and actually understanding it — which two matter most to you?" Then compare the answer to what the client actually holds.' },
    { front: 'How much cash does the average unadvised investor hold, per Russell Investments, and how does that compare to expats?', back: "Around 20% of the average unadvised investor's portfolio; expats routinely run at 40%+, across several currencies, for years." },
    { front: 'Why is a client holding too much cash usually "being careful" rather than "being reckless"?', back: "Every option feels like a bet when he earns in one currency, thinks in another, and might retire in a third, so no decision gets made — he's being careful in the one way guaranteed to cost him." },
    { front: 'When is holding cash exactly right?', back: 'Money needed in six months, a house completing soon, or an emergency fund — always. The problem isn\'t cash itself, it\'s cash held for years "temporarily."' },
    { front: "What are the four questions to ask about a client's cash pile?", back: "How much, across how many currencies, and how long has it been sitting there? / What's it earning, and what's inflation been doing? / What's your pension actually invested in? / What are you waiting for, specifically?" },
  ],
  'Compounding & Charges': [
    { front: '£10,000 growing at 8% a year for 40 years — what\'s the illustrative result, and why does it surprise people?', back: 'Around £217,000, of which only £10,000 was ever paid in. Most people sketch a straight line when asked to guess, but compounding doesn\'t work in straight lines.' },
    { front: 'Why does compounding accelerate over time rather than growing steadily?', back: 'The percentage never changes, but the base it applies to gets larger each year — so the same 8% does far more work in year thirty than in year one.' },
    { front: 'Saver A pays £200/month from 25–35 then stops. Saver B pays £200/month from 35–65 without missing a month. Who ends up ahead at 65, illustratively?', back: 'Saver A — despite paying in a third as much (£24,000 vs £72,000) and stopping at 35, because the ten years at the start were worth more than the thirty years that followed.' },
    { front: 'What does a 0.5% annual charge cost over 20 years on £500,000 growing at 6%?', back: 'Illustratively around £1.46m vs £1.60m with no additional cost — roughly £140k lost. It sounds small annually; it isn\'t over two decades.' },
    { front: 'What is "cost drag"?', back: 'The compounding effect of charges — not just the charge itself, but everything that money would have gone on to earn.' },
    { front: 'Why is "doing nothing" not the safe option with an old pension?', back: "On realistic numbers, waiting typically costs more than paying higher charges — someone leaving a pension untouched for ten more years is choosing between two costs, usually without realising it, and picking the larger one." },
    { front: 'What three things should a BDA ask about an old pension or pot of savings?', back: 'How long has it been sitting there? When were you planning to look at it? Do you know what you\'re paying — adviser, platform and fund, separately — and what has it got you?' },
    { front: 'What is simple interest, and how does it differ from compounding?', back: 'Growth on the original amount only — far weaker over time than compounding, where returns are added to the pot and then themselves earn returns.' },
    { front: 'If a client asks what deVere charges, what\'s the right response?', back: "It's a fair question and deserves a straight answer — tell them clearly and offer to set it out line by line." },
    { front: 'At a 10% growth rate, roughly how often does money double, using the Rule of 72?', back: '72 ÷ 10% ≈ every 7.2 years.' },
    { front: 'Should the Rule of 72 or illustrative doubling figures ever be presented as a guarantee?', back: 'No — always described as an illustration of how doubling works, never as a projection of what anyone will actually have.' },
    { front: 'Someone aged 45 retiring at 69 (24 years away), growing at roughly 6% — how many doublings is that illustratively?', back: 'About two doublings, since money roughly doubles every 12 years at 6% (72 ÷ 6 = 12).' },
  ],
  'Global Taxes': [
    { front: 'A UK expat in Dubai believes he pays no UK tax. What actually still applies?', back: 'UK income tax on any UK-source income (e.g. a rented-out UK flat), UK CGT on UK property, tax on most UK pensions (unless a treaty says otherwise), and potentially UK inheritance tax.' },
    { front: 'What changed about UK inheritance tax on 6 April 2025?', back: "It moved from being based on domicile to being based on residence — someone UK tax resident for 10 of the last 20 tax years has their worldwide estate in scope for UK IHT at 40% above the nil-rate band." },
    { front: 'What is the IHT "tail" after someone leaves the UK?', back: "At least three years, and up to ten, depending on how long they lived in the UK — leaving doesn't switch off UK IHT exposure immediately." },
    { front: 'What is changing to UK pensions and inheritance tax from 6 April 2027?', back: "Most unused pension funds come into the estate for inheritance tax — pensions that have always sat outside the estate will be pulled into it." },
    { front: 'Why might a British man in Dubai with a non-British wife face IHT exposure a client with a British wife wouldn\'t?', back: "If someone in the UK IHT net leaves everything to a spouse who isn't also in that net, the usual unlimited spousal exemption can be restricted." },
    { front: 'What is the "60% band" in UK income tax, and why does almost nobody know it exists?', back: 'Between £100,000–£125,140, the personal allowance tapers at £1 for every £2 earned, making the real marginal rate 60% — a hidden effect of the taper, not a published rate.' },
    { front: 'Why can two countries tax the same money?', back: 'Because they "grab by different handles" — residence (where you live), source (where the money comes from, e.g. UK property), long-term residence (the estate hook), and citizenship (mainly the US).' },
    { front: 'What makes a US citizen or green-card holder a different case entirely?', back: "They're taxed by the US on worldwide income wherever they live, forever — and US rules make most non-US funds punitive for them to hold. The correct BDA response is: stop, flag, escalate." },
    { front: 'What is "deemed residence," using the India example?', back: "An Indian citizen with Indian income above ₹15 lakh who isn't paying tax anywhere else can be treated as an Indian tax resident even without setting foot in India." },
    { front: 'Which countries can tax someone on the way out ("exit tax")?', back: 'Canada, Australia, South Africa, Germany, France, Spain — they can charge tax on leaving by treating it as if the person sold everything on the day they stopped being resident.' },
    { front: 'What US-specific estate tax rule can catch a non-American?', back: 'If someone dies holding more than $60,000 of US shares or US-listed ETFs, their estate can face US tax of up to 40% — regardless of the holder\'s nationality.' },
    { front: 'What is the one question a BDA is always allowed to ask about a client\'s tax position?', back: '"Has anyone actually checked?" — the answer is nearly always no, and that\'s the meeting.' },
    { front: 'What are the red-line phrases a BDA must never say about tax?', back: '"So you\'re non-resident," "you won\'t owe anything," "avoid tax," any specific quoted amount owed, and "HMRC will find you" — reassurance and quantification are both a form of advice.' },
  ],
  'Why deVere': [
    { front: 'What is question 2 of the three questions, and why do most new BDAs get it wrong?', back: '"Why pay for advice?" Most new BDAs start at question 3 ("why this firm") because it\'s what they\'ve just learned — but it doesn\'t land until questions 1 and 2 are answered first.' },
    { front: 'What minimum allocation do institutional structured products typically require directly from an issuing bank?', back: '£50–100 million — out of reach for most advisers and most private clients dealing directly.' },
    { front: "What allocation does deVere's pooled demand bring that access down to?", back: '£10,000–£25,000, versus the £500,000+ typically required to deal directly with a private bank.' },
    { front: 'How much cheaper are the institutional fund share classes deVere can access, typically?', back: '0.5–1.0% a year cheaper than retail equivalents.' },
    { front: "Why can't a home-country adviser usually keep advising a client who has moved abroad?", back: "Advising a client legally requires a licence in the country where they live — a licence from one country doesn't automatically work in another." },
    { front: 'How many jurisdictions does deVere hold local licences in?', back: '30+.' },
    { front: 'What does "whole of market" mean, in deVere\'s case?', back: "deVere holds no ownership stake in any product provider and fees are disclosed line by line — the recommendation follows the client's circumstances rather than a restricted product range." },
    { front: 'What does "repatriation" describe, and why is it a weak point for many clients?', back: "A client returning home to find their expat adviser can no longer help and a domestic adviser couldn't advise them until they landed — a service gap deVere's continuity is designed to close." },
    { front: "What are two of the \"questions worth asking\" a prospect about their existing arrangement?", back: '"Can they recommend a product from any provider, or are they restricted to a range?" and "What happens to your arrangement if you move country again?"' },
    { front: "What is a structured product's actual risk profile, per deVere training?", back: "Capital is at risk and there's counterparty risk — it's a component within a diversified portfolio, never described as a strategy in itself." },
    { front: "Why does deVere's training material favour a precise number over a strong adjective?", back: 'Specific, verifiable facts are more compelling than superlatives, and they hold up when challenged — the truth is already impressive.' },
    { front: 'What is counterparty risk?', back: 'The risk that the institution behind a product fails to meet its obligations.' },
  ],
}

async function main() {
  const db = getDb()
  const moduleNames = new Set(DEVERE_PRODUCTS_MODULES.map(m => m.name))
  const seedModules = Object.keys(MODULE_CARDS)
  const missing = seedModules.filter(m => !moduleNames.has(m))
  if (missing.length > 0) throw new Error(`MODULE_CARDS references unknown module(s): ${missing.join(', ')}`)

  let totalInserted = 0
  let totalSkipped = 0

  for (const [moduleName, cards] of Object.entries(MODULE_CARDS)) {
    const existingRows = await db
      .select({ front: study_cards.front })
      .from(study_cards)
      .where(and(eq(study_cards.module, moduleName), eq(study_cards.track, 'products')))
    const existingFronts = new Set(existingRows.map(r => r.front))

    const toInsert = cards.filter(c => !existingFronts.has(c.front))
    const skipped = cards.length - toInsert.length

    if (toInsert.length > 0) {
      await addCards(toInsert.map(c => ({ module: moduleName, front: c.front, back: c.back, track: 'products' })))
    }

    totalInserted += toInsert.length
    totalSkipped += skipped
    console.log(`${moduleName}: +${toInsert.length} card(s)${skipped > 0 ? `, ${skipped} already present` : ''}`)
  }

  console.log(`\nTotal: ${totalInserted} inserted, ${totalSkipped} skipped.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
