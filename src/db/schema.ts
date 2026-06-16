import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

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

export const diana_sessions = sqliteTable('diana_sessions', {
  id: text('id').primaryKey(),
  slack_user: text('slack_user').notNull(),
  scenario: text('scenario'),                                       // objection label / persona being drilled
  difficulty: text('difficulty').notNull().default('neutral'),      // 'warm' | 'neutral' | 'tough'
  transcript_json: text('transcript_json').notNull().default('[]'), // DianaTranscriptTurn[]
  status: text('status').notNull().default('active'),               // 'active' | 'ended'
  created_at: integer('created_at').notNull(),
  last_active_at: integer('last_active_at').notNull(),              // updated on each turn; used for 4h timeout
  ended_at: integer('ended_at'),
})
