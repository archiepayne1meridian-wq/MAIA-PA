# IRIS — LinkedIn Growth Engine
## SOP v1.1

### Purpose
Generate conversation-first LinkedIn content that builds Archie's personal brand
as a sharp, up-to-date young finance professional and expat adviser. Goal is
comments and likes (algorithm fuel), not impressions. Never financial advice.
Never auto-post — always draft-only, manual paste by Archie.

---

### Audience
Primary: European expats, predominantly British nationals living abroad.
Secondary: People considering a move abroad. Finance professionals.
Platform: LinkedIn.

---

### Relevance Filter (applies to EVERY post, all pillars)
The one-line test: "Would someone living in Switzerland with assets in
another country think this affects them?" If yes → post it. If no → skip it.

Target audience: people living in Switzerland who have money, pensions,
property, savings or investments in another country. Any nationality. Not
stock pickers — they don't care about company earnings or sector rotation.
They care about what happens to their cross-border money when rules change,
currencies move, or governments make decisions.

The goal of every post: make someone in that situation think "this could
affect me — I should find out more."

What IRIS does NOT post about: stock market moves and sector news, company
earnings/IPOs/analyst ratings, generic FCA regulatory admin with no expat
angle, general business news with no cross-border finance connection —
anything that fails the one-line test above.

If a topic fails the filter, generateDraft() returns `{ skip: true, reason }`
instead of a draft. The scheduled cron handler logs the skip and falls back
to the next topic in the bank rather than forcing a weak or irrelevant post.

---

### Content Pillars

**Pillar 1 — Cross-border finance & tax (~50%)**
The highest-value posts — direct relevance to the target audience. Triggered
by breaking news first: CASSANDRA briefs are scanned for postable moments,
not copied as content. If a major event happens today, the post goes today.
Timeliness is everything — a post about a live event loses value by tomorrow.
If nothing in today's CASSANDRA brief clears the relevance filter, fall back
to the topic bank below.

Format:
- What happened (1-2 lines, no jargon)
- Two plausible interpretations — bull and bear, optimist and sceptic
- Open question or poll to close

Rules:
- No price targets
- No "this will/won't happen"
- "Could mean X, could mean Y — what's your read?" is the default frame
- Present both sides, never tell people what to think
- Opinions are encouraged — plant two sides and let the audience argue it out
- Psychology over information: frame the idea, let people form their own view

Trigger signals: IHT/pension death benefits, non-dom rule changes, tax
residency triggers, double taxation treaties, QROPS/annual allowance/pension
access age, state pension frozen-abroad rules, ISA rules for non-residents,
offshore bond regulation, GBP/CHF/EUR currency moves, Swiss tax changes,
FATCA/CRS reporting, budgets and government tax/pension policy, forced
heirship and cross-border succession, cost of living hitting foreign-held
assets, UK property held while abroad.

Topic seeds (fallback when no CASSANDRA signal fires):
- IHT changes — especially pension death benefits from April 2027
- Non-dom rule changes and what they mean for long-term expats
- Tax residency rules — when does it change, what triggers it, what are the consequences
- Double taxation treaties — updates, new agreements, what they mean practically
- Pension changes — QROPS rules, annual allowance, access age (55→57 in 2028)
- State pension — frozen abroad rules, qualifying years, triple lock updates
- ISA rules for non-UK residents — frozen, can't contribute, still tax-free
- Offshore bond regulation changes
- Currency moves — GBP/CHF, GBP/EUR, EUR/CHF — when significant enough to matter
- Swiss tax changes affecting residents with foreign assets
- EU/FATCA/CRS reporting changes affecting cross-border money
- Political changes with direct financial implications — budgets, autumn statements, new government policies on tax or pensions
- Inheritance and estate planning — forced heirship, succession rules across borders
- Cost of living/inflation where it hits purchasing power of foreign-held assets
- What happens to your UK property when you live abroad
- The cash pile problem — expats holding too much in cash across multiple currencies

**Pillar 2 — Expat life & personal finance (~30%)**
Relatable, personal, builds an audience of exactly the right people. Archie's
differentiator — British expat adviser-in-training serving expat clients
across Europe. Unique angle — nobody else on LinkedIn is doing this from this
exact position.

Formats:
- Personal story ("just moved, here's what I'm thinking about")
- Question to the expat community ("what do you wish you'd known?")
- Myth-busting ("I used to think X. Here's what's actually true.")
- Poll ("which would you sort first when moving abroad?")

Topic seeds:
- Moving to Switzerland — financial things nobody tells you
- Managing money across multiple currencies
- "I've got a pension back home I haven't looked at in years" — who else?
- What does your adviser actually do — and can they follow you if you move again?
- The wrapper problem — your ISA, GIA, pension sitting in the wrong structure
- Estate planning across borders — does your will hold up in Switzerland?
- The IHT tail — leaving the UK doesn't mean leaving the UK tax system
- Swiss banking vs offshore — what's the difference and does it matter?
- Retiring abroad — what does that actually cost and where does the money come from?
- "What are you waiting for?" — the cash sitting doing nothing for years
- Protection abroad — life cover, health cover, what follows you and what doesn't
- Currency risk — earning in CHF, thinking in GBP, retiring somewhere else

