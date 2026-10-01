// IRIS handler — the LinkedIn chat thread: morning auto-draft + chat message dispatch.
// Logs scheduled generation to `activity` with agent='IRIS'.

import { eq } from 'drizzle-orm'
import {
  generateDraft,
  refinePost,
  suggestTopics,
  classifyChatMessage,
  getVoiceLearnings,
  type PostType,
} from './iris'
import {
  getRecentTopics,
  savePost,
  getCurrentDraft,
  supersedeDraft,
  saveChatMessage,
  getTodaysBrief,
  type IrisPost,
} from '../../tools/iris'
import { getDb } from '@/db'
import { activity } from '@/db/schema'

// ─── Morning auto-draft (called by GET /api/cron/iris/morning-draft) ─────────

export async function buildMorningDraft(): Promise<{ postId: string; topic: string }> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()

  await getDb().insert(activity).values({
    id: rowId,
    event_id: `iris_morning_draft_${Date.now()}`,
    type: 'scheduled_draft',
    agent: 'IRIS',
    input: 'morning',
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })

  try {
    const [brief, recentTopics, current] = await Promise.all([getTodaysBrief(), getRecentTopics(14), getCurrentDraft()])
    if (current) await supersedeDraft(current.id)

    let topic: string | undefined
    if (!brief) {
      const suggestions = await suggestTopics(recentTopics, null)
      topic = suggestions[0]
    }

    const draft = await generateDraft({ topic, postType: 'auto', todayAngle: brief })

    const postId = await savePost({
      slot: 'morning',
      pillar: 1,
      topic: draft.topic,
      copy: draft.copy,
      status: 'draft',
      post_type: draft.postType,
    })

    await saveChatMessage('maia', "Good morning — here's today's draft:", postId)

    await getDb()
      .update(activity)
      .set({ output: `draft generated: ${draft.topic}`, status: 'success', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))

    return { postId, topic: draft.topic }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[iris] buildMorningDraft failed:', err)
    await getDb()
      .update(activity)
      .set({ output: msg, status: 'error', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
    throw err
  }
}

// ─── Chat message dispatch (called by POST /api/dashboard/iris/chat) ────────

export type ChatDispatchResult =
  | { kind: 'draft'; postId: string; maiaMessage: string }
  | { kind: 'text'; maiaMessage: string }

// Generates a fresh draft, supersedes whatever was previously the live draft
// (if any), and drops the new one into the chat thread.
async function dropDraft(
  topic: string | undefined,
  todayAngle: string | null | undefined,
  postType: PostType | 'auto',
  maiaIntro: string,
): Promise<ChatDispatchResult> {
  const current = await getCurrentDraft()
  if (current) await supersedeDraft(current.id)

  const draft = await generateDraft({ topic, postType, todayAngle })
  const postId = await savePost({
    slot: new Date().getHours() < 13 ? 'morning' : 'evening',
    pillar: 1,
    topic: draft.topic,
    copy: draft.copy,
    status: 'draft',
    post_type: draft.postType,
  })
  await saveChatMessage('maia', maiaIntro, postId)
  return { kind: 'draft', postId, maiaMessage: maiaIntro }
}

export async function dispatchChatMessage(
  message: string,
  requestedPostType?: PostType | 'auto',
): Promise<ChatDispatchResult> {
  const current = await getCurrentDraft()
  await saveChatMessage('archie', message)

  // An explicit pill selection always wins over the free-text classifier.
  if (requestedPostType && requestedPostType !== 'auto') {
    return dropDraft(message, null, requestedPostType, "Here's a new draft:")
  }

  const classified = await classifyChatMessage(message, Boolean(current))

  switch (classified.action) {
    case 'refine': {
      if (!current) return dropDraft(message, null, 'auto', "Here's a new draft:")
      const voiceLearnings = await getVoiceLearnings(10)
      const refined = await refinePost({ currentDraft: current.copy, instruction: classified.instruction, voiceLearnings })
      await supersedeDraft(current.id)
      const postId = await savePost({
        slot: current.slot || (new Date().getHours() < 13 ? 'morning' : 'evening'),
        pillar: 1,
        topic: current.topic,
        copy: refined,
        status: 'draft',
        post_type: current.post_type,
      })
      await saveChatMessage('maia', 'Refined:', postId)
      return { kind: 'draft', postId, maiaMessage: 'Refined:' }
    }

    case 'suggest': {
      const [brief, recentTopics] = await Promise.all([getTodaysBrief(), getRecentTopics(14)])
      const suggestions = await suggestTopics(recentTopics, brief)
      const text = suggestions.length > 0
        ? `A few ideas for today:\n\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
        : "Couldn't come up with fresh ideas right now — try describing a rough topic instead."
      await saveChatMessage('maia', text)
      return { kind: 'text', maiaMessage: text }
    }

    case 'news_angle': {
      const brief = await getTodaysBrief()
      if (!brief) {
        const text = "No CASSANDRA brief yet today — try again once this morning's market brief has run, or give me a topic directly."
        await saveChatMessage('maia', text)
        return { kind: 'text', maiaMessage: text }
      }
      return dropDraft(undefined, brief, 'auto', "Here's a draft on today's news angle:")
    }

    case 'restart':
      return dropDraft(current?.topic, null, 'auto', 'Starting again:')

    case 'show_history':
      return { kind: 'text', maiaMessage: '__show_history__' }

    case 'idea':
    default:
      return dropDraft(classified.action === 'idea' ? classified.topic : message, null, 'auto', "Here's a draft:")
  }
}

export async function markSuperseded(postId: string): Promise<void> {
  await supersedeDraft(postId)
}

export type { IrisPost }
