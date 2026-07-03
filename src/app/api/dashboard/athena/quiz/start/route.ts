// Web adapter — start a new MCQ quiz session.

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { saveQuizSession, getModulesWithCards, getMaterialForModule } from '../../../../../../../tools/study-db'
import { generateMCQs } from '@/lib/athena'

export async function POST(req: Request) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { modules?: string[]; size?: number }
  const availableModules = await getModulesWithCards()
  const modules = body.modules?.length ? body.modules.filter(m => availableModules.includes(m)) : availableModules
  const size = body.size ?? 20

  if (modules.length === 0) {
    return NextResponse.json({ error: 'No material to generate questions from. Add CISI notes in Slack first.' }, { status: 422 })
  }

  const materialByModule: Record<string, string> = {}
  for (const m of modules) {
    materialByModule[m] = await getMaterialForModule(m)
  }

  let questions: Awaited<ReturnType<typeof generateMCQs>>['questions']
  let skipped: string[]
  try {
    ({ questions, skipped } = await generateMCQs(modules, materialByModule, size))
  } catch (err) {
    console.error('[athena/quiz/start] generateMCQs failed:', err)
    return NextResponse.json({ error: 'Quiz generation failed — try again' }, { status: 500 })
  }

  if (questions.length === 0) {
    return NextResponse.json({ error: 'No questions generated — material may be too thin' }, { status: 422 })
  }

  const sessionId = await saveQuizSession({ modules, questions })

  return NextResponse.json({
    sessionId,
    question: questions[0],
    qIndex: 0,
    total: questions.length,
    skipped,
  })
}
