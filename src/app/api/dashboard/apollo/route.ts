import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getAnalysedCalls } from '../../../../../tools/apollo'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const calls = await getAnalysedCalls(20)
  return NextResponse.json({
    calls: calls.map(c => ({
      id: c.id,
      call_date: c.call_date,
      prospect_name: c.prospect_name,
      created_at: c.created_at,
      outcome: c.outcome,
      stageReached: c.stage_reached,
      coachingInsight: c.coaching_insight,
      fillerWords: c.filler_words_json ? JSON.parse(c.filler_words_json) as Record<string, number> : null,
      winningPhrases: c.winning_phrases_json ? JSON.parse(c.winning_phrases_json) as string[] : [],
      savedPhraseIndices: JSON.parse(c.saved_phrase_indices_json) as number[],
      crmNotes: c.advisor_brief,
      confirmationEmail: c.client_email,
      emailSent: Boolean(c.email_sent),
      followUpNotes: c.follow_up_notes,
      followUpDate: c.follow_up_date,
      dropReason: c.drop_reason,
      dropped: Boolean(c.dropped),
      prospectQuality: c.prospect_quality,
      callSummary: c.call_summary,
      reminderSet: Boolean(c.reminder_set),
      reminderType: c.reminder_type,
      reminderDate: c.reminder_date,
    })),
  })
}
