import { postMessage, updateMessage } from './slack'
import {
  generateCards,
  generateMCQs,
  progressSummary,
  weaknessFocusMessage,
  studyPlanMessage,
} from './athena'
import {
  addCards,
  getDueCards,
  getCardById,
  applyReview,
  getMaterialForModule,
  getModulesWithCards,
  saveQuizSession,
  getQuizSession,
  advanceQuizSession,
  completeQuizSession,
  getProgress,
  getWeaknessReport,
  type Grade,
} from '../../tools/study-db'
import { currentQuestion, isComplete, moduleBreakdown, letterFor, resultFeedback } from '../../tools/mcq'
import { getDb } from '@/db'
import { activity, mcq_attempts } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeModule(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Intent detection ────────────────────────────────────────────────────────

export type AthenaIntent =
  | { type: 'ingest'; module: string; material: string }
  | { type: 'quiz' }
  | { type: 'daily_quiz'; module: string | null }
  | { type: 'progress' }
  | { type: 'weakness' }
  | { type: 'plan' }

export function detectAthenaIntent(text: string): AthenaIntent | null {
  const t = text.trim().toLowerCase()

  // Ingest: "athena, add this to <module>: <material>"
  // Module = text between "to" and the first colon (trimmed, title-cased)
  // Material = everything after the colon
  const ingestPrefixMatch = text.match(/(?:athena[,.]?\s+)?add this\s+to\s+/i)
  if (ingestPrefixMatch !== null) {
    const afterTo = text.slice((ingestPrefixMatch.index ?? 0) + ingestPrefixMatch[0].length)
    const colonIdx = afterTo.indexOf(':')
    const rawModule = colonIdx !== -1 ? afterTo.slice(0, colonIdx) : (afterTo.split(/[\s\n]/)[0] ?? 'General')
    const module = normalizeModule(rawModule)
    const material = colonIdx !== -1 ? afterTo.slice(colonIdx + 1).trim() : ''
    return { type: 'ingest', module, material }
  }

  // Daily quiz
  if (/daily quiz/.test(t)) {
    const modMatch = t.match(/daily quiz(?:\s+(?:for|on)\s+(.+))?/i)
    const module = modMatch?.[1]?.trim() ?? null
    return { type: 'daily_quiz', module }
  }

  // Flashcard quiz: "quiz me" or "flashcard" or "study flashcards"
  if (/\bquiz me\b/.test(t) || /\bflashcard/.test(t)) {
    return { type: 'quiz' }
  }

  // Weakness report
  if (/what should i study/.test(t)) {
    return { type: 'weakness' }
  }

  // Weekly study plan
  if (/plan my week/.test(t)) {
    return { type: 'plan' }
  }

  // Progress: "how am i doing" or "my progress" or "athena, progress"
  if (/how am i doing/.test(t) || /\bmy progress\b/.test(t) || /(?:athena[,.]?\s+)?progress$/.test(t)) {
    return { type: 'progress' }
  }

  return null
}

// ─── Activity logging ─────────────────────────────────────────────────────────

async function logActivity(
  type: string,
  input: string,
  slackUser: string | undefined,
  fn: () => Promise<string>
): Promise<string> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()
  const now = Math.floor(Date.now() / 1000)

  await getDb().insert(activity).values({
    id: rowId,
    type,
    agent: 'ATHENA',
    slack_user: slackUser,
    input,
    status: 'pending',
    created_at: now,
  })

  try {
    const output = await fn()
    await getDb()
      .update(activity)
      .set({ output, status: 'success', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
    return output
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await getDb()
      .update(activity)
      .set({ output: msg, status: 'error', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
    throw err
  }
}

// ─── Slack block helpers ──────────────────────────────────────────────────────

function cardFrontBlocks(cardId: string, front: string, module: string) {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${module}*\n\n${front}` },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Show answer' },
          action_id: `athena_reveal_${cardId}`,
          style: 'primary',
        },
      ],
    },
  ]
}

function cardBackBlocks(cardId: string, front: string, back: string) {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${front}\n\n*Answer:* ${back}` },
    },
    {
      type: 'actions',
      elements: (
        [
          { label: 'Again', grade: 'again', style: 'danger' },
          { label: 'Hard', grade: 'hard' },
          { label: 'Good', grade: 'good' },
          { label: 'Easy', grade: 'easy', style: 'primary' },
        ] as { label: string; grade: string; style?: string }[]
      ).map(btn => ({
        type: 'button',
        text: { type: 'plain_text', text: btn.label },
        action_id: `athena_grade_${cardId}_${btn.grade}`,
        ...(btn.style ? { style: btn.style } : {}),
      })),
    },
  ]
}

function mcqBlocks(sessionId: string, qIndex: number, q: { q: string; options: string[]; module: string }) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Q${qIndex + 1}* · _${q.module}_\n\n${q.q}`,
      },
    },
    {
      type: 'actions',
      // letterFor derives the label from array position — the same source used for scoring
      elements: q.options.map((opt, i) => ({
        type: 'button',
        text: { type: 'plain_text', text: `${letterFor(i)}: ${opt}` },
        action_id: `athena_mcq_${sessionId}_${qIndex}_${i}`,
      })),
    },
  ]
}

// ─── Flow handlers ────────────────────────────────────────────────────────────

export async function handleIngest(
  module: string,
  material: string,
  channel: string,
  slackUser: string | undefined
): Promise<void> {
  if (material.length < 20) {
    await postMessage(channel, "I need some material to work from — paste your notes after the command, e.g. _ATHENA, add this to Pensions: <your notes>_")
    return
  }

  await logActivity('athena_ingest', `module=${module} chars=${material.length}`, slackUser, async () => {
    const cards = await generateCards(module, material)
    if (cards.length === 0) {
      await postMessage(channel, `No cards could be extracted from that material. Try pasting more detailed content.`)
      return `no cards extracted`
    }
    await addCards(cards.map(c => ({ ...c, module })))
    await postMessage(channel, `Added *${cards.length}* card${cards.length !== 1 ? 's' : ''} to *${module}*. Use "quiz me" to start drilling.`)
    return `added ${cards.length} cards to ${module}`
  })
}

export async function handleFlashcardQuiz(
  channel: string,
  slackUser: string | undefined
): Promise<void> {
  await logActivity('athena_quiz_start', 'flashcard quiz', slackUser, async () => {
    const due = await getDueCards(1)
    if (due.length === 0) {
      await postMessage(
        channel,
        "No cards due right now. Either add material with _ATHENA, add this to <module>: <notes>_, or all your cards are scheduled for later."
      )
      return 'no due cards'
    }
    const card = due[0]
    await postMessage(channel, '', undefined, cardFrontBlocks(card.id, card.front, card.module))
    return `posted card ${card.id}`
  })
}

export async function handleReveal(
  cardId: string,
  channel: string,
  messageTs: string
): Promise<void> {
  const card = await getCardById(cardId)
  if (!card) {
    await postMessage(channel, 'Card not found — it may have been deleted.')
    return
  }
  await updateMessage(channel, messageTs, '', cardBackBlocks(cardId, card.front, card.back))
}

export async function handleGrade(
  cardId: string,
  grade: string,
  channel: string,
  messageTs: string,
  slackUser: string | undefined
): Promise<void> {
  const validGrades = ['again', 'hard', 'good', 'easy']
  if (!validGrades.includes(grade)) return

  await logActivity('athena_card_review', `card=${cardId} grade=${grade}`, slackUser, async () => {
    const { intervalDays } = await applyReview(cardId, grade as Grade)
    const label = intervalDays === 1 ? '✓ Next review tomorrow' : `✓ Next review in ${intervalDays} days`

    // Update graded message to show result
    await updateMessage(channel, messageTs, label)

    // Post next due card
    const due = await getDueCards(1)
    if (due.length === 0) {
      await postMessage(channel, "That's all your due cards for now. Come back later or add more material.")
    } else {
      const next = due[0]
      await postMessage(channel, '', undefined, cardFrontBlocks(next.id, next.front, next.module))
    }

    return `graded ${grade}, next due in ${intervalDays}d`
  })
}

export async function handleDailyQuiz(
  moduleFilter: string | null,
  channel: string,
  slackUser: string | undefined,
  quizSize: number = 20
): Promise<void> {
  // Determine which modules to draw from
  const availableModules = await getModulesWithCards()
  if (availableModules.length === 0) {
    await postMessage(channel, "No study material yet. Paste notes with _ATHENA, add this to <module>: <notes>_ first.")
    return
  }

  const modules = moduleFilter
    ? availableModules.filter(m => m.toLowerCase().includes(moduleFilter.toLowerCase()))
    : availableModules

  if (modules.length === 0) {
    await postMessage(channel, `No material found for module matching "${moduleFilter}". Available: ${availableModules.join(', ')}`)
    return
  }

  // Gather grounding material
  const materialByModule: Record<string, string> = {}
  for (const m of modules) {
    materialByModule[m] = await getMaterialForModule(m)
  }

  const totalWords = Object.values(materialByModule).join(' ').split(/\s+/).length
  if (totalWords < 50) {
    await postMessage(channel, "Not enough material to generate questions. Add more notes first.")
    return
  }

  // HARD STOP — tell user before making a paid Claude call
  await postMessage(
    channel,
    `⏸ *ATHENA — ready to generate quiz*\nModules: ${modules.join(', ')} · ~${totalWords} words of material · ${quizSize} questions\n\nReply *go ahead* to generate, or *cancel* to abort.`
  )

  // Insert pending row directly — logActivity always marks rows 'success', which would
  // break the status === 'pending' check in handleGoAheadOrCancel.
  await getDb().insert(activity).values({
    id: crypto.randomUUID(),
    type: 'athena_quiz_pending',
    agent: 'ATHENA',
    slack_user: slackUser,
    input: JSON.stringify({ modules, quizSize }),
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })
}

export async function handleDailyQuizConfirmed(
  modules: string[],
  quizSize: number,
  channel: string,
  slackUser: string | undefined
): Promise<void> {
  await logActivity('athena_daily_quiz', `modules=${modules.join(',')} size=${quizSize}`, slackUser, async () => {
    const materialByModule: Record<string, string> = {}
    for (const m of modules) {
      materialByModule[m] = await getMaterialForModule(m)
    }

    const { questions, skipped } = await generateMCQs(modules, materialByModule, quizSize)

    if (questions.length === 0) {
      await postMessage(channel, "Couldn't generate any questions from the available material. Add more notes to at least one module first.")
      return 'no questions generated'
    }

    if (skipped.length > 0) {
      await postMessage(channel, `_Note: skipped thin modules — ${skipped.join(', ')}. Add more material to include them._`)
    }

    const sessionId = await saveQuizSession({ modules, questions })
    const q = questions[0]
    await postMessage(channel, '', undefined, mcqBlocks(sessionId, 0, q))

    return `quiz ${sessionId} started, ${questions.length} questions`
  })
}

export async function handleMcqAnswer(
  sessionId: string,
  qIndex: number,
  choiceIndex: number,
  channel: string,
  messageTs: string,
  slackUser: string | undefined
): Promise<void> {
  const session = await getQuizSession(sessionId)
  if (!session) {
    await postMessage(channel, 'Quiz session not found.')
    return
  }

  // Concurrency guard: only accept the answer for the current question
  if (qIndex !== session.current_index) return

  const q = session.questions[qIndex]
  if (!q) return

  const correct = choiceIndex === q.correctIndex
  const feedback = resultFeedback(q, choiceIndex)

  await updateMessage(channel, messageTs, feedback)

  await advanceQuizSession(sessionId, qIndex, correct, q.q, q.module)

  const updated = await getQuizSession(sessionId)
  if (!updated || isComplete(updated)) {
    if (updated) await completeQuizSession(sessionId)

    // Build per-module breakdown from mcq_attempts
    const attempts = await getDb()
      .select({ module: mcq_attempts.module, correct: mcq_attempts.correct })
      .from(mcq_attempts)
      .where(eq(mcq_attempts.session_id, sessionId))

    const breakdown = moduleBreakdown(updated ?? session, attempts)
    const breakdownText = breakdown
      .map(b => `${b.module}: ${b.correct}/${b.total} (${b.pct}%)`)
      .join(' · ')

    const finalScore = (updated?.score ?? session.score) + (correct ? 1 : 0)
    const total = session.total

    await logActivity('athena_daily_quiz_complete', `session=${sessionId}`, slackUser, async () => {
      await postMessage(
        channel,
        `*Quiz complete!* ${finalScore}/${total}\n\n${breakdownText}\n\nWant tomorrow's quiz weighted to your weak topics? Say "daily quiz".`
      )
      return `score ${finalScore}/${total}`
    })
  } else {
    const nextQ = currentQuestion(updated)
    if (nextQ) {
      await postMessage(channel, '', undefined, mcqBlocks(sessionId, updated.current_index, nextQ))
    }
  }
}

