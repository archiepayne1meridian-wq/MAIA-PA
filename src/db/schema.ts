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
  type: text('type').notNull(),        // 'morning' | 'on_demand'
  markets_json: text('markets_json').notNull(),
  headlines_json: text('headlines_json').notNull(),
  summary: text('summary').notNull(),
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
  created_at: integer('created_at').notNull(),
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
  agent: text('agent').notNull().unique(),   // 'hub' | 'news' | 'calls' | 'linkedin' | 'social' | 'practice' | 'outreach' | 'study' | 'prospects' | 'pipeline'
  messages: text('messages').notNull().default('[]'),   // JSON array of message objects
  last_updated: integer('last_updated').notNull().default(sql`(unixepoch())`),
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
