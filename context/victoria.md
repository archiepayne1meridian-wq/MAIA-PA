# VICTORIA — Config

> VICTORIA's metrics and targets. Edit freely — she reads this live, nothing is baked into code.
> Source of truth for real records is the deVere CRM. VICTORIA tracks COUNTS and TRENDS only —
> never client names or personal data.

## Metrics to track (the end-of-day tally)
- prospects_sourced   # new prospects sourced into the pipeline
- green_prospects     # of those, confirmed contactable (a working number) — "green"
- calls               # dials made
- connects            # calls that connect / get answered
- meetings_booked     # appointments set
- meetings_sat        # appointments that actually happened ("sat" with the prospect)

## Targets
# Format: "- metric: DAILY / WEEKLY" — leave either side blank if it isn't tracked at that period.
# VICTORIA computes connect rate, booking rate, sit rate, and green rate herself from these —
# never enter a ratio directly.
- prospects_sourced: / 100
- green_prospects: /              # no fixed target — maximise the % of sourced prospects that are green
- calls: 100 /
- connects: 50 /
- meetings_booked: 2 / 10
- meetings_sat: / 5

## Timing
- nudge_time: 18:00 Europe/London   # end-of-day tally prompt, weekdays
- scorecard_day: Friday             # weekly scorecard (e.g. Friday or Sunday evening)