export async function handleProgress(
  channel: string,
  slackUser: string | undefined
): Promise<void> {
  await logActivity('athena_progress', 'progress check', slackUser, async () => {
    const stats = await getProgress()
    const examDate = readAthenaConfig()?.exam_date ?? null
    const daysToExam = examDate ? daysUntil(examDate) : null
    const msg = progressSummary(stats, daysToExam)
    await postMessage(channel, msg)
    return msg
  })
}

export async function handleWeaknessReport(
  channel: string,
  slackUser: string | undefined
): Promise<void> {
  await logActivity('athena_weakness', 'weakness report', slackUser, async () => {
    const report = await getWeaknessReport(30)
    const msg = weaknessFocusMessage(report)
    await postMessage(channel, msg)
    return msg
  })
}

export async function handleStudyPlan(
  channel: string,
  slackUser: string | undefined
): Promise<void> {
  await logActivity('athena_study_plan', 'study plan', slackUser, async () => {
    const report = await getWeaknessReport(30)
    const config = readAthenaConfig()
    const msg = studyPlanMessage(
      report,
      config?.exam_date ?? null,
      config?.weekly_hours ?? null
    )
    await postMessage(channel, msg)
    return msg
  })
}

// ─── Config reader ────────────────────────────────────────────────────────────

