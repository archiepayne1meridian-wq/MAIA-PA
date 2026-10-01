// Returns the LinkedIn chat thread — merged messages + draft cards — plus the
// right-panel data (post history, voice learnings, weekly tracker).

import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import {
  getChatMessages,
  getRecentPosts,
  getApprovedPosts,
  getCurrentDraft,
  getTopVoiceLearnings,
} from '../../../../../../tools/iris'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [messages, recentPosts, approvedPosts, currentDraft, voiceLearnings] = await Promise.all([
    getChatMessages(50),
    getRecentPosts(30),
    getApprovedPosts(7),
    getCurrentDraft(),
    getTopVoiceLearnings(10),
  ])

  const postsById = new Map(recentPosts.map(p => [p.id, p]))

  const timeline = messages.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    created_at: m.created_at,
    draft: m.draft_post_id ? postsById.get(m.draft_post_id) ?? null : null,
  }))

  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400
  const postsThisWeek = recentPosts.filter(p => p.created_at >= weekAgo)
  const approvedThisWeek = postsThisWeek.filter(p => p.status === 'approved' || p.status === 'posted').length

  return NextResponse.json({
    timeline,
    activeDraftId: currentDraft?.id ?? null,
    history: approvedPosts,
    voiceLearnings,
    weeklyTracker: {
      totalThisWeek: postsThisWeek.length,
      approvedThisWeek,
    },
  })
}
