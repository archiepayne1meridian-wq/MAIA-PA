// Default HERMES call script data — verbatim port of the DEFAULT DATA block from
// call_script_tool.html. This is the fallback returned by GET /api/dashboard/hermes/script
// when no row exists in hermes_script yet (and after a reset).

export type ScriptLine = string | { q: string; plant?: string; note?: boolean }

export interface Persona {
  label: string
  intro: string
  opener: string[]
  drawers: {
    pension: ScriptLine[]
    investments: ScriptLine[]
    cash: ScriptLine[]
  }
  pensionPivot?: string
  investmentsPivot?: string
  cashPivot?: string
  usFlag?: boolean
}

export interface ObjectionVariant {
  label: string
  text: string
}

export interface Objection {
  label: string
  variants: ObjectionVariant[]
}

export interface SharedScript {
  disturb: string[]
  close_gate: string
  close_next: string
  close_funnel: string[]
  soft_landing: string[]
  end_booked: string[]
  end_exit: string
}

export const USFLAG = "(Any US citizenship or green card — his or his spouse's — stop, don't quantify or reassure on tax, flag for escalation.)"

export const DRAWER_LABELS: Record<'pension' | 'investments' | 'cash', string> = {
  pension: 'Pension', investments: 'Investments', cash: 'Cash / Savings',
}

const CASH_DRAWER: ScriptLine[] = [
  "Tell me, is that just sitting in a normal savings account?",
  "What rate's that earning at the minute?",
  "And what's inflation running at right now?",
  "Talk me through why you're holding it there — is it about liquidity, low risk, something else?",
]

const CASH_PIVOT = "So if I could get you something with that same liquidity, that same low risk, but actually designed to grow ahead of inflation — would that be worth a look?"