interface AthenaConfig {
  exam_date?: string
  weekly_hours?: number
  daily_quiz_size?: number
}

function readAthenaConfig(): AthenaConfig | null {
  try {
    const p = path.join(process.cwd(), 'context', 'athena.md')
    if (!fs.existsSync(p)) return null
    const raw = fs.readFileSync(p, 'utf8')
    const config: AthenaConfig = {}

    const examDate = raw.match(/^exam_date:\s*(.+)$/m)?.[1]?.trim()
    if (examDate && examDate !== '#' && !examDate.startsWith('#')) config.exam_date = examDate

    const hours = raw.match(/^weekly_hours:\s*(\d+)/m)?.[1]
    if (hours) config.weekly_hours = parseInt(hours, 10)

    const size = raw.match(/^daily_quiz_size:\s*(\d+)/m)?.[1]
    if (size) config.daily_quiz_size = parseInt(size, 10)

    return config
  } catch {
    return null
  }
}

function daysUntil(isoDate: string): number | null {
  try {
    const target = new Date(isoDate).getTime()
    const now = Date.now()
    return Math.ceil((target - now) / 86400000)
  } catch {
    return null
  }
}

// ─── "go ahead" / "cancel" routing ────────────────────────────────────────────
// Called from the events route when ATHENA is waiting for quiz confirmation.

