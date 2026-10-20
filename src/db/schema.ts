import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  action_id: text('action_id').notNull(),
  payload: text('payload').notNull(),
  status: text('status').notNull().default('pending'),
  slack_message_ts: text('slack_message_ts'),
  slack_channel: text('slack_channel'),
  requested_by: text('requested_by'),
  created_at: integer('created_at').notNull(),
  resolved_at: integer('resolved_at'),
})

export const activity = sqliteTable('activity', {
  id: text('id').primaryKey(),
  event_id: text('event_id').unique(),
  type: text('type').notNull(),
  agent: text('agent'),
  slack_user: text('slack_user'),
  input: text('input'),
  output: text('output'),
  status: text('status').notNull(),
  duration_ms: integer('duration_ms'),
  created_at: integer('created_at').notNull(),
})

export const study_cards = sqliteTable('study_cards', {
  id: text('id').primaryKey(),
  module: text('module').notNull(),
  front: text('front').notNull(),
  back: text('back').notNull(),
  ef: real('ef').notNull().default(2.5),
  interval_days: integer('interval_days').notNull().default(0),
  repetitions: integer('repetitions').notNull().default(0),
  due_at: integer('due_at').notNull(),
  suspended: integer('suspended').notNull().default(0),
  created_at: integer('created_at').notNull(),
  last_reviewed_at: integer('last_reviewed_at'),
  track: text('track').notNull().default('qualification'),   // 'qualification' | 'products'
  exam: text('exam').notNull().default(''),                  // 'R01' | 'R06' | '' (untagged qualification content)
})

export const study_reviews = sqliteTable('study_reviews', {
  id: text('id').primaryKey(),
  card_id: text('card_id').notNull(),
  quality: integer('quality').notNull(),
  ef_after: real('ef_after').notNull(),
  interval_after: integer('interval_after').notNull(),
  reviewed_at: integer('reviewed_at').notNull(),
})

export const quiz_sessions = sqliteTable('quiz_sessions', {
  id: text('id').primaryKey(),
  modules: text('modules').notNull(),
  questions: text('questions').notNull(),
  current_index: integer('current_index').notNull().default(0),
  score: integer('score').notNull().default(0),
  total: integer('total').notNull(),
  created_at: integer('created_at').notNull(),
  completed_at: integer('completed_at'),
  track: text('track').notNull().default('qualification'),   // 'qualification' | 'products'
  exam: text('exam').notNull().default(''),                  // 'R01' | 'R06' | '' (untagged qualification content)
})

export const mcq_attempts = sqliteTable('mcq_attempts', {
  id: text('id').primaryKey(),
  session_id: text('session_id').notNull(),
  module: text('module').notNull(),
  question: text('question').notNull(),
  correct: integer('correct').notNull(),
  created_at: integer('created_at').notNull(),
})