export const DEFAULT_PERSONAS: Record<string, Persona> = {
  generic: {
    label: 'Generic',
    intro: "Good morning/afternoon, is that [Name] speaking?\n\nMy name is Archie and I'm calling on behalf of deVere Switzerland.\n\nWhat we do at deVere is help people build a financial future that's tailored to them — structuring their investments efficiently, reducing your tax burden, and giving international professionals like yourself a portable plan that keeps working for you wherever you're based.\n\nSo, in order to make sure I give you the best explanation possible — would it be ok to ask you a few quick questions?",
    opener: [
      "So just to get a picture of things — roughly how long have you been in Switzerland?",
      "And where were you before that, roughly how long were you there?",
      "Do you see yourself staying here long-term, or is this more of a stepping stone for you?",
      "When the day comes you don't have to work anymore — what have you got in place?",
    ],
    drawers: {
      pension: [
        "Tell me, when was the last time your provider actually contacted you?",
        "Describe the funds it's invested in, and when those were picked.",
        { q: "Do you know if that's a defined benefit or defined contribution scheme?", plant: "Defined benefit — your employer's promised you a percentage of final salary. Defined contribution — you and your employer paid into a pot each month, which sits in funds. Most workplace pensions people left behind are DC." },
        "On a scale of one to ten, how happy are you with how it's performed?",
        "Explain how it's taxed now you're living abroad.",
      ],
      investments: [
        "Tell me what you're invested in — is that something you pick yourself, or is it in funds?",
        "Explain how many funds or stocks you can actually choose from on that platform.",
        "Roughly how many different accounts or platforms is this spread across right now?",
        "Is this a lump sum sitting there, or something you're adding to regularly?",
        "Talk me through what currency that's actually held in.",
        "What happens if you're earning or spending in a different currency to that?",
        "Describe what happens to it if you move country again — does it come with you, or do you have to start over?",
        "Tell me whether that's wrapped in anything, or just a straight account.",
        "Explain how it's taxed at the minute.",
        "Describe your risk level with that.",
        "Do you plan on holding it long term?",
      ],
      cash: CASH_DRAWER,
    },
    cashPivot: CASH_PIVOT,
  },

  uk: {
    label: 'UK-Connected',
    intro: "Good morning/afternoon, is that [Name] speaking?\n\nMy name is Archie — I work alongside a senior wealth manager here, Stephen Smith. We specialise in cross-border financial planning for British-connected professionals based here in Switzerland — structuring things properly so you're not paying more tax than you need to, and making sure your plan actually works wherever you end up next.\n\nWould it be alright to ask you a couple of quick questions, so I know exactly where you stand?",
    opener: [
      "So just to get a picture of things — roughly how long have you been in Switzerland?",
      "And where were you before that — the UK, was it? Roughly how long were you there?",
      "Do you see yourself staying out here long-term, or moving back at some point?",
      "You mentioned coming over from the UK — did you leave a pension behind when you made the move?",
    ],
    drawers: {
      pension: [
        "Tell me, when was the last time your provider actually contacted you?",
        "Describe the funds it's invested in, and when those were picked.",
        { q: "Do you know if that's a defined benefit or defined contribution scheme?", plant: "Defined benefit — your employer's promised you a percentage of final salary. Defined contribution — you and your employer paid into a pot each month, which sits in funds. Most workplace pensions people left behind are DC." },
        "On a scale of one to ten, how happy are you with how it's performed?",
        "Explain how it's taxed now you're living outside the UK.",
        "Talk me through anything you've filed on it since you left, if anything.",
        "Tell me about anything else you've still got back home — property, other pensions.",
        "Is your wife/husband British as well?",
        { q: "Worth knowing — since April 2025, if you've been UK tax resident for 10 of the last 20 years, your worldwide estate is in the UK inheritance tax net, wherever you live now.", note: true },
        { q: "From April 2027, most unused pension funds come into the estate for inheritance tax too — has anyone mentioned that to you?", note: true },
      ],
      investments: [
        "Tell me what you're invested in — is that on a UK platform, or something local?",
        "Explain how many funds or stocks you can actually choose from on that platform.",
        "Roughly how many different accounts or platforms is this spread across right now?",
        "Is this a lump sum sitting there, or something you're adding to regularly?",
        "Talk me through what currency that's actually held in.",
        "What happens if you're earning or spending in a different currency to that?",
        "Describe what happens to it if you move country again — does it come with you, or do you have to start over?",
        "Tell me whether that's wrapped in anything, or just a straight account.",
        "Describe your risk level with that.",
        "Do you plan on holding it long term?",
        "Explain how that's taxed, now you're not UK resident.",
        "Talk me through whether you've had to file in more than one country because of it.",
        { q: 'Are you familiar with gross roll-up?', plant: "It means your money can grow, and be moved between funds or stocks, without triggering tax each time — you're only taxed once, when you actually take the money out." },
      ],
      cash: CASH_DRAWER,
    },
    investmentsPivot: "So there's a UK pension, a UK platform, and [what he's mentioned] — different places, different tax positions to keep track of. Getting that consolidated into one structure you can actually see and manage from here is usually the first thing worth looking at.",
    cashPivot: CASH_PIVOT,
    usFlag: true,
  },

  new_ch: {
    label: 'New to Switzerland',
    intro: "Good morning/afternoon, is that [Name] speaking?\n\nMy name is Archie — I work alongside a senior wealth manager here, Stephen Smith. We specialise in cross-border financial planning for international professionals like yourself. I noticed you've recently relocated to Switzerland, and I'd like to help you understand some of the interesting advantages you have since making the move.\n\nWould it be alright to ask you a few quick questions?",
    opener: [
      "So just to get a picture of things — how long have you been in Switzerland now?",
      "Where were you before, and roughly how long were you there?",
      "Is this a long-term move for you, or more of a stepping stone?",
      "Since you've been here — are you set up in the Swiss system yet? Pillar Two through work, anything going into a Three A?",
    ],
    drawers: {
      pension: [
        { q: "Are you aware Pillars One and Two together really only replace around sixty percent of your final salary here?", plant: "Most people don't know this until it's spelled out — it's not something anyone tells you when you join a Swiss employer." },
        "Have you got anything set up in a Pillar Three A yet?",
        { q: 'Do you know the difference between a Pillar 3a and a Pillar 3b?', plant: '3a is the tax-deductible private pension most people set up alongside the employer one, with restrictions on access. 3b is free-form, no tax deduction, no restrictions.' },
        "Tell me what happened to your pension and investments when you moved — did anything come with you, or has it all just stayed where it was?",
      ],
      investments: [
        "Tell me about anything you've got invested currently — here, or still back home.",
        "Is that something you pick yourself, or is it in funds?",
        "Describe how easy that is to actually manage from here.",
        "Describe what happens to it if you move again — does it come with you, or would you have to start over?",
        "Explain how that's taxed now you're Swiss tax resident.",
      ],
      cash: CASH_DRAWER,
    },
    pensionPivot: "That gap — between what the state and employer pension gives you and what you'll actually need — is exactly what a Pillar 3a closes, and it comes with a straight tax deduction on top. Worth setting up properly rather than defaulting into whatever your bank offers.",
    cashPivot: CASH_PIVOT,
    usFlag: true,
  },

  leaving_ch: {
    label: 'Leaving Switzerland',
    intro: "Good morning/afternoon, is that [Name] speaking?\n\nMy name is Archie — I work alongside a senior wealth manager here, Stephen Smith. I believe you recently engaged with one of our marketing campaigns about leaving Switzerland, looking into your options and what strategy you could put in place. Is that right?",
    opener: [
      "So just to get a picture of things — roughly how long have you been in Switzerland?",
      "And whereabouts were you before?",
      "As you're planning the move — what's currently in place here for you, pension-wise and otherwise?",
    ],
    drawers: {
      pension: [
        "I'd presume you've got a Pillar Two through your employer — is that right?",
        "Tell me about anything else running alongside it — a Pillar 3a or 3b.",
        { q: "Are you aware what actually happens to your Pillar Two the moment you leave your job, or leave Switzerland?", plant: "It gets moved into what's called a vested benefits account — and it typically just sits there earning close to nothing until you retire. There are ways to get that invested properly instead, depending on where you're heading next." },
        "Tell me where you're heading next.",
      ],
      investments: [
        "Is this a lump sum, or something you've been adding to regularly?",
        "Talk me through what currency that's held in, and whether that still makes sense once you've left.",
        "Explain how what you're holding here will be taxed once you've left.",
        "Talk me through what happens to it once you've left — does it travel with you, or need cashing out and restructuring?",
      ],
      cash: CASH_DRAWER,
    },
    investmentsPivot: "Depending on where you're heading, there are usually ways to consolidate what's built up here into something more tax-efficient than just cashing out — that part's very destination-specific though, which is exactly what Stephen walks through.",
    cashPivot: CASH_PIVOT,
    usFlag: true,
  },
}

