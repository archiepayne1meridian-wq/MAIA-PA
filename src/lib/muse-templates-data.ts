// Default MUSE template library — 10 email + 12 LinkedIn templates, verbatim
// from the brief. Seeded by scripts/seed-muse-templates.ts.

export interface TemplateSeed {
  name: string
  category: 'email' | 'linkedin'
  medium: 'email' | 'linkedin'
  scenario: string
  subject?: string
  body: string
}

export const TEMPLATE_SEEDS: TemplateSeed[] = [
  // ── Email templates (10) ──────────────────────────────────────────────────
  {
    name: 'Post-Booking Confirmation',
    category: 'email', medium: 'email', scenario: 'generic',
    subject: 'Great speaking with you — meeting confirmed',
    body: `Hi [NAME],

Really good speaking with you today.

As discussed, I've arranged for you to speak with Stephen Smith, one of our senior consultants here at deVere who specialises in exactly the kind of situation you described — [SPECIFIC_DETAIL].

Your meeting is confirmed for [MEETING_DATE] at [MEETING_TIME].

If anything comes up beforehand or you have any questions, feel free to reach out directly.

Looking forward to it.

Archie`,
  },
  {
    name: 'Post-Booking — IHT Pension Angle',
    category: 'email', medium: 'email', scenario: 'iht-pension-angle',
    subject: 'Your UK pension and the April 2027 changes — meeting confirmed',
    body: `Hi [NAME],

Great speaking with you today.

As mentioned, the changes coming in April 2027 around UK pensions and inheritance tax are something that catches a lot of people off guard — particularly those who've been living abroad for some time.

I've booked you in with Stephen Smith, our senior consultant who works specifically with clients in your position. He'll be able to look at your situation properly and give you a clear picture of where you stand.

Your meeting is confirmed for [MEETING_DATE] at [MEETING_TIME].

Any questions before then — just reach out.

Archie`,
  },
  {
    name: 'Post-Booking — Leaving Switzerland',
    category: 'email', medium: 'email', scenario: 'leaving-switzerland',
    subject: 'Your Swiss pension and assets — meeting confirmed',
    body: `Hi [NAME],

Really useful conversation today.

There's a lot to think about when you're planning a move — particularly around what happens to your vested benefits and any other assets you've built up in Switzerland. Getting the structure right before you leave makes a significant difference.

I've arranged for you to speak with Stephen Smith, who deals with exactly these kinds of transitions. He'll walk you through your options properly.

Your meeting is confirmed for [MEETING_DATE] at [MEETING_TIME].

Looking forward to it.

Archie`,
  },
  {
    name: 'Post-Booking — New to Switzerland',
    category: 'email', medium: 'email', scenario: 'new-to-switzerland',
    subject: 'Welcome to Switzerland — meeting confirmed',
    body: `Hi [NAME],

Great to connect today.

Moving to Switzerland throws up a lot of financial questions that most people don't get straight answers to — particularly around pensions and assets held back home. It's exactly the kind of thing that's worth sorting early rather than leaving it.

I've booked you in with Stephen Smith who specialises in working with people in your position.

Your meeting is confirmed for [MEETING_DATE] at [MEETING_TIME].

Any questions in the meantime, just get in touch.

Archie`,
  },
  {
    name: 'Post-Booking — UK Connected',
    category: 'email', medium: 'email', scenario: 'uk-connected',
    subject: 'Your UK assets — meeting confirmed',
    body: `Hi [NAME],

Good speaking with you today.

As we discussed — [SPECIFIC_DETAIL]. It's one of those things that tends to get left sitting longer than it should, and the cost of doing nothing adds up over time.

Stephen Smith will be able to look at your full picture and give you some clarity.

Your meeting is confirmed for [MEETING_DATE] at [MEETING_TIME].

Archie`,
  },
  {
    name: 'Meeting Reminder',
    category: 'email', medium: 'email', scenario: 'generic',
    subject: 'Your meeting tomorrow — [MEETING_DATE] at [MEETING_TIME]',
    body: `Hi [NAME],

Just a quick note ahead of your meeting with Stephen Smith tomorrow at [MEETING_TIME].

He'll be covering [SPECIFIC_DETAIL] — looking forward to a useful conversation.

Any issues, feel free to get in touch.

Archie`,
  },
  {
    name: 'Follow Up — Gone Quiet',
    category: 'email', medium: 'email', scenario: 'generic',
    subject: 'Quick check in',
    body: `Hi [NAME],

Just checking in — does [MEETING_DATE] at [MEETING_TIME] still work for you?

Happy to rearrange if something's come up.

Archie`,
  },
  {
    name: 'Follow Up — Keep Warm',
    category: 'email', medium: 'email', scenario: 'generic',
    subject: 'Checking in',
    body: `Hi [NAME],

Hope things are going well.

I wanted to reach out as [SPECIFIC_DETAIL] — thought it might be relevant given what we discussed.

Happy to pick up the conversation whenever the timing is right.

Archie`,
  },
  {
    name: 'Repatriation to UK',
    category: 'email', medium: 'email', scenario: 'repatriation-to-uk',
    subject: 'Before you head back to the UK',
    body: `Hi [NAME],

Great speaking with you today.

Returning to the UK after time abroad raises some financial questions that are genuinely worth getting right before you land — particularly around offshore investments and how they're treated once you become UK resident again.

I've arranged for you to speak with Stephen Smith who works specifically with clients planning repatriation.

Your meeting is confirmed for [MEETING_DATE] at [MEETING_TIME].

Archie`,
  },
  {
    name: 'Reference Request — To Steven',
    category: 'email', medium: 'email', scenario: 'generic',
    subject: 'Reference request — [NAME] at [COMPANY]',
    body: `Hi Steven,

Following the meeting with [NAME] at [COMPANY] on [MEETING_DATE] — would you be able to ask for any references when the time is right?

I've put together a Sales Nav search for similar profiles that might be worth a look:
[SPECIFIC_DETAIL]

Let me know if anything comes of it.

Archie`,
  },
  // ── LinkedIn message templates (12) ───────────────────────────────────────
  {
    name: 'LinkedIn — New to Switzerland',
    category: 'linkedin', medium: 'linkedin', scenario: 'new-to-switzerland',
    body: `Hi [NAME] — I work with a lot of professionals who've recently moved to Switzerland and still have financial ties back home. There are a few things that tend to catch people off guard early on. Worth a quick 10-minute call to see if any of it's relevant to you?`,
  },
  {
    name: 'LinkedIn — UK Connected',
    category: 'linkedin', medium: 'linkedin', scenario: 'uk-connected',
    body: `Hi [NAME] — I specialise in working with British professionals in Switzerland who have pensions and assets back in the UK. It's one of those things that tends to get left longer than it should. Worth a quick conversation to see if it's relevant?`,
  },
  {
    name: 'LinkedIn — Leaving Switzerland',
    category: 'linkedin', medium: 'linkedin', scenario: 'leaving-switzerland',
    body: `Hi [NAME] — I work with a lot of people planning to leave Switzerland and there are some important questions around vested benefits and assets that are worth sorting before you go. Worth a 10-minute call?`,
  },
  {
    name: 'LinkedIn — Restructuring Angle',
    category: 'linkedin', medium: 'linkedin', scenario: 'restructuring-job-loss',
    body: `Hi [NAME] — given the recent changes at [COMPANY], I've been reaching out to a few people who may have questions about their Swiss pension and what happens to it in transition. Worth a quick conversation?`,
  },
  {
    name: 'LinkedIn — IHT Pension Angle',
    category: 'linkedin', medium: 'linkedin', scenario: 'iht-pension-angle',
    body: `Hi [NAME] — with the UK pension inheritance tax changes confirmed for April 2027, I've been reaching out to British professionals in Switzerland who may be affected. Worth a 10-minute call to see if it's relevant to your situation?`,
  },
  {
    name: 'LinkedIn — Market Drop Angle',
    category: 'linkedin', medium: 'linkedin', scenario: 'market-drop-volatility',
    body: `Hi [NAME] — given what's been happening in markets recently, I've been reaching out to people holding investments to see how things are sitting and whether the structure still makes sense. Worth a quick conversation?`,
  },
  {
    name: 'LinkedIn — Cash Pile Angle',
    category: 'linkedin', medium: 'linkedin', scenario: 'cash-pile',
    body: `Hi [NAME] — a lot of the professionals I speak to in Switzerland are holding significant cash across multiple currencies. It feels safe but inflation makes it expensive long term. Worth 10 minutes to talk through?`,
  },
  {
    name: 'LinkedIn — International Professional',
    category: 'linkedin', medium: 'linkedin', scenario: 'international-professional-non-uk',
    body: `Hi [NAME] — I work specifically with internationally mobile professionals based in Switzerland who have financial ties to another country. Worth a quick call to see if it's relevant to your situation?`,
  },
  {
    name: 'LinkedIn — Investments / Exclusive Access',
    category: 'linkedin', medium: 'linkedin', scenario: 'investments-exclusive-access',
    body: `Hi [NAME] — we work with some institutional-grade investment structures that most people can't access through a regular bank. The minimum is normally £500k+ but we pool demand so clients can access them from £10-25k. Worth 10 minutes?`,
  },
  {
    name: 'LinkedIn — Follow Up No Reply',
    category: 'linkedin', medium: 'linkedin', scenario: 'generic',
    body: `Hi [NAME] — just following up on my previous message. Still happy to have a quick call if the timing is better now. No pressure either way.`,
  },
  {
    name: 'LinkedIn — Engaged With Post',
    category: 'linkedin', medium: 'linkedin', scenario: 'generic',
    body: `Hi [NAME] — glad the post resonated. Happy to have a quick conversation if you'd like to explore any of it further.`,
  },
  {
    name: 'LinkedIn — After Meeting Sits',
    category: 'linkedin', medium: 'linkedin', scenario: 'generic',
    body: `Hi [NAME] — great that you had the chance to speak with Stephen. Hope it was useful. Happy to help with anything else on your end.`,
  },
]
