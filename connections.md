# MAIA Connections Registry

Every external system MAIA can reach. Update this when adding an integration.

| Service | Purpose | Auth | Env var(s) | Status |
|---|---|---|---|---|
| Anthropic API | Claude inference (all agents) | API key | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Active |
| Slack | Messaging, approvals, commands | Bot token + signing secret | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL_ID`, `SLACK_OWNER_USER_ID` | Active |
| ElevenLabs | Voice TTS (MAIA voice) | API key | `ELEVENLABS_API_KEY`, `MAIA_VOICE_ID` | Pending |
| Brave Search | Market/regulatory research (CASSANDRA) | API key | `BRAVE_API_KEY` | Pending |
| OpenBB | DEMETER terminal data (quotes, history, news) | Bearer token | `OPENBB_URL`, `OPENBB_TOKEN` (MAIA); `OPENBB_API_KEY` (service) | D3a — deploying |
| FMP | OpenBB data provider (Railway-safe fallback for yfinance) | API key | `FMP_API_KEY` in openbb-service env | D3a — deploying |
| Google Calendar | Meeting prep (LUNA) | OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Pending — T2, build when ready |
| LinkedIn | News relay (IRIS) | Access token | `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_PERSON_URN` | Shelved — T3, requires deVere compliance sign-off |
| Railway | Hosting + volume (SQLite) | Railway deploy | `DATABASE_URL`, `NEXT_PUBLIC_BASE_URL` | Active |
| GitHub Actions | Cron health pings | `MAIA_API_KEY` bearer | `MAIA_API_KEY` | Placeholder |

## Notes

- MAIA's Slack app is separate from any Meridian/JARVIS bot. Different workspace app, different tokens.
- LinkedIn (IRIS) must not go live against real data until deVere compliance has signed off. `DRY_RUN=true` while shelved.
- DEMETER is informational only — no trading signals or automation.
