// DIANA handler — config parser, intent detection, reference mode, roleplay state machine.

import * as fs from 'fs'
import * as path from 'path'
import { eq } from 'drizzle-orm'
import { postMessage } from './slack'
import { roleplayTurn, roleplayFeedback, objectionGuide } from './diana'
import {
  startSession,
  appendTurn,
  endSession,
  logPractice,
  parseTranscript,
  type DianaSession,
} from '../../tools/diana-db'
import { getDb } from '@/db'
import { activity } from '@/db/schema'

// ─── Config ───────────────────────────────────────────────────────────────────

export interface DianaObjection {
  id: string        // slug: 'not_interested', 'send_email', etc.
  label: string     // "Not interested"
  intent: string
  approach: string  // the Try script (quotes stripped)
  pivot: string
  principles: string
}

export interface DianaConfig {
  difficulty: 'warm' | 'neutral' | 'tough'
  firmTone: string
  objections: DianaObjection[]
  rubric: string    // raw rubric text from context/diana.md, passed to roleplayFeedback
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

export function parseDianaConfig(content: string): DianaConfig {
  const objections: DianaObjection[] = []
  let difficulty: 'warm' | 'neutral' | 'tough' = 'neutral'
  let firmTone = ''
  let rubric = ''

  const lines = content.split('\n')

  // Optional top-level YAML-like keys (user can add these above ## SERVICE BRIEF)
  for (const line of lines) {
    const diff = line.match(/^difficulty:\s*(warm|neutral|tough)/i)
    if (diff) difficulty = diff[1].toLowerCase() as 'warm' | 'neutral' | 'tough'
    const tone = line.match(/^firm_tone:\s*(.+)/)
    if (tone) firmTone = tone[1].trim()
  }

  // Parse OBJECTIONS and EVALUATION RUBRIC sections
  type Section = 'none' | 'objections' | 'rubric'
  let section: Section = 'none'
  let currentLabel = ''
  let currentId = ''
  let fields: Record<string, string> = {}
  const rubricLines: string[] = []

  function flushObjection() {
    if (!currentLabel) return
    objections.push({
      id: currentId,
      label: currentLabel,
      intent: fields['intent'] ?? '',
      approach: fields['try'] ?? '',
      pivot: fields['pivot'] ?? '',
      principles: fields['principles'] ?? '',
    })
    currentLabel = ''
    currentId = ''
    fields = {}
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    // Section headers
    if (/^##\s+OBJECTIONS/i.test(line)) { section = 'objections'; continue }
    if (/^##\s+EVALUATION\s+RUBRIC/i.test(line)) { flushObjection(); section = 'rubric'; continue }
    if (/^##\s+[A-Z]/.test(line) && section !== 'none') {
      if (section === 'objections') flushObjection()
      section = 'none'
      continue
    }

    if (section === 'objections') {
      // Objection header: **N. Label** (strip trailing ⚠️ or other emoji/notes)
      const headerMatch = line.match(/^\*\*\d+\.\s+(.+?)\*\*/)
      if (headerMatch) {
        flushObjection()
        // Strip trailing emoji and whitespace (e.g. "Where did you get my details  ⚠️")
        currentLabel = headerMatch[1].replace(/\s*[⚠️🔴🟡🟢✅❌*]+.*$/, '').trim()
        currentId = slugify(currentLabel)
        continue
      }

      // Field line: - *Field:* value
      const fieldMatch = line.match(/^[-•]\s+\*([^:]+):\*\s*(.*)/)
      if (fieldMatch && currentLabel) {
        const key = fieldMatch[1].toLowerCase().trim()
        const val = fieldMatch[2].trim()
        if (key === 'intent') fields['intent'] = val
        else if (key === 'try') {
          // Strip surrounding double-quotes from the script text
          fields['try'] = val.replace(/^"(.*)"$/, '$1')
        }
        else if (key === 'pivot') fields['pivot'] = val
        else if (key === 'principles') fields['principles'] = val
      }
      continue
    }

    if (section === 'rubric') {
      rubricLines.push(line)
    }
  }

  flushObjection()
  rubric = rubricLines.join('\n').trim()

  return { difficulty, firmTone, objections, rubric }
}

function loadDianaConfig(): DianaConfig {
  const p = path.join(process.cwd(), 'context', 'diana.md')
  const defaults: DianaConfig = {
    difficulty: 'neutral', firmTone: '', objections: [], rubric: '',
  }
  try {
    return parseDianaConfig(fs.readFileSync(p, 'utf-8'))
  } catch {
    return defaults
  }
}

// ─── Intent detection ─────────────────────────────────────────────────────────

export type DianaIntent =
  | { type: 'reference' }
  | { type: 'roleplay_start'; scenario?: string; difficulty?: 'warm' | 'neutral' | 'tough' }
  | { type: 'reset' }

export function detectDianaIntent(text: string): DianaIntent | null {
  const lower = text.trim().toLowerCase()

  // "diana," prefix or bare "diana" — always routes to DIANA
  const hasDianaPrefix =
    /^diana[,\s]/i.test(lower) ||
    /^\s*diana\s*$/i.test(lower)

  if (hasDianaPrefix) {
    // "diana, reset" — force-end active session without feedback
    if (/\breset\b/.test(lower)) return { type: 'reset' }

    // "diana, roleplay [scenario] [difficulty]"
    if (/\broleplay\b/.test(lower)) {
      // Extract quoted scenario: "the 'too busy' one" → "too busy"
      const quotedScenario =
        lower.match(/['"]([^'"]+)['"]/)?.[1]?.trim()
      // Extract difficulty word
      const diffWord = /\b(warm|neutral|tough|hard)\b/.exec(lower)?.[1]?.toLowerCase()
      const difficulty = diffWord === 'hard' ? 'tough'
        : diffWord as 'warm' | 'neutral' | 'tough' | undefined
      return { type: 'roleplay_start', scenario: quotedScenario, difficulty }
    }

    // Any other "diana ..." → reference mode
    return { type: 'reference' }
  }

  // Standalone "objections" or "practice objections"
  if (/^\s*(practice\s+)?objections?\s*$/i.test(lower)) {
    return { type: 'reference' }
  }

  return null
}

// ─── Shared activity logger ───────────────────────────────────────────────────

async function logActivityRow(
  type: string,
  input: string,
  slackUser?: string,
): Promise<{ rowId: string; startMs: number }> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()
  await getDb().insert(activity).values({
    id: rowId,
    event_id: `diana_${type}_${Date.now()}`,
    type,
    agent: 'DIANA',
    slack_user: slackUser,
    input: input.slice(0, 200),
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })
  return { rowId, startMs }
}

async function succeedActivity(rowId: string, startMs: number, output: string) {
  await getDb().update(activity)
    .set({ output, status: 'success', duration_ms: Date.now() - startMs })
    .where(eq(activity.id, rowId))
}

async function failActivity(rowId: string, startMs: number, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  await getDb().update(activity)
    .set({ output: msg, status: 'error', duration_ms: Date.now() - startMs })
    .where(eq(activity.id, rowId))
}

// ─── Reference mode ──────────────────────────────────────────────────────────

function buildObjectionButtons(objections: DianaObjection[]): unknown[] {
  // Slack allows max 5 buttons per actions block
  const buttons = objections.map(obj => ({
    type: 'button',
    text: { type: 'plain_text', text: obj.label, emoji: false },
    action_id: `diana_obj_${obj.id}`,
    value: obj.id,
  }))

  const chunks: typeof buttons[] = []
  for (let i = 0; i < buttons.length; i += 5) {
    chunks.push(buttons.slice(i, i + 5))
  }

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*DIANA — Objection Library*\nTap an objection to get the suggested approach, pivot, and the principles behind it.',
      },
    },
    ...chunks.map(chunk => ({ type: 'actions', elements: chunk })),
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: '_Tip: say "DIANA, roleplay" to practise a full mock call._',
      }],
    },
  ]
}

