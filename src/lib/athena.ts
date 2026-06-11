import { askWith } from './claude'
import type { MCQQuestion } from '../../tools/study-db'
import type { ProgressStats, WeaknessEntry } from '../../tools/study-db'

const CARD_SYSTEM = `You are ATHENA, a CISI study coach. Your job is to extract atomic flashcards from study material.

Rules:
- Only use facts explicitly stated in the provided material. Never invent or supplement from your own knowledge.
- Each card must test exactly one fact.
- Front: a clear question or prompt. Back: a concise answer.
- Deduplicate near-identical cards.
- Output ONLY valid JSON: an array of objects with "front" and "back" string fields. No commentary, no markdown wrapper.

Example output:
[{"front":"What is the primary purpose of a pension?","back":"To provide retirement income by accumulating tax-advantaged savings."}]`

const MCQ_SYSTEM = `You are ATHENA, a CISI study coach. Your job is to write multiple-choice questions from study material.

Rules:
- Every question must be grounded in the provided material. Never use facts from outside it.
- Each question must have exactly 4 options, one correct, three plausible distractors.
- Options are PLAIN TEXT only — no letter prefix (A, B, C, D). Letters are added by the display layer.
- correctIndex is the 0-based index of the correct option in the options array (0 = first option, 1 = second, 2 = third, 3 = fourth). It must match the position of the correct option in the array.
- Include a one-line explanation (1–2 sentences max).
- Tag each question with its module name exactly as given.
- If the material for a module is too thin to write a question without invention, skip it and note it in a "skipped" array.
- Output ONLY valid JSON matching this schema exactly:
  {"questions": [{
    "q": "...",
    "options": ["plain text option 1", "plain text option 2", "plain text option 3", "plain text option 4"],
    "correctIndex": 2,
    "explanation": "...",
    "module": "..."
  }], "skipped": ["module1", ...]}

Example: if the correct answer is the third option, set correctIndex to 2.`

export async function generateCards(
  module: string,
  material: string
): Promise<{ front: string; back: string }[]> {
  const prompt = `Module: ${module}\n\nMaterial:\n${material}\n\nExtract atomic flashcards from this material only.`
  const raw = await askWith(CARD_SYSTEM, prompt, 4096)

  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`ATHENA card generation returned unparseable JSON: ${raw.slice(0, 200)}`)
  }

  if (!Array.isArray(parsed)) throw new Error('ATHENA card generation did not return an array')

  return parsed
    .filter((c): c is { front: string; back: string } =>
      typeof c === 'object' && c !== null && typeof (c as Record<string, unknown>).front === 'string' && typeof (c as Record<string, unknown>).back === 'string'
    )
    .map(c => ({ front: c.front.trim(), back: c.back.trim() }))
}

export async function generateMCQs(
  modules: string[],
  materialByModule: Record<string, string>,
  count: number
): Promise<{ questions: MCQQuestion[]; skipped: string[] }> {
  const materialBlock = modules
    .map(m => `### Module: ${m}\n${materialByModule[m] ?? '(no material)'}`)
    .join('\n\n')

  const prompt = `Generate ${count} multiple-choice questions from the material below. Distribute them proportionally across modules. Tag each with its module name exactly.\n\n${materialBlock}`
  const raw = await askWith(MCQ_SYSTEM, prompt, 4096)

  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`ATHENA MCQ generation returned unparseable JSON: ${raw.slice(0, 200)}`)
  }

  const obj = parsed as { questions?: unknown[]; skipped?: string[] }
  const questions = (obj.questions ?? [])
    .filter(
      (q): q is MCQQuestion =>
        typeof q === 'object' &&
        q !== null &&
        typeof (q as Record<string, unknown>).q === 'string' &&
        Array.isArray((q as Record<string, unknown>).options) &&
        typeof (q as Record<string, unknown>).correctIndex === 'number' &&
        typeof (q as Record<string, unknown>).explanation === 'string' &&
        typeof (q as Record<string, unknown>).module === 'string'
    )
    .map(q => ({
      ...q,
      // Defensive strip: remove any leading "A: ", "B: " etc. Claude may add despite instructions
      options: q.options.map(opt =>
        typeof opt === 'string' ? opt.replace(/^[A-D]:\s*/i, '').trim() : opt
      ) as [string, string, string, string],
    }))

  return { questions, skipped: obj.skipped ?? [] }
}

export function progressSummary(stats: ProgressStats, daysToExam: number | null): string {
  const lines: string[] = ['*ATHENA — Progress Report*']
  lines.push(`Cards: ${stats.totalCards} total · ${stats.masteredCards} mastered (${stats.masteryPct}%)`)
  lines.push(`Due today: ${stats.dueToday}`)
  lines.push(`Study streak: ${stats.streakDays} day${stats.streakDays !== 1 ? 's' : ''}`)
  if (stats.lastQuizScore) {
    lines.push(`Last quiz: ${stats.lastQuizScore.score}/${stats.lastQuizScore.total}`)
  }
  if (daysToExam !== null) {
    lines.push(`Days to exam: ${daysToExam}`)
  }
  return lines.join('\n')
}

export function weaknessFocusMessage(report: WeaknessEntry[]): string {
  if (report.length === 0) {
    return "No quiz or review data yet — complete a daily quiz first to see your weak areas."
  }

  const lines = ['*ATHENA — Weakness Report*', '', '*Focus in NotebookLM this week:*']
  report.slice(0, 5).forEach((entry, i) => {
    const pct = entry.mcqAccuracy !== null ? `${Math.round(entry.mcqAccuracy * 100)}% MCQ` : ''
    const lapse = entry.lapseRate !== null ? `${Math.round(entry.lapseRate * 100)}% lapse` : ''
    const stats = [pct, lapse].filter(Boolean).join(' · ')
    lines.push(`${i + 1}) *${entry.module}*${stats ? ` (${stats})` : ''}`)
  })

  lines.push('')
  lines.push('Tip: open these topics in NotebookLM, generate a study guide, then paste it here with "ATHENA, add this to <module>".')
  return lines.join('\n')
}

export function studyPlanMessage(
  report: WeaknessEntry[],
  examDate: string | null,
  weeklyHours: number | null
): string {
  const weak = report.slice(0, 3).map(e => e.module)
  const lines = ['*ATHENA — Weekly Study Plan*', '']

  if (examDate) lines.push(`Exam: ${examDate}`)
  if (weeklyHours) lines.push(`Available: ~${weeklyHours}h this week`)
  lines.push('')

  lines.push('*Daily habit:* Start each session with "daily quiz" to keep retrieval active.')
  lines.push('')

  if (weak.length > 0) {
    lines.push('*NotebookLM focus this week:*')
    weak.forEach((m, i) => lines.push(`  Day ${i + 1}–${i + 2}: Deep-read *${m}* → generate a study guide → paste here.`))
  } else {
    lines.push('No weakness data yet. Complete a daily quiz first, then ask again.')
  }

  lines.push('')
  lines.push('*Flashcards:* Run "quiz me" after each NotebookLM session to lock in new cards.')
  lines.push('')
  lines.push('_This plan is a guide — verify topics against the official CISI workbook._')

  return lines.join('\n')
}