export const holdings = sqliteTable('holdings', {
  id: text('id').primaryKey(),
  ticker: text('ticker').notNull(),
  name: text('name'),
  quantity: real('quantity').notNull(),
  avg_cost: real('avg_cost').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  added_at: integer('added_at').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const portfolio_snapshots = sqliteTable('portfolio_snapshots', {
  id: text('id').primaryKey(),
  taken_at: integer('taken_at').notNull(),
  base_currency: text('base_currency').notNull().default('GBP'),
  total_value: real('total_value').notNull(),
  total_cost: real('total_cost').notNull(),
  day_change: real('day_change').notNull(),
  holdings_json: text('holdings_json').notNull(),
})

export const research_briefs = sqliteTable('research_briefs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),        // 'morning' | 'on_demand' | 'market_alert'
  markets_json: text('markets_json').notNull(),
  headlines_json: text('headlines_json').notNull(),
  summary: text('summary').notNull(),
  weekly_summary: text('weekly_summary'), // populated on Monday morning briefs only
  created_at: integer('created_at').notNull(),
})

export const reflections = sqliteTable('reflections', {
  id: text('id').primaryKey(),
  body: text('body').notNull(),
  source: text('source').notNull().default('text'),   // 'text' | 'voice'
  sentiment: text('sentiment'),                        // 'positive' | 'neutral' | 'low' — internal only, never surfaced as a label
  distress_flagged: integer('distress_flagged').notNull().default(0),  // 1 = flagged; supportive path taken
  created_at: integer('created_at').notNull(),
})

export const weekly_reviews = sqliteTable('weekly_reviews', {
  id: text('id').primaryKey(),
  period_start: integer('period_start').notNull(),
  period_end: integer('period_end').notNull(),
  summary: text('summary').notNull(),
  created_at: integer('created_at').notNull(),
})

export const kpi_logs = sqliteTable('kpi_logs', {
  id: text('id').primaryKey(),
  log_date: integer('log_date').notNull(),   // Unix timestamp for start-of-day (midnight UTC)
  metrics_json: text('metrics_json').notNull(),   // { calls: 8, connects: 3, ... }
  note: text('note'),                             // optional free-text note
  created_at: integer('created_at').notNull(),
})

export const kpi_weekly = sqliteTable('kpi_weekly', {
  id: text('id').primaryKey(),
  week_start: integer('week_start').notNull(),    // Unix timestamp for Monday midnight UTC
  totals_json: text('totals_json').notNull(),     // { calls: 40, connects: 15, ... }
  summary: text('summary').notNull(),             // the rendered scorecard text
  created_at: integer('created_at').notNull(),
})

export const watchlist = sqliteTable('watchlist', {
  id:       text('id').primaryKey(),
  symbol:   text('symbol').notNull().unique(),
  name:     text('name'),
  added_at: integer('added_at').notNull(),
})

export const iris_posts = sqliteTable('iris_posts', {
  id: text('id').primaryKey(),
  slot: text('slot').notNull(),
  pillar: integer('pillar').notNull(),
  topic: text('topic').notNull(),
  copy: text('copy').notNull(),
  image_prompt: text('image_prompt'),
  image_url: text('image_url'),
  format: text('format'),
  status: text('status').notNull().default('draft'),
  slack_ts: text('slack_ts'),
  impressions: integer('impressions').notNull().default(0),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  reposts: integer('reposts').notNull().default(0),
  created_at: integer('created_at').notNull(),
  user_edited: integer('user_edited').notNull().default(0),   // 1 if Archie edited the post
  edit_delta: text('edit_delta'),                              // JSON: { original, edited }
  edit_notes: text('edit_notes'),                              // auto-generated notes on what the edit reveals about voice
  approved: integer('approved').notNull().default(0),          // 1 if Archie approved/posted it
  post_type: text('post_type'),                                // personal_story / news_angle / fact_drop / tool_guide / expat_reality / reframe / auto
  engagement_signal: text('engagement_signal'),                // e.g. 'good' if Archie marks it as having done well
})

// The LinkedIn chat thread — free-text messages interleaved with draft cards
// (draft cards are rendered from iris_posts via draft_post_id, not duplicated here).
export const iris_chat_messages = sqliteTable('iris_chat_messages', {
  id: text('id').primaryKey(),
  role: text('role').notNull(),              // 'maia' | 'archie'
  content: text('content').notNull(),        // '' when the message is purely a draft-card wrapper
  draft_post_id: text('draft_post_id'),       // iris_posts.id rendered as a card right after this message, if any
  created_at: integer('created_at').notNull(),
})

export const iris_voice_learnings = sqliteTable('iris_voice_learnings', {
  id: text('id').primaryKey(),
  learning: text('learning').notNull(),          // what was learned e.g. "prefers shorter hooks"
  example_before: text('example_before'),        // original version
  example_after: text('example_after'),          // edited version
  applied_count: integer('applied_count').notNull().default(0),   // how many posts this learning has been applied to
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

export const voice_preferences = sqliteTable('voice_preferences', {
  id: text('id').primaryKey(),
  preference_type: text('preference_type').notNull(),
  value: text('value').notNull(),
  source: text('source').notNull(),
  created_at: integer('created_at').notNull(),
})

export const diana_sessions = sqliteTable('diana_sessions', {
  id: text('id').primaryKey(),
  slack_user: text('slack_user').notNull(),
  scenario: text('scenario'),                                       // objection label / persona being drilled (Slack legacy path only)
  difficulty: text('difficulty').notNull().default('neutral'),      // 'warm' | 'neutral' | 'tough'
  generated_prospect: text('generated_prospect'),                   // JSON GeneratedProspect — one Haiku call per session, null on old rows
  score_total: integer('score_total'),                              // final scoreCall() total, set on exit — null until scored
  transcript_json: text('transcript_json').notNull().default('[]'), // DianaTranscriptTurn[]
  status: text('status').notNull().default('active'),               // 'active' | 'ended'
  created_at: integer('created_at').notNull(),
  last_active_at: integer('last_active_at').notNull(),              // updated on each turn; used for 4h timeout
  ended_at: integer('ended_at'),
  review_json: text('review_json'),                                 // JSON SessionReview (stages/deductions/knowledge/whatWorked/whatToImprove/focusNext/stageReached/outcome) — set on /end, null until scored
})

export const muse_entries = sqliteTable('muse_entries', {
  id: text('id').primaryKey(),
  sector: text('sector').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  content: text('content').notNull(),
  brief_depth: text('brief_depth').notNull(),      // simple/medium/detailed
  source: text('source').notNull(),                // agent name, 'archie_input', 'brain_dump'
  source_agent: text('source_agent'),
  status: text('status').notNull().default('pending'),  // pending/active/archived
  date_filed: integer('date_filed').notNull(),
  last_updated: integer('last_updated').notNull(),
  created_at: integer('created_at').notNull(),
  privacy_tier: integer('privacy_tier').notNull().default(1),   // 1 = AI can read, 2 = server only, never sent to AI
  entry_type: text('entry_type').notNull().default('knowledge'),  // knowledge/adviser_email/linkedin_message/news/other
  tags: text('tags').notNull().default('[]'),              // JSON array, from autoTag()
  linked_entries: text('linked_entries').notNull().default('[]'),  // JSON array of muse_entries.id
  source_scenario: text('source_scenario'),                 // hermes_scenarios.id, when filed from/for a scenario
  times_accessed: integer('times_accessed').notNull().default(0),
  has_file: integer('has_file').notNull().default(0),       // 1 = file_data holds the original file
  file_name: text('file_name'),
  file_type: text('file_type'),                              // MIME type
  file_size: integer('file_size'),                            // bytes
  file_data: blob('file_data', { mode: 'buffer' }),           // original file binary — Tab 1 manual filings only
})

export const muse_templates = sqliteTable('muse_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),    // email/linkedin/follow_up/reference
  scenario: text('scenario'),              // hermes_scenarios.id, or a loose slug like 'generic'
  angle: text('angle'),
  subject: text('subject'),                // email only
  body: text('body').notNull(),
  medium: text('medium').notNull().default('email'),   // email/linkedin/whatsapp
  times_used: integer('times_used').notNull().default(0),
  last_used: integer('last_used'),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
  updated_at: integer('updated_at').notNull().default(sql`(unixepoch())`),
})

export const muse_tags = sqliteTable('muse_tags', {
  id: text('id').primaryKey(),
  tag: text('tag').notNull().unique(),
  entry_count: integer('entry_count').notNull().default(0),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

export const muse_change_log = sqliteTable('muse_change_log', {
  id: text('id').primaryKey(),
  entry_id: text('entry_id').notNull(),
  changed_at: integer('changed_at').notNull(),
  change_summary: text('change_summary').notNull(),
  previous_content: text('previous_content').notNull(),
})

export const muse_links = sqliteTable('muse_links', {
  id: text('id').primaryKey(),
  entry_id_a: text('entry_id_a').notNull(),
  entry_id_b: text('entry_id_b').notNull(),
  link_type: text('link_type').notNull(),   // related/contradicts/updates/supports
  created_at: integer('created_at').notNull(),
})

export const muse_pending = sqliteTable('muse_pending', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  source_agent: text('source_agent'),
  suggested_sector: text('suggested_sector').notNull(),
  suggested_title: text('suggested_title').notNull(),
  suggested_summary: text('suggested_summary').notNull().default(''),
  suggested_content: text('suggested_content').notNull(),
  suggested_depth: text('suggested_depth').notNull(),
  suggested_links: text('suggested_links').notNull().default('[]'),  // JSON array of titles
  status: text('status').notNull().default('awaiting'),  // awaiting/approved/discarded
  slack_ts: text('slack_ts'),                             // thread anchor for confirm/discard flow
  created_at: integer('created_at').notNull(),
})

export const muse_cases = sqliteTable('muse_cases', {
  id: text('id').primaryKey(),
  display_name: text('display_name').notNull(),    // "John S." — first name + last initial only, never full surname
  company: text('company'),
  location: text('location'),
  occupation: text('occupation'),
  financial_profile: text('financial_profile'),     // anonymised financial situation, general terms
  status: text('status').notNull().default('active'),  // active/meeting_booked/meeting_sat/closed
  outcome: text('outcome'),                          // what happened, adviser recommendation
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
  updated_at: integer('updated_at').notNull().default(sql`(unixepoch())`),
})

export const muse_case_events = sqliteTable('muse_case_events', {
  id: text('id').primaryKey(),
  case_id: text('case_id').notNull(),
  event_type: text('event_type').notNull(),   // call/meeting_booked/meeting_sat/adviser_note/outcome/follow_up
  date: text('date').notNull(),               // YYYY-MM-DD
  summary: text('summary').notNull(),
  what_suggested: text('what_suggested'),
  adviser_recommendation: text('adviser_recommendation'),
  worked: text('worked'),                     // yes/no/pending
  apollo_call_id: text('apollo_call_id'),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

export const mercury_templates = sqliteTable('mercury_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),   // 'booking' | 'reminder' | 'follow_up' | 'thank_you' | 'general'
  medium: text('medium').notNull(),       // 'email' | 'whatsapp' | 'imessage'
  description: text('description').notNull(),
  system_prompt_addition: text('system_prompt_addition').notNull(),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

export const mercury_drafts = sqliteTable('mercury_drafts', {
  id: text('id').primaryKey(),
  medium: text('medium').notNull(),           // 'email' | 'whatsapp' | 'imessage'
  context: text('context').notNull(),
  incoming_message: text('incoming_message'), // nullable — reply scenario only
  draft: text('draft').notNull(),
  status: text('status').notNull().default('draft'),  // 'draft' | 'approved'
  slack_ts: text('slack_ts'),                // thread anchor for refinement loop
  created_at: integer('created_at').notNull(),
})

export const maia_tasks = sqliteTable('maia_tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  due_date: text('due_date'),                              // nullable — YYYY-MM-DD
  completed: integer('completed').notNull().default(0),   // 0 = false, 1 = true
  completed_at: integer('completed_at'),                  // nullable — unix timestamp
  source: text('source').notNull().default('manual'),     // manual | voice | weekly_plan
  created_at: integer('created_at').notNull(),
})

export const maia_weekly_intentions = sqliteTable('maia_weekly_intentions', {
  id: text('id').primaryKey(),
  week_start: text('week_start').notNull(),   // YYYY-MM-DD — Monday of that week
  focus_areas: text('focus_areas').notNull(), // JSON array of strings
  raw_input: text('raw_input').notNull(),
  created_at: integer('created_at').notNull(),
})

export const maia_config = sqliteTable('maia_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_at: integer('updated_at').notNull(),
})

export const visualizer_notes = sqliteTable('visualizer_notes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  underlying_asset: text('underlying_asset').notNull(),
  autocall_barrier: real('autocall_barrier').notNull(),
  coupon_barrier: real('coupon_barrier').notNull(),
  capital_protection: real('capital_protection').notNull(),
  coupon_rate: real('coupon_rate').notNull(),
  term_years: integer('term_years').notNull(),
  observation_frequency: text('observation_frequency').notNull(),   // 'quarterly' | 'semi-annual' | 'annual'
  investment_amount: real('investment_amount').notNull(),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

export const apollo_calls = sqliteTable('apollo_calls', {
  id: text('id').primaryKey(),
  call_date: text('call_date').notNull(),
  prospect_name: text('prospect_name'),              // first name + last initial only (GDPR)
  transcript: text('transcript'),
  intelligence_json: text('intelligence_json'),       // legacy Opus extraction shape — unused by the new single-pass analyse flow, kept for old rows
  advisor_brief: text('advisor_brief'),               // repurposed: holds the new flow's crm_notes text
  client_email: text('client_email'),                 // repurposed: holds the new flow's confirmation_email text
  muse_brief_id: text('muse_brief_id'),               // legacy MUSE case-filing — retired, kept for old rows
  muse_email_id: text('muse_email_id'),               // legacy MUSE case-filing — retired, kept for old rows
  muse_case_id: text('muse_case_id'),                 // legacy MUSE case-filing — retired, kept for old rows
  coaching_insight: text('coaching_insight'),         // one-sentence coaching note — surfaced by MAIA's morning brief / chat context
  outcome: text('outcome'),                           // 'booked' | 'follow_up' | 'drop' — set by Archie before analysis
  stage_reached: text('stage_reached'),                // opener/fact_find/enlarge/disturb/close/completed
  filler_words_json: text('filler_words_json'),        // JSON: { you_know: n, sort_of: n, ... }
  winning_phrases_json: text('winning_phrases_json'),   // JSON array of strings
  saved_phrase_indices_json: text('saved_phrase_indices_json').notNull().default('[]'), // JSON array — which winning_phrases[] indices have been saved to MUSE
  follow_up_notes: text('follow_up_notes'),
  follow_up_date: text('follow_up_date'),              // ISO date, if Archie gave a timeframe
  drop_reason: text('drop_reason'),
  prospect_quality: text('prospect_quality'),          // high/medium/low
  call_summary: text('call_summary'),
  reminder_set: integer('reminder_set').notNull().default(0),
  reminder_type: text('reminder_type'),                // 'show_up' | 'follow_up'
  reminder_date: text('reminder_date'),
  email_sent: integer('email_sent').notNull().default(0),
  dropped: integer('dropped').notNull().default(0),    // 1 once Archie confirms the drop
  objections_raised_json: text('objections_raised_json'), // JSON array of strings — not-booked calls only
  tone_notes: text('tone_notes'),                      // not-booked calls only
  what_resonated: text('what_resonated'),              // not-booked calls only
  debrief_summary: text('debrief_summary'),            // rolling summary of the debrief chat for this call, if any
  company_name: text('company_name'),                  // prospect's employer — booked calls only, feeds MAP; joined against map_companies.name
  prospect_nationality: text('prospect_nationality'),   // e.g. 'British', 'Australian' — booked calls only
  lead_source: text('lead_source'),                     // 'Sales Navigator' | 'LinkedIn' | 'Webinar' | 'Referral' | 'Cold Call' | 'Other' — booked calls only
  rapport_notes: text('rapport_notes'),                 // what helped on the call — free text from the booked debrief
  meeting_date: text('meeting_date'),                   // ISO date — booked calls only, captured via the same booked-debrief extraction as company/nationality/lead_source; drives the day-before referral reminder
  meeting_type: text('meeting_type').notNull().default('call'), // 'call' | 'meeting' | 'fact_find' — distinguishes a phone call row (APOLLO) from a MEETINGS agent debrief row
  created_at: integer('created_at').notNull(),
})

// One row per debrief-chat message, scoped to a single call — deliberately
// NOT maia_conversations (one JSON blob per AGENT, not per call — no way to
// scope history to one call without loading and filtering every debrief
// ever, across every call). Mirrors iris_chat_messages' per-row pattern.
export const apollo_debrief_messages = sqliteTable('apollo_debrief_messages', {
  id: text('id').primaryKey(),
  call_id: text('call_id').notNull(),
  role: text('role').notNull(),        // 'user' | 'assistant'
  content: text('content').notNull(),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

// Singleton — pattern memory across all debrief conversations, not per call.
export const apollo_coaching_profile = sqliteTable('apollo_coaching_profile', {
  id: text('id').primaryKey().default('singleton'),
  profile_json: text('profile_json').notNull().default('{}'),
  updated_at: integer('updated_at').notNull().default(sql`(unixepoch())`),
})

// One row per message, scoped by tab — MERCURY's two chat tabs (LinkedIn
// Messages / Quick Replies) were built with history kept in React state only
// ("each tab is an independent, in-browser-session conversation" — by
// design, per the component's own comment), so nothing survived a refresh.
// Same per-row pattern as iris_chat_messages/apollo_debrief_messages, scoped
// by tab instead of call_id.
export const mercury_chat_messages = sqliteTable('mercury_chat_messages', {
  id: text('id').primaryKey(),
  tab: text('tab').notNull(),          // 'linkedin_messages' | 'quick_replies'
  role: text('role').notNull(),        // 'user' | 'assistant'
  content: text('content').notNull(),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

export const oracle_analyses = sqliteTable('oracle_analyses', {
  id: text('id').primaryKey(),
  prospect_name: text('prospect_name'),
  current_employer: text('current_employer'),
  current_role: text('current_role'),
  current_location: text('current_location'),
  raw_linkedin_text: text('raw_linkedin_text'),   // Tier 2 — never sent to AI after the initial analysis call
  analysis_json: text('analysis_json').notNull(), // full OracleAnalysis JSON
  muse_case_id: text('muse_case_id'),             // muse_cases.id this analysis was filed against
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

export const hermes_script = sqliteTable('hermes_script', {
  id: text('id').primaryKey().default('singleton'),
  personas_json: text('personas_json'),
  shared_json: text('shared_json'),
  objections_json: text('objections_json'),
  updated_at: integer('updated_at').default(sql`(unixepoch())`),
})

export const maia_preferences = sqliteTable('maia_preferences', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),      // cassandra/iris/diana/hermes/general/all
  rule_type: text('rule_type').notNull(),     // exclude/include/style/behaviour
  rule_key: text('rule_key').notNull(),       // short identifier, e.g. "crypto", "fca_hearings"
  rule_value: text('rule_value').notNull(),   // the actual rule, e.g. "never include crypto news"
  confirmed: integer('confirmed').notNull().default(1),   // 1 = confirmed by user, 0 = proposed/pending
  source: text('source').notNull().default('manual'),     // manual/pattern/suggested
  times_applied: integer('times_applied').notNull().default(0),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
  updated_at: integer('updated_at').notNull().default(sql`(unixepoch())`),
})

export const maia_preference_proposals = sqliteTable('maia_preference_proposals', {
  id: text('id').primaryKey(),
  rule_key: text('rule_key').notNull(),
  rule_value: text('rule_value').notNull(),
  category: text('category').notNull(),
  reason: text('reason'),                     // why MAIA is proposing this
  rejection_count: integer('rejection_count').notNull().default(0),
  status: text('status').notNull().default('pending'),   // pending/confirmed/declined
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

export const hermes_scenarios = sqliteTable('hermes_scenarios', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  angle: text('angle'),
  opener: text('opener').notNull(),
  fact_find_questions: text('fact_find_questions').notNull(),   // JSON array
  enlarge_points: text('enlarge_points').notNull(),             // JSON array
  disturb_points: text('disturb_points').notNull(),             // JSON array
  product_pathway: text('product_pathway').notNull(),           // internal only, never said aloud
  product_questions: text('product_questions').notNull(),       // JSON array
  close_script: text('close_script').notNull(),
  // Not in the original spec's column list — added because the brief also
  // describes a "soft landing" block, identical in content to close_script's
  // sibling text but edited independently per scenario in the UI. Without its
  // own column, editing one would silently clobber the other.
  soft_landing: text('soft_landing').notNull(),
  objections: text('objections').notNull(),                     // JSON array of {objection, response}
  active: integer('active').notNull().default(1),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
  updated_at: integer('updated_at').notNull().default(sql`(unixepoch())`),
})

// ── New dashboard shell — conversation threads + goals ───────────────────────

export const maia_conversations = sqliteTable('maia_conversations', {
  id: text('id').primaryKey(),
  agent: text('agent').notNull().unique(),   // 'hub' | 'news' | 'calls' | 'linkedin' | 'social' | 'practice' | 'outreach' | 'study' | 'prospects'
  messages: text('messages').notNull().default('[]'),   // JSON array of message objects
  last_updated: integer('last_updated').notNull().default(sql`(unixepoch())`),
})

// Per-article CASSANDRA news items (Brave Search + Haiku relevance filter) —
// one row per qualifying article per day. Tracks used_on_call/used_in_post so
// CASSANDRA can eventually learn what's genuinely useful vs. what gets ignored.
export const cassandra_items = sqliteTable('cassandra_items', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),            // YYYY-MM-DD
  title: text('title').notNull(),
  source: text('source').notNull(),
  url: text('url').notNull(),
  published: text('published'),
  summary: text('summary').notNull(),
  key_quote: text('key_quote'),
  // Retired — CASSANDRA no longer generates a suggested call-angle talking
  // point, Archie reads the factual summary and forms his own. Column kept
  // (nullable) rather than dropped so historical rows stay readable.
  call_angle: text('call_angle'),
  content_angle: text('content_angle'),
  relevance: text('relevance').notNull(),   // 'high' | 'medium'
  category: text('category').notNull(),     // uk_pension | swiss_news | markets | regulation | geopolitical | retirement_destinations | devere_ceo
  used_on_call: integer('used_on_call').notNull().default(0),
  used_in_post: integer('used_in_post').notNull().default(0),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

// Cross-day "already shown to Archie" tracking for the CASSANDRA fetch
// pipeline — cassandra_items.date scopes dedup to a single day, so an article
// could otherwise resurface and get re-shown the next day. url is unique;
// rows older than 30 days are pruned once per fetch cycle.
export const cassandra_seen_articles = sqliteTable('cassandra_seen_articles', {
  id: text('id').primaryKey(),
  url: text('url').notNull().unique(),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

export const maia_goals = sqliteTable('maia_goals', {
  id: text('id').primaryKey(),
  goal_text: text('goal_text').notNull(),
  goal_type: text('goal_type').notNull(),   // 'short_term' | 'long_term'
  completed: integer('completed').notNull().default(0),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
  updated_at: integer('updated_at').notNull().default(sql`(unixepoch())`),
})

// Home page to-do list — distinct from the TODAY'S REMINDERS section the hub
// context panel derives on the fly from iris_posts/study_cards (hub-context's
// hubSections()); these are reminders Archie or MAIA explicitly add, not
// derived from other agents' state.
export const maia_reminders = sqliteTable('maia_reminders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  done: integer('done').notNull().default(0),
  due_date: text('due_date'),   // ISO date string, optional
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

// One-shot, date-triggered home-screen nudges — distinct from maia_reminders
// (a persistent to-do list filtered by created-date, never auto-dismissed).
// A row here is meant to surface on exactly one morning (remind_date) and
// then disappear once dismissed=1. First use: the day-before-a-booked-meeting
// referral nudge, set from APOLLO's booked-debrief flow (see apollo-debrief.ts).
export const reminders = sqliteTable('reminders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  remind_date: text('remind_date').notNull(), // YYYY-MM-DD, the day to show this
  message: text('message').notNull(),
  prospect_id: text('prospect_id'),           // nexus_prospects.id, nullable
  dismissed: integer('dismissed').notNull().default(0),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

// NEXUS — prospect tracking (Excel-replacement spreadsheet grid). batch is a
// free-text label for a data-mine/import run, so a wash update can be scoped
// to "everyone washed from last Tuesday's batch" if ever needed.
export const nexus_prospects = sqliteTable('nexus_prospects', {
  id: text('id').primaryKey(),
  last_name: text('last_name'),
  first_name: text('first_name'),
  company: text('company'),
  job_role: text('job_role'),
  employment_status: text('employment_status').notNull().default('Employee'),
  lead_channel: text('lead_channel').notNull().default('Cold - LinkedIn'),
  country: text('country').notNull().default('Switzerland'),
  linkedin_url: text('linkedin_url'),
  email: text('email'),
  phone: text('phone'),
  wash_result: text('wash_result'),   // 'Green' | 'Red' | 'Do Not Contact' | null
  wash_category: text('wash_category'), // 'ok_to_contact' | 'dnc' | 'others_client' | 'pool_conflict' | 'redlisted_company' | null — fine-grained bucket, set by the Claude wash-sheet parser only (legacy 3-column paste leaves this null)
  wash_reason: text('wash_reason'),   // reason given in the wash-result file
  date_washed: text('date_washed'),   // DD/MM/YYYY string, as supplied by compliance
  rewash_after: text('rewash_after'), // DD/MM/YYYY string — Red only
  conflicting_advisor: text('conflicting_advisor'), // set for wash_category = 'pool_conflict' only
  notes: text('notes'),
  batch: text('batch'),
  flagged: integer('flagged').notNull().default(0), // 1 = needs a human check (e.g. surname parsed as a single letter)
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
  updated_at: integer('updated_at').notNull().default(sql`(unixepoch())`),
})

// One row per Sales Nav import — read back as "the last import" for the
// Prospects right-panel LAST IMPORT section. Not a running history UI, just
// enough to show what the most recent import did until the next one overwrites it.
export const nexus_import_log = sqliteTable('nexus_import_log', {
  id: text('id').primaryKey(),
  added: integer('added').notNull(),
  skipped: integer('skipped').notNull(),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

// ATHENA rebuild — R01 qualification flashcards + deVere product knowledge base.
// Separate from the original study_cards/study_reviews tables (R01+R06+products,
// 287 real rows of existing progress) — those are left untouched per "do not
// drop existing tables", just no longer surfaced by the new two-tab UI.
//
// next_review is a plain ISO date string ('YYYY-MM-DD'), not a unix timestamp —
// SM2 here is day-granularity ("due today"), and comparing calendar days via
// epoch seconds invites the exact local-vs-UTC-midnight bug already hit once
// this session (DIANA's week/streak math) — a plain date string sidesteps it.
export const athena_cards = sqliteTable('athena_cards', {
  id: text('id').primaryKey(),
  tab: text('tab').notNull(),              // 'r01' | 'product'
  front: text('front').notNull(),
  back: text('back').notNull(),
  note: text('note'),                       // "why this matters" one-liner, shown with the answer
  product_id: text('product_id'),           // null for R01 cards
  difficulty: integer('difficulty').notNull().default(0),   // unused by SM2 math itself — schema fidelity only, per spec
  interval: integer('interval').notNull().default(1),       // days until next review
  ease_factor: real('ease_factor').notNull().default(2.5),
  next_review: text('next_review').notNull(),                // ISO date string, e.g. '2026-10-10'
  total_reviews: integer('total_reviews').notNull().default(0),
  correct_streak: integer('correct_streak').notNull().default(0),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
})

export const athena_products = sqliteTable('athena_products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  summary: text('summary').notNull(),
  sales_angles: text('sales_angles').notNull(),   // JSON array of strings
  mcqs: text('mcqs').notNull(),                   // JSON array of MCQ objects — spec's route description names this column; the given schema snippet omitted it
  podcast_script: text('podcast_script'),
  podcast_audio_url: text('podcast_audio_url'),
  source_filename: text('source_filename').notNull(),
  mcq_count: integer('mcq_count').notNull().default(0),
  card_count: integer('card_count').notNull().default(0),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
})

export const athena_sessions = sqliteTable('athena_sessions', {
  id: text('id').primaryKey(),
  tab: text('tab').notNull(),
  cards_reviewed: integer('cards_reviewed').notNull().default(0),
  correct_count: integer('correct_count').notNull().default(0),
  started_at: text('started_at').notNull(),
  ended_at: text('ended_at'),
})

// Social — Instagram & Facebook slideshow agent. image_urls stores real
// filesystem paths (per spec); API responses additionally embed each slide
// as a base64 data URL for direct <img src> use, read back from disk.
export const social_posts = sqliteTable('social_posts', {
  id: text('id').primaryKey(),
  source_type: text('source_type').notNull(),       // 'linkedin' | 'idea' | 'news'
  source_content: text('source_content').notNull(),
  hook_text: text('hook_text').notNull(),
  slides: text('slides').notNull(),                  // JSON array of slide objects
  caption: text('caption').notNull(),
  hashtags: text('hashtags').notNull(),
  image_urls: text('image_urls'),                    // JSON array of generated image paths
  status: text('status').notNull().default('draft'), // 'draft' | 'approved' | 'posted'
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
})

// MAP (codename atlas) — territory intelligence. One row per mapped employer
// across Greater Geneva / Lake Léman. Joined at query time against
// nexus_prospects (by company name) and apollo_calls (by company_name) for
// live stats — never a stored/cached join, see tools/map-db.ts.
export const map_companies = sqliteTable('map_companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull().default('company'),    // 'company' | 'school' | 'university' | 'hospital' | 'intl_org' | 'law_firm' | 'hotel' | 'public_sector' | 'other'
  sector: text('sector'),
  employees_est: integer('employees_est'),             // estimated headcount at this Geneva/Swiss location, not global
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  area: text('area'),                                  // e.g. 'Vernier', 'Plan-les-Ouates', 'Nyon'
  hq_location: text('hq_location'),                     // global HQ city, if this is a satellite/regional office
  swiss_offices: text('swiss_offices'),                  // JSON array of other Swiss office locations
  aliases: text('aliases'),                             // JSON array of alternative names prospects/calls may record this company under (e.g. "P&G", "STMicro")
  office_type: text('office_type').notNull().default('office'), // 'hq' | 'regional' | 'office' | 'campus' | 'site'
  ai_summary: text('ai_summary'),
  ai_summary_updated_at: integer('ai_summary_updated_at'),
  prospect_priority: text('prospect_priority').notNull().default('normal'), // 'high' | 'normal' | 'low' | 'avoid'
  avoid_reason: text('avoid_reason'),
  cassandra_notes: text('cassandra_notes'),              // latest Cassandra news snippet mentioning this company
  cassandra_updated_at: integer('cassandra_updated_at'),
  notes: text('notes'),                                 // Archie's own free-text note — "+ Add Company Note" in the right panel
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
  updated_at: integer('updated_at').notNull().default(sql`(unixepoch())`),
})