function formatObjectionDetail(obj: DianaObjection): string {
  return [
    `*${obj.label}*`,
    '',
    `*What they mean*`,
    obj.intent,
    '',
    `*Try*`,
    `"${obj.approach}"`,
    '',
    `*Pivot*`,
    obj.pivot,
    '',
    `*Why it works*`,
    obj.principles,
    '',
    `_Scripts are practice scaffolding — firm-approved material governs real calls._`,
  ].join('\n')
}

export async function handleObjectionLibrary(channel: string, slackUser?: string): Promise<void> {
  const config = loadDianaConfig()
  if (config.objections.length === 0) {
    await postMessage(channel, `_DIANA: no objections found in context/diana.md. Add entries to the OBJECTIONS section._`)
    return
  }
  const blocks = buildObjectionButtons(config.objections)
  await postMessage(channel, 'DIANA — Objection Library', undefined, blocks)
  if (slackUser) {
    await logActivityRow('objection_library', 'posted library', slackUser).catch(() => {})
  }
}

// Called from the interactive route when a diana_obj_<slug> button is tapped.
export async function handleObjectionDetail(
  slug: string,
  channel: string,
  userId?: string,
): Promise<void> {
  const config = loadDianaConfig()
  const obj = config.objections.find(o => o.id === slug)

  if (!obj) {
    // Un-curated objection — fall back to Claude (stub throws until Step 4)
    try {
      const guide = await objectionGuide(slug.replace(/_/g, ' '))
      await postMessage(channel, guide)
    } catch (err) {
      await postMessage(channel, `_DIANA: couldn't generate a guide for "${slug.replace(/_/g, ' ')}" — ${err instanceof Error ? err.message : String(err)}_`)
    }
    return
  }

  await postMessage(channel, formatObjectionDetail(obj))
  if (userId) {
    logPractice(userId, obj.label).catch(() => {})
  }
}