export const DEFAULT_SHARED: SharedScript = {
  disturb: [
    "Given [what he told you], is it safe to say there's a possibility that's underperforming?",
    "Can you tell me the two most important things in your life, regarding your future?",
    "At this rate, it may be hard to maintain your current lifestyle.",
    "Those two things you just mentioned may not be possible if you don't let someone actually have this conversation.",
  ],
  close_gate: "Right — so three things: [what he told you], [what he told you], and nobody's reviewed any of it since [year]. Every one of those is worth a proper look. Sound fair?",
  close_next: "To be honest, I'm not the expert here — that's exactly why I work alongside a senior wealth manager, Stephen Smith. I think it's worth having a proper conversation with him about this.",
  close_funnel: [
    "When's typically best for you — beginning or end of the week?",
    "Morning or afternoon?",
    "Tuesday at three, or would four be easier?",
    "Phone or video? I'll read your email back and send confirmation today.",
  ],
  soft_landing: [
    "Before we wrap up, can I finalise a few details so my senior consultant has precise information, to make the meeting as valuable as possible for you — does that seem reasonable?",
    "Did you move on your own, or did you bring family with you?",
    "Could you give me a rough ballpark figure on what you believe the pension to be worth today?",
    "Could you tell me who the pension provider is?",
    "Anything else we haven't covered?",
  ],
  end_booked: [
    "Name & number confirmed",
    "Meeting day / time locked in",
    "Phone or video confirmed",
    "Fact-find notes logged for Stephen",
    "Confirmation email or text sent",
  ],
  end_exit: "No problem at all — I'll leave you to it. Thank you for your time.",
}

