# DEMETER — Config

Agent: DEMETER · Tier 1 (own portfolio data, no client data)

---

## Portfolio settings

```
base_currency: GBP
brief_time: 07:30 Europe/London, Mon–Fri
```

## Risk flag thresholds

```
concentration_threshold: 25    # flag any holding above this % of total book value
day_move_threshold: 5          # flag any holding moving more than ±this % on the day
earnings_lookahead_days: 7     # flag earnings within this many days (requires news/calendar feed)
```

## Notes

- `avg_cost` for all holdings is stored in **GBP** (base currency), regardless of the holding's
  native price currency (USD, GBP, etc.).
- P&L = total value (GBP) − total cost (GBP). FX conversion is applied to prices, not to cost.
- Holdings' charts (TradingView lightweight-charts) will display value and avg-cost line in GBP
  so both axes share the same currency.
- Risk flags are neutral statements of fact — never a prompt to act.
  DEMETER reports; it does not advise.
```
