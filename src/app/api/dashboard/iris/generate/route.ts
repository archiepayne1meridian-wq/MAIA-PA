// Manual dashboard generation — the voice note / post type flow. This is the
// first time IRIS can be generated on demand from the dashboard rather than
// only via the 6am/12pm cron or a Slack thread redraft.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { generateDraft, generateImage, postTypeToPillar, type PostType, type IrisDraft, type IrisSkip } from '@/lib/iris'
import {
  selectTopic,
  selectPostType,
  PILLAR_1_TOPICS,
  PILLAR_2_TOPICS,
  SPORTS_TWIST_TOPICS,
  FINANCIAL_TRUTH_TOPICS,
} from '@/lib/iris-handler'
import { getRecentTopics, getLastThreePillars, getTodaysBrief, getVoicePreferences, savePost } from '../../../../../../tools/iris'

const POST_TYPE_BANK: Record<Exclude<PostType, 'news_angle'>, string[]> = {
  sports_twist: SPORTS_TWIST_TOPICS,
  financial_truth: FINANCIAL_TRUTH_TOPICS,
  expat_reality: PILLAR_2_TOPICS,
}

function pickFromBank(bank: string[], recentTopics: string[]): string {
  const recentLower = new Set(recentTopics.map(t => t.toLowerCase()))
  const fresh = bank.filter(t => !recentLower.has(t.toLowerCase()))
  const pool = fresh.length > 0 ? fresh : bank
  return pool[0]!
}

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { ideaText, postType: requestedPostType } = await req.json().catch(() => ({})) as {
    ideaText?: string
    postType?: PostType | 'auto'
  }

  try {
    const [recentTopics, lastThreePillars, brief, voicePrefs] = await Promise.all([
      getRecentTopics(7),
      getLastThreePillars(),
      getTodaysBrief(),
      getVoicePreferences(),
    ])

    const now = new Date()
    const slot: 'morning' | 'evening' = now.getHours() < 13 ? 'morning' : 'evening'

    let pillar: 1 | 2 | 3
    let topic: string
    let cassandraSignal: string | null = null
    let postType: PostType
    let pregeneratedDraft: IrisDraft | undefined

    const ideaGiven = Boolean(ideaText?.trim())

    if (requestedPostType && requestedPostType !== 'auto') {
      // Forced post type — pick topic accordingly, using the idea if given.
      postType = requestedPostType
      pillar = postTypeToPillar(postType)
      if (ideaGiven) {
        topic = ideaText!.trim()
      } else if (postType === 'news_angle') {
        topic = brief ? 'Today\'s CASSANDRA market/regulatory angle' : PILLAR_1_TOPICS[0]!
        cassandraSignal = brief
      } else {
        topic = pickFromBank(POST_TYPE_BANK[postType], recentTopics)
      }
    } else {
      // Auto — reuse the exact same selection the cron uses (CASSANDRA signal
      // scan → opportunistic Pillar 3 → pillar balance), same topic bank.
      const selected = ideaGiven
        ? { pillar: 1 as const, topic: ideaText!.trim(), cassandraSignal: null }
        : await selectTopic(brief, recentTopics, lastThreePillars, slot, voicePrefs)
      pillar = selected.pillar
      topic = selected.topic
      cassandraSignal = selected.cassandraSignal
      postType = selectPostType(selected)
      pregeneratedDraft = 'pregeneratedDraft' in selected ? selected.pregeneratedDraft : undefined
    }

    const result: IrisDraft | IrisSkip = pregeneratedDraft
      ?? await generateDraft(slot, pillar, topic, cassandraSignal, voicePrefs, postType)

    if (result.skip) {
      return NextResponse.json({ skipped: true, reason: result.reason }, { status: 200 })
    }

    const draft = result
    const imageUrl = await generateImage(draft.imagePrompt)

    const postId = await savePost({
      slot,
      pillar: draft.pillar,
      topic: draft.topic,
      copy: draft.copy,
      image_prompt: draft.imagePrompt,
      image_url: imageUrl,
      format: draft.format,
      status: 'draft',
      post_type: draft.postType,
    })

    return NextResponse.json({
      id: postId,
      pillar: draft.pillar,
      post_type: draft.postType,
      topic: draft.topic,
      copy: draft.copy,
      image_url: imageUrl,
      format: draft.format,
    })
  } catch (err) {
    console.error('[iris] manual generate failed:', err)
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