export const DEFAULT_OBJECTIONS: Objection[] = [
  {
    label: 'Not interested', variants: [
      { label: 'Reverse qualification', text: "Look — the whole point of this call is just to see whether you actually qualify for what we do. You might not. Mind if I ask a couple of things to find out?" },
      { label: 'Feel / Felt / Found', text: "I get it — a lot of people feel exactly that way at first. What we've found is those same people usually end up being some of our longest-standing clients once they've actually seen what we can do." },
      { label: 'Cold-calling pattern interrupt', text: "Can I ask you something — have you ever done any cold calling yourself?\n[whatever he says]\nWell, I've been doing this a little while now, and when somebody tells me they're not interested, it tends to mean one of three things: either you've already got someone doing this for you, you're not sure it's worth the time, or you're just not sure about me specifically. Out of interest — which of those is it for you?" },
    ],
  },
  {
    label: 'Just send me an email', variants: [
      { label: 'Yes, and — first push', text: "Yeah, sure — happy to send you something afterwards with the details. But what I tend to find is once people actually read it, they've got a load of questions — so it's usually much better to just cover it on a call. That way I can walk you through it properly and answer whatever comes up on the spot." },
      { label: 'Feel / Felt / Found — second push', text: "I get it, and I will send it over either way. What I've found though is the ones who jump on a quick call first tend to actually get more out of it — the email on its own doesn't really do it justice." },
    ],
  },
  {
    label: 'How did you get my number?', variants: [
      { label: 'Straight answer', text: "So we've got a specialized team that looks into people we think we could genuinely help — that's how your name came up. I know it's a bit out of the blue, but give me thirty seconds on why I'm calling, and then you can decide if it's worth your time." },
    ],
  },
  {
    label: "I haven't got time", variants: [
      { label: 'Accept & defer — sounds genuine', text: "No worries, I won't keep you — when's a good time to give you a callback?" },
      { label: 'Small-ask push — sounds like a brush-off', text: "I hear you — I'll be quick, honestly just a couple of questions and you can go. Won't take more than a minute." },
    ],
  },
  {
    label: "I've already got an adviser", variants: [
      { label: 'Agree, then probe', text: "Good — that's exactly what you should have. Is he a local adviser, or someone who deals with cross-border stuff specifically? If he's outside Switzerland — are they on the Swiss financial services register? Worth checking, most foreign advisers need to be on it to legally advise private clients here, and it's a fairly common gap. Either way, it's always worth a second set of eyes just to make sure everything's actually sorted." },
    ],
  },
  {
    label: 'What are you trying to sell me?', variants: [
      { label: 'Disarm with honesty', text: "Honestly, at the moment I'm not trying to sell you anything. I'm just trying to work out whether we're actually able to help you — and if we are, whether it's worth sitting down with one of our advisers." },
    ],
  },
  {
    label: 'I need to speak to my wife / check with her', variants: [
      { label: 'Bring her in', text: "No problem at all — you don't want to make any big financial decisions without her being there anyway. I'd actually prefer it if you're both in the meeting together, because it's hard to relay everything properly secondhand, and if either of you has questions, we can answer them both at the same time. So bring her along — that works better for everyone." },
    ],
  },
  {
    label: "What's it going to cost me?", variants: [
      { label: 'Straight answer', text: "For now, this doesn't cost you anything at all. All I'm suggesting is you sit down with my senior wealth manager, Stephen — that gives him a proper look at where the gaps are in your current plan. Fees only come into it once you'd actually decided to move forward with something, and that's entirely his conversation to have with you, not mine. For now, there's nothing you need to do except have the conversation." },
    ],
  },
]