export async function handleGoAheadOrCancel(
  text: string,
  channel: string,
  slackUser: string | undefined
): Promise<boolean> {
  const t = text.trim().toLowerCase()
  if (t !== 'go ahead' && t !== 'cancel') return false

  // Fetch the most recent pending quiz activity row (DESC so rows[0] is newest)
  const rows = await getDb()
    .select()
    .from(activity)
    .where(eq(activity.type, 'athena_quiz_pending'))
    .orderBy(sql`${activity.created_at} DESC`)
    .limit(1)

  const pending = rows[0]
  if (!pending || pending.status !== 'pending') return false

  if (t === 'cancel') {
    await getDb()
      .update(activity)
      .set({ status: 'cancelled', output: 'user cancelled' })
      .where(eq(activity.id, pending.id))
    await postMessage(channel, 'Quiz cancelled.')
    return true
  }

  // go ahead — parse params from the pending row input
  let params: { modules: string[]; quizSize: number }
  try {
    params = JSON.parse(pending.input ?? '{}')
  } catch {
    await postMessage(channel, 'Could not read quiz params — try "daily quiz" again.')
    return true
  }

  await getDb()
    .update(activity)
    .set({ status: 'confirmed' })
    .where(eq(activity.id, pending.id))

  await handleDailyQuizConfirmed(params.modules, params.quizSize, channel, slackUser)
  return true
}
