// DIANA — database CRUD for roleplay sessions.
// Pure data access: no Claude, no Slack. All reasoning stays in diana-handler.ts.

import { getDb } from '@/db'
import { diana_sessions, activity, research_briefs } from '@/db/schema'
import { eq, and, desc, isNotNull, gte } from 'drizzle-orm'

export interface DianaTranscriptTurn {
  role: 'user' | 'diana'
  text: string
  ts: number
}

export interface DianaSession {
  id: string
  slack_user: string
  scenario: string | null
  difficulty: string
  prospect_profile: string | null    // legacy fixed-profile key — no longer written
  prospect_name: string | null       // legacy fixed-profile name — no longer written
  generated_prospect: string | null  // JSON GeneratedProspect (src/lib/diana.ts) — one per session
  score_total: number | null         // set on exit once the call is scored
  transcript_json: string
  status: string
  created_at: number
  last_active_at: number
  ended_at: number | null
}

// Sessions inactive for longer than this are auto-expired by getActiveSession.
export const SESSION_TIMEOUT_SECS = 4 * 60 * 60  // 4 hours

// ── Pure functions (exported for unit testing) ────────────────────────────────

export function parseTranscript(json: string): DianaTranscriptTurn[] {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed as DianaTranscriptTurn[]
  } catch {
    return []
  }
}

export function appendTurnToTranscript(
  existing: DianaTranscriptTurn[],
  role: 'user' | 'diana',
  text: string,
  nowSecs: number = Math.floor(Date.now() / 1000),
): DianaTranscriptTurn[] {
  return [...existing, { role, text, ts: nowSecs }]
}

// Returns true if the session has been inactive longer than SESSION_TIMEOUT_SECS.
export function isSessionExpired(
  lastActiveAt: number,
  nowSecs: number = Math.floor(Date.now() / 1000),
): boolean {
  return nowSecs - lastActiveAt > SESSION_TIMEOUT_SECS
}

// ── DB functions ──────────────────────────────────────────────────────────────

export async function startSession(opts: {
  slackUser: string
  scenario?: string
  difficulty?: 'warm' | 'neutral' | 'tough'
  generatedProspect?: string  // pre-serialised JSON — diana-db stays free of diana.ts's domain types
}): Promise<DianaSession> {
  // End any existing active session for this user before starting a new one.
  const existing = await getActiveSession(opts.slackUser)
  if (existing) await endSession(existing.id)

  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const row = {
    id,
    slack_user: opts.slackUser,
    scenario: opts.scenario ?? null,
    difficulty: opts.difficulty ?? 'neutral',
    prospect_profile: null,
    prospect_name: null,
    generated_prospect: opts.generatedProspect ?? null,
    score_total: null,
    transcript_json: '[]',
    status: 'active',
    created_at: now,
    last_active_at: now,
    ended_at: null,
  }
  await getDb().insert(diana_sessions).values(row)
  return row as DianaSession
}

export async function setSessionScore(sessionId: string, total: number): Promise<void> {
  await getDb().update(diana_sessions).set({ score_total: total }).where(eq(diana_sessions.id, sessionId))
}

// Raw JSON strings only — parsing/typing stays in src/lib/diana.ts (parseGeneratedProspect)
// so this file has no dependency on diana.ts's domain types.
export async function getRecentGeneratedProspects(slackUser: string, limit: number): Promise<string[]> {
  const rows = await getDb()
    .select({ generated_prospect: diana_sessions.generated_prospect })
    .from(diana_sessions)
    .where(and(eq(diana_sessions.slack_user, slackUser), isNotNull(diana_sessions.generated_prospect)))
    .orderBy(desc(diana_sessions.created_at))
    .limit(limit)
  return rows.map(r => r.generated_prospect).filter((v): v is string => v !== null)
}

// Appends a turn to the session transcript. Returns the updated transcript.
export async function appendTurn(
  sessionId: string,
  role: 'user' | 'diana',
  text: string,
): Promise<DianaTranscriptTurn[]> {
  const rows = await getDb()
    .select({ transcript_json: diana_sessions.transcript_json })
    .from(diana_sessions)
    .where(eq(diana_sessions.id, sessionId))
    .limit(1)

  const existing = parseTranscript(rows[0]?.transcript_json ?? '[]')
  const updated = appendTurnToTranscript(existing, role, text)
  const now = Math.floor(Date.now() / 1000)

  await getDb()
    .update(diana_sessions)
    .set({ transcript_json: JSON.stringify(updated), last_active_at: now })
    .where(eq(diana_sessions.id, sessionId))

  return updated
}

// Returns the active session for a user, or null if none exists or the session
// has been inactive for longer than SESSION_TIMEOUT_SECS (auto-expired).
export async function getActiveSession(slackUser: string): Promise<DianaSession | null> {
  const rows = await getDb()
    .select()
    .from(diana_sessions)
    .where(and(
      eq(diana_sessions.slack_user, slackUser),
      eq(diana_sessions.status, 'active'),
    ))
    .limit(1)

  if (rows.length === 0) return null
  const session = rows[0] as DianaSession

  if (isSessionExpired(session.last_active_at)) {
    await endSession(session.id)
    return null
  }

  return session
}

export async function endSession(sessionId: string): Promise<void> {
  await getDb()
    .update(diana_sessions)
    .set({ status: 'ended', ended_at: Math.floor(Date.now() / 1000) })
    .where(eq(diana_sessions.id, sessionId))
}

// Returns a short "today's angle" string from the most recent CASSANDRA brief
// generated today (research_briefs), or null if nothing has run yet today —
// callers must not force a connection when this is null. Reads headlines_json
// directly with a minimal, tolerant parse rather than importing cassandra.ts's
// types, keeping this file free of dependencies on diana.ts/cassandra.ts domain
// types (same principle as generated_prospect being handled as raw JSON above).
export async function getTodayAngle(): Promise<string | null> {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const todayStart = Math.floor(d.getTime() / 1000)

  const rows = await getDb()
    .select({ headlines_json: research_briefs.headlines_json })
    .from(research_briefs)
    .where(gte(research_briefs.created_at, todayStart))
    .orderBy(desc(research_briefs.created_at))
    .limit(1)

  const headlinesJson = rows[0]?.headlines_json
  if (!headlinesJson) return null

  try {
    const parsed = JSON.parse(headlinesJson)
    const first = Array.isArray(parsed) ? (parsed[0] as Record<string, unknown> | undefined) : undefined
    if (first) {
      if (typeof first.summary === 'string' && first.summary.trim()) return first.summary.trim()
      if (typeof first.title === 'string' && first.title.trim()) return first.title.trim()
    }
  } catch {
    // malformed JSON — no angle today, don't force it
  }
  return null
}

// Records which objection was drilled, for pattern visibility later.
export async function logPractice(slackUser: string, objection: string): Promise<void> {
  await getDb().insert(activity).values({
    id: crypto.randomUUID(),
    event_id: `diana_practice_${slackUser}_${Date.now()}`,
    type: 'objection_drill',
    agent: 'DIANA',
    slack_user: slackUser,
    input: objection,
    status: 'success',
    created_at: Math.floor(Date.now() / 1000),
  })
}
