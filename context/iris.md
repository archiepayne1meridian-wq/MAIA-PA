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

### Content Pillars

**Pillar 1 — Live Markets & Finance (~50%)**
Triggered by breaking news. CASSANDRA briefs are scanned for postable moments,
not copied as content. If a major event happens today, the post goes today.
Timeliness is everything — a post about a live event loses value by tomorrow.

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

Trigger signals: rate decisions, major IPOs, big earnings, currency moves,
crypto milestones, AI/market intersections, commodity spikes, UK budget/tax
announcements, recession/inflation signals, major regulatory changes.

**Pillar 2 — Expat Finance (~30%)**
Archie's differentiator. British expat, just moved to Malta, training as an
adviser who will serve expat clients across Europe. Unique angle — nobody else
on LinkedIn is doing this from this exact position.

Formats:
- Personal story ("just moved, here's what I'm thinking about")
- Question to the expat community ("what do you wish you'd known?")
- Myth-busting ("I used to think X. Here's what's actually true.")
- Poll ("which would you sort first when moving abroad?")

Topic seeds:
- Tax residency timing and common mistakes
- UK pension traps for expats (QROPS, transfers)
- ISAs when you leave the UK
- Currency risk and GBP/EUR moves
- NHS vs private health abroad — the financial calculation
- What nobody tells you about managing money abroad
- The Malta move itself (personal, relatable, ongoing content)
- Expat emergency fund sizing
- Non-dom vs expat — simplified and curious framing
- "I'm moving abroad — what do you wish you'd done differently in year one?"

**Pillar 3 — Sports & Culture (~20%)**
Palette cleanser. Builds personality and makes the finance posts land better.
Posts do NOT need a finance angle — if one arises naturally, fine, but never
force it. These posts are just Archie being a real person.

Sports Archie follows: golf (the Masters, Ryder Cup), football (World Cup,
Premier League), F1.

Same hook-and-question format applies. End with an opinion or question that
gets people talking. Sounds like a sharp 20-something, not a brand account.

Current events, big cultural moments, and personal milestones also count here.
The Malta move itself will generate strong personal content in the first weeks.

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