// ─── Roleplay state machine ───────────────────────────────────────────────────

export async function handleRoleplayStart(
  channel: string,
  userId: string | undefined,
  intent: Extract<DianaIntent, { type: 'roleplay_start' }>,
): Promise<void> {
  const config = loadDianaConfig()
  const difficulty = intent.difficulty ?? config.difficulty
  const scenario = intent.scenario ?? null

  const session = await startSession({
    slackUser: userId ?? 'unknown',
    scenario: scenario ?? undefined,
    difficulty,
  })

  // Deterministic opening — cold-call prospect simply answers the phone.
  // No Claude call here; the adviser makes the first move as the caller.
  const openingLine = 'Hello?'
  await appendTurn(session.id, 'diana', openingLine)

  const scenarioNote = scenario ? `\n_Scenario: "${scenario}"_` : ''
  await postMessage(
    channel,
    `*DIANA — Roleplay started* · Difficulty: *${difficulty}*${scenarioNote}\n\n` +
    `_You're the caller — the prospect has just picked up the phone._\n\n` +
    `*Prospect:* ${openingLine}\n\n` +
    `_Say "done", "exit", or "stop" to end and get scored feedback._`,
  )
}

export async function handleRoleplayTurn(
  channel: string,
  userId: string | undefined,
  session: DianaSession,
  userText: string,
): Promise<void> {
  // Use the transcript as it was when the session was fetched (before appending
  // the user message) so roleplayTurn sees the history then the new adviser line.
  const existingTranscript = parseTranscript(session.transcript_json)
  const difficulty = (session.difficulty as 'warm' | 'neutral' | 'tough') || 'neutral'

  let prospectReply: string
  try {
    prospectReply = await roleplayTurn(existingTranscript, userText, session.scenario, difficulty)
  } catch (err) {
    console.error('[diana] roleplayTurn failed:', err)
    // Still save the user's turn so the transcript stays complete
    await appendTurn(session.id, 'user', userText)
    await postMessage(
      channel,
      `_DIANA: couldn't generate a prospect reply — ${err instanceof Error ? err.message : String(err)}_`,
    )
    return
  }

  // Append both turns in order
  await appendTurn(session.id, 'user', userText)
  await appendTurn(session.id, 'diana', prospectReply)
  await postMessage(channel, `*Prospect:* ${prospectReply}`)
}

export async function handleRoleplayExit(
  channel: string,
  userId: string | undefined,
  session: DianaSession,
): Promise<void> {
  await endSession(session.id)

  const transcript = parseTranscript(session.transcript_json)
  const adviserTurns = transcript.filter(t => t.role === 'user').length

  if (adviserTurns === 0) {
    await postMessage(
      channel,
      `*DIANA — Session ended.*\n\n_No exchanges to score — say "DIANA, roleplay" whenever you're ready to try again._`,
    )
    return
  }

  const config = loadDianaConfig()

  let feedback: string
  try {
    feedback = await roleplayFeedback(transcript, config.rubric)
  } catch (err) {
    console.error('[diana] roleplayFeedback failed:', err)
    feedback = `_DIANA: couldn't generate feedback — ${err instanceof Error ? err.message : String(err)}_`
  }

  await postMessage(
    channel,
    `*DIANA — Session feedback* (${adviserTurns} exchange${adviserTurns !== 1 ? 's' : ''})\n\n${feedback}`,
  )
}

export async function handleRoleplayReset(
  channel: string,
  _userId: string | undefined,
  session: DianaSession,
): Promise<void> {
  await endSession(session.id)
  await postMessage(channel, `_Session reset. Say "DIANA, roleplay" to start again._`)
}