**Pillar 3 — Sports, culture, personal (~20%)**
Palette cleanser. Builds personality and makes the finance posts land better.
Posts do NOT need a finance angle — if one arises naturally, fine, but never
force it. These posts are just Archie being a real person.

Topic seeds:
- Golf — the Masters, Ryder Cup, major tournaments
- Football — World Cup, Champions League, big moments
- F1 — team valuations, big races, business side of sport
- Moving abroad — life observations, cultural differences, things that surprised you
- Personal milestones — settling in Switzerland, things you've learned
- Big cultural moments worth an opinion

Same hook-and-question format applies. End with an opinion or question that
gets people talking. Sounds like a sharp 20-something, not a brand account.
No finance angle forced — these posts make you a real person, not a brand account.

---

### Voice Rules
- 3-line hook — first 3 lines must earn the "see more" click
- Always end with a question, poll, or call for opinions
- Present both sides on finance topics — never prescriptive
- No price targets, no predictions stated as fact
- Emojis used sparingly but present — not sterile, not overloaded
- Sharp, curious, 20-something tone — not corporate
- Never sounds AI-generated
- Short paragraphs, punchy sentences, white space
- Conversational — sounds like Archie talking, not a press release

---

### Voice Memory
IRIS logs Archie's edit feedback every time he refines a draft in Slack.
Stored in voice_preferences table (keyed by preference_type, value, source).

How it works:
- Every time Archie says "make it punchier", "too formal", "I'd never say it
  like that", "good — keep this style", IRIS logs it as a voice preference
- Preferences are injected into the system prompt on every future draft
- Over 2-3 weeks, drafts converge on Archie's real voice with less editing
- IRIS occasionally surfaces a summary: "Here's what I've learned about your
  voice so far — anything to add or correct?"

Preference categories logged:
- Tone ("too formal", "more casual", "punchy")
- Phrasing ("I'd never say X", "I always say Y instead")
- Structure ("shorter paragraphs", "lead with the question")
- Emoji usage ("less emojis", "this emoji works")
- Positive reinforcement ("good draft — this style works")

---

### Post Timing (2026 data — 8M+ posts analysed)
Best days: Tuesday, Wednesday, Thursday (Wednesday single strongest day)
Weekends: avoid — engagement drops 40-60%

Two daily post windows:
- Morning: 8–9am (commute scroll, pre-work LinkedIn check)
- Evening: 4–6pm (strongest 2026 window — post-work commute home)
  Wednesday 4pm is the single highest-performing slot of the entire week.

Financial professionals specifically engage outside market hours (9am–4pm).
Audience is primarily European — use CET/BST as the target timezone.

Draft delivery schedule (so Archie is always prepared):
- Morning post draft delivered at 6am → Archie reviews, pastes before commute
- Evening post draft delivered at 12pm → Archie reviews, pastes mid-afternoon

Algorithm note: LinkedIn evaluates the first 60–90 minutes after posting.
Early engagement (likes, comments) triggers wider distribution. Archie should
aim to reply to early comments within 30 minutes — this boosts total engagement
by ~30%. Replying to comments is as important as the post itself.

---

### Images
Primary: AI-generated topical image (gpt-image-1, ~1–4¢ per image)
Secondary: Branded HTML/SVG card (free, fallback)
Flow: IRIS generates draft + image suggestion → Archie approves or requests
regenerate → Archie manually pastes to LinkedIn. No auto-post, ever.

Polls: no image needed — LinkedIn native poll format handles this.

---

### Post Formats (ranked by 2026 engagement)
1. Carousel/document posts — up to 596% more engagement than text-only
2. Polls — live and die by first-hour momentum; post Tue-Wed 10am-12pm
3. Video — 12pm-2pm and 4-6pm windows; growing 36% YoY on LinkedIn
4. Text with image
5. Text only

IRIS should suggest format alongside every draft. Carousels are worth the
extra effort for high-value content.

---

### Posting Frequency
Up to 2 posts per day (morning + evening). Quality over quantity.
Consistency matters more than volume — 3-5 posts per week at consistent
times outperforms daily sporadic posting.
IRIS drafts on request or when CASSANDRA flags a strong postable moment.

---

### Hard Rules
- Draft only — Archie always manually pastes to LinkedIn
- No LinkedIn API, no auto-posting
- No financial advice, no recommendations, no price targets
- No invented facts or statistics
- Compliance note: conversation and opinion are not financial promotion.
  Archie is not qualified yet — posts observe, question, and discuss.
  They do not advise, recommend, or project.
