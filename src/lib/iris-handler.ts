// IRIS handler — the LinkedIn chat thread: morning auto-draft + chat message dispatch.
// Logs scheduled generation to `activity` with agent='IRIS'.

import { eq } from 'drizzle-orm'
import {
  generateDraft,
  suggestTopics,
  chatWithIris,
  type IrisChatTurn,
  type PostType,
} from './iris'
import { generateAndSaveHeroImage, buildHeroImagePrompt } from './iris-image'
import {
  getRecentTopics,
  savePost,
  setPostImage,
  getCurrentDraft,
  supersedeDraft,
  saveChatMessage,
  getTodaysBrief,
  getChatMessages,
  type IrisPost,
} from '../../tools/iris'
import { getDb } from '@/db'
import { activity } from '@/db/schema'

async function attachHeroImage(postId: string, copy: string, topic: string): Promise<void> {
  const imageUrl = await generateAndSaveHeroImage(postId, copy, topic)
  if (imageUrl) await setPostImage(postId, imageUrl, buildHeroImagePrompt(topic))
}

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
    await attachHeroImage(postId, draft.copy, draft.topic)

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
// One continuous conversation — Claude reads the last 20 messages and
// responds freely (chatWithIris in iris.ts), instead of classifying the
// message into a bucket and running a bucket-specific template. The only
// mechanical bits left here: saving every turn, creating an iris_posts draft
// row when the reply contains one (so the existing Approve/Post card UI still
// works), and firing image generation when — and only when — Archie just
// confirmed he wants one.

export type ChatDispatchResult =
  | { kind: 'draft'; postId: string; maiaMessage: string }
  | { kind: 'text'; maiaMessage: string }

const POST_TYPE_HINT: Record<string, string> = {
  personal_story: 'Story', news_angle: 'News', fact_drop: 'Fact',
  tool_guide: 'Guide', expat_reality: 'Reality', reframe: 'Reframe',
}

export async function dispatchChatMessage(
  message: string,
  requestedPostType?: PostType | 'auto',
): Promise<ChatDispatchResult> {
  // A pill selection steers the same conversation rather than forcing a
  // separate template path — Claude still decides how to actually write it.
  const hint = requestedPostType && requestedPostType !== 'auto' ? POST_TYPE_HINT[requestedPostType] : null
  const effectiveMessage = hint ? `[Write this as a ${hint} post] ${message}` : message

  await saveChatMessage('archie', message)

  const [recentMessages, brief] = await Promise.all([getChatMessages(20), getTodaysBrief()])
  const history: IrisChatTurn[] = recentMessages.map((m, i, arr) => ({
    role: m.role === 'archie' ? 'user' as const : 'assistant' as const,
    // The message was already saved above and is the last row returned —
    // swap in the hint-prefixed version Claude should actually see.
    content: i === arr.length - 1 && m.role === 'archie' ? effectiveMessage : m.content,
  }))

  const result = await chatWithIris(history, brief)

  let postId: string | null = null
  if (result.postCopy) {
    const current = await getCurrentDraft()
    if (current) await supersedeDraft(current.id)
    postId = await savePost({
      slot: new Date().getHours() < 13 ? 'morning' : 'evening',
      pillar: 1,
      topic: result.postCopy.split('\n')[0]!.slice(0, 80),
      copy: result.postCopy,
      status: 'draft',
    })
  }

  await saveChatMessage('maia', result.displayText, postId)

  // wantsImage usually fires on a LATER turn than the one that drafted the
  // post (Claude asks about style first, per the system prompt, before
  // confirming) — postId/postCopy above are only set when THIS turn itself
  // contains a new draft, so the image target is whichever draft is
  // currently live, not necessarily this turn's.
  if (result.wantsImage) {
    const imageTarget = postId && result.postCopy
      ? { id: postId, copy: result.postCopy }
      : await getCurrentDraft().then(d => d ? { id: d.id, copy: d.copy } : null)
    if (imageTarget) {
      void attachHeroImage(imageTarget.id, imageTarget.copy, imageTarget.copy.split('\n')[0]!.slice(0, 80)).catch(err =>
        console.error('[iris] attachHeroImage (chat-triggered) failed:', err),
      )
    }
  }

  if (postId) return { kind: 'draft', postId, maiaMessage: result.displayText }
  return { kind: 'text', maiaMessage: result.displayText }
}

export async function markSuperseded(postId: string): Promise<void> {
  await supersedeDraft(postId)
}

export type { IrisPost }
