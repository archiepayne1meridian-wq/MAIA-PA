// IRIS handler — topic selection (deterministic) + Slack thread handler + scheduled brief builder.
// Logs all actions to `activity` with agent='IRIS'.

import { eq } from 'drizzle-orm'
import { postMessage, updateMessage } from './slack'
import {
  formatSlackMessage,
  generateDraft,
  generateImage,
  extractVoicePreferences,
  type IrisDraft,
} from './iris'
import {
  getRecentTopics,
  getLastThreePillars,
  savePost,
  updatePostStatus,
  updatePostSlackTs,
  getVoicePreferences,
  saveVoicePreference,
  getTodaysBrief,
  type IrisPost,
} from '../../tools/iris'
import { getDb } from '@/db'
import { activity, iris_posts } from '@/db/schema'

// Upload image to Slack (v2 files API) and share in channel/thread.
// Returns silently on any failure — never blocks post delivery.
async function postSlackImageInThread(
  imageDataUrl: string,
  channel: string,
  threadTs: string,
): Promise<void> {
  try {
    const token = process.env.SLACK_BOT_TOKEN
    if (!token) return

    const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return
    const [, mime, b64] = match
    const buf = Buffer.from(b64!, 'base64')
    const ext = mime === 'image/svg+xml' ? 'svg' : 'png'

    // Step 1 — get upload URL
    const urlRes = await fetch(
      `https://slack.com/api/files.getUploadURLExternal?filename=iris-post.${ext}&length=${buf.length}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const urlData = await urlRes.json() as { ok: boolean; upload_url?: string; file_id?: string }
    if (!urlData.ok || !urlData.upload_url || !urlData.file_id) return

    // Step 2 — upload bytes
    await fetch(urlData.upload_url, {
      method: 'POST',
      headers: { 'Content-Type': mime! },
      body: buf,
    })

    // Step 3 — complete + share to thread
    await fetch('https://slack.com/api/files.completeUploadExternal', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{ id: urlData.file_id }],
        channel_id: channel,
        thread_ts: threadTs,
      }),
    })
  } catch (err) {
    console.error('[iris] postSlackImageInThread failed:', err)
  }
}

// ─── Topic banks (from context/iris.md) ──────────────────────────────────────

const PILLAR_1_SIGNALS = [
  'rate decision', 'interest rate', 'basis points', 'bps', 'fed funds',
  'ecb rate', 'bank of england', 'boe rate', 'inflation', 'cpi', 'rpi',
  'ipo', 'listing', 'floated', 'debut', 'stock market debut',
  'earnings', 'quarterly results', 'profit warning', 'revenue miss',
  'currency', 'exchange rate', 'gbp', 'pound fell', 'pound rose',
  'crypto', 'bitcoin', 'btc', 'ethereum', 'eth',
  'oil price', 'commodity', 'gold price',
  'budget', 'tax announcement', 'recession', 'gdp',
  'regulation', 'regulatory change', 'mfsa', 'fca ruling',
]

const PILLAR_2_TOPICS = [
  'Tax residency timing and common mistakes for expats',
  'UK pension traps for expats — QROPS, transfers, and what nobody tells you',
  'What happens to your ISA when you leave the UK?',
  'Currency risk and GBP/EUR moves — what expats need to think about',
  'NHS vs private health abroad — the financial calculation nobody does',
  'What nobody tells you about managing money abroad in year one',
  'The Malta move — what I\'ve learned so far about expat finances',
  'Expat emergency fund sizing — how much is enough when abroad?',
  'Non-dom vs expat — what\'s the real difference and why does it matter?',
  'Moving abroad: what do you wish you\'d sorted differently in year one?',
]

const PILLAR_3_TOPICS = [
  'The weekend\'s Premier League results — what stood out?',
  'F1: the battle at the front and what it means for the championship',
  'Golf\'s biggest moments — what makes a Sunday at Augusta different?',
  'The Ryder Cup: why it\'s the most nerve-wracking event in golf',
  'Favourite sports moments: what\'s your "where were you when" moment?',
  'Moving to Malta: the things that surprised me most about life here',
  'What I\'ve been reading, watching, or listening to lately',
  'What do you do when work pressure peaks? How do you reset?',
]

// ─── Topic selection (deterministic) ─────────────────────────────────────────

export interface SelectedTopic {
  pillar: 1 | 2 | 3
  topic: string
  cassandraSignal: string | null
}

export function selectTopic(
  brief: string | null,
  recentTopics: string[],
  lastThreePillars: number[],
): SelectedTopic {
  const recentLower = new Set(recentTopics.map(t => t.toLowerCase()))

  // Pillar balance override: if last 3 posts all Pillar 1, force 2 or 3
  const last3AllP1 = lastThreePillars.length >= 3 && lastThreePillars.every(p => p === 1)

  // Step 1 — CASSANDRA scan for Pillar 1 signals (unless pillar balance override)
  if (!last3AllP1 && brief) {
    const briefLower = brief.toLowerCase()
    const signal = PILLAR_1_SIGNALS.find(kw => briefLower.includes(kw))
    if (signal) {
      // Extract a brief snippet around the signal for context
      const idx = briefLower.indexOf(signal)
      const snippet = brief.slice(Math.max(0, idx - 40), idx + 120).replace(/\n/g, ' ').trim()
      const topic = `Market moment: ${snippet.slice(0, 80)}...`
      return { pillar: 1, topic, cassandraSignal: snippet }
    }
  }

  // Step 2 — pillar balance: compute target pillar
  const p1count = lastThreePillars.filter(p => p === 1).length
  const p2count = lastThreePillars.filter(p => p === 2).length
  const p3count = lastThreePillars.filter(p => p === 3).length

  let targetPillar: 1 | 2 | 3
  if (last3AllP1 || p1count >= 2) {
    // Alternate between 2 and 3
    targetPillar = p2count <= p3count ? 2 : 3
  } else if (p2count >= 2) {
    targetPillar = p3count <= p1count ? 3 : 1
  } else {
    // Default: prefer 1, then 2, then 3 per 50/30/20 target
    targetPillar = 1
  }

  // Step 3 — pick from topic bank for target pillar, avoiding recent
  const bankMap: Record<1 | 2 | 3, string[]> = {
    1: [],   // Pillar 1 from topic bank — fallback if no CASSANDRA signal
    2: PILLAR_2_TOPICS,
    3: PILLAR_3_TOPICS,
  }

  const bank = bankMap[targetPillar]
  if (bank.length > 0) {
    const fresh = bank.filter(t => !recentLower.has(t.toLowerCase()))
    const pool = fresh.length > 0 ? fresh : bank  // reset if all recently used
    // Cycle: pick first in pool (deterministic — same run = same pick)
    return { pillar: targetPillar, topic: pool[0]!, cassandraSignal: null }
  }

  // Final fallback: Pillar 2 first available
  const p2fresh = PILLAR_2_TOPICS.filter(t => !recentLower.has(t.toLowerCase()))
  const p2topic = (p2fresh.length > 0 ? p2fresh : PILLAR_2_TOPICS)[0]!
  return { pillar: 2, topic: p2topic, cassandraSignal: null }
}

// ─── Scheduled draft builder (called by POST /api/cron/iris) ─────────────────

export async function buildScheduledDraft(
  slot: 'morning' | 'evening',
  channel: string,
): Promise<void> {
  const rowId = crypto.randomUUID()
  const startMs = Date.now()

  await getDb().insert(activity).values({
    id: rowId,
    event_id: `iris_draft_${slot}_${Date.now()}`,
    type: 'scheduled_draft',
    agent: 'IRIS',
    input: slot,
    status: 'pending',
    created_at: Math.floor(Date.now() / 1000),
  })

  try {
    const [recentTopics, lastThreePillars, brief] = await Promise.all([
      getRecentTopics(7),
      getLastThreePillars(),
      getTodaysBrief(),
    ])

    const selected = selectTopic(brief, recentTopics, lastThreePillars)

    const voicePrefs = await getVoicePreferences()
    const draft: IrisDraft = await generateDraft(
      slot, selected.pillar, selected.topic, selected.cassandraSignal, voicePrefs,
    )
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
      slack_ts: null,
    })

    const slackText = formatSlackMessage(slot, draft.topic, draft.format, draft.postTime, draft.copy)
    const msg = await postMessage(channel, slackText)
    await updatePostSlackTs(postId, msg.ts)

    // Upload image in thread (fire-and-forget — never blocks delivery)
    void postSlackImageInThread(imageUrl, channel, msg.ts)

    await getDb()
      .update(activity)
      .set({ output: `draft posted: ${selected.topic}`, status: 'success', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[iris] buildScheduledDraft failed:', err)
    await getDb()
      .update(activity)
      .set({ output: msg, status: 'error', duration_ms: Date.now() - startMs })
      .where(eq(activity.id, rowId))
    await postMessage(channel, `⚠ IRIS: draft generation failed — ${msg}`)
  }
}

// ─── Slack thread reply handler ───────────────────────────────────────────────

export async function handleIrisThread(
  post: IrisPost,
  replyText: string,
  channel: string,
  _replyTs: string,
): Promise<void> {
  const lower = replyText.trim().toLowerCase()

  if (/^done\s*$/i.test(lower)) {
    await updatePostStatus(post.id, 'approved')

    // Extract any stylistic preferences from the "done" message and prior topic context
    const prefs = await extractVoicePreferences(
      `Topic: ${post.topic}\nFinal approval message: ${replyText}`,
    )
    await Promise.all(
      prefs.map(p => saveVoicePreference(p.type, p.value, `iris_thread_${post.id}`)),
    )

    const prefNote = prefs.length > 0
      ? `\n_Voice memory: ${prefs.length} preference${prefs.length !== 1 ? 's' : ''} logged._`
      : ''
    await postMessage(
      channel,
      `✅ *IRIS — Draft approved.* Copy saved. Paste it to LinkedIn manually when ready.${prefNote}`,
      post.slack_ts ?? undefined,
    )
    return
  }

  // Redraft with feedback injected
  try {
    const [voicePrefs, todaysBrief] = await Promise.all([
      getVoicePreferences(),
      getTodaysBrief(),
    ])

    // Extract and persist any stylistic preferences from this feedback
    const prefs = await extractVoicePreferences(
      `Topic: ${post.topic}\nUser feedback: ${replyText}`,
    )
    await Promise.all(
      prefs.map(p => saveVoicePreference(p.type, p.value, `iris_thread_${post.id}`)),
    )

    // Inject feedback as context so Claude knows what to change
    const feedbackContext = [
      todaysBrief ?? '',
      `\nPrevious draft (first 300 chars):\n${post.copy.slice(0, 300)}`,
      `\nUser feedback to apply: ${replyText}`,
    ].join('').trim()

    const newDraft: IrisDraft = await generateDraft(
      post.slot as 'morning' | 'evening',
      post.pillar as 1 | 2 | 3,
      post.topic,
      feedbackContext,
      voicePrefs,
    )

    // Persist updated copy
    await getDb()
      .update(iris_posts)
      .set({ copy: newDraft.copy })
      .where(eq(iris_posts.id, post.id))

    // Update the original Slack message in-place
    await updateMessage(
      channel,
      post.slack_ts!,
      formatSlackMessage(
        post.slot as 'morning' | 'evening',
        newDraft.topic,
        newDraft.format,
        newDraft.postTime,
        newDraft.copy,
      ),
    )

    const prefNote = prefs.length > 0 ? ` (${prefs.length} pref${prefs.length !== 1 ? 's' : ''} logged)` : ''
    await postMessage(
      channel,
      `✏️ *Redrafted.*${prefNote} Reply again to refine further, or say *"done"* to approve.`,
      post.slack_ts ?? undefined,
    )
  } catch (err) {
    console.error('[iris] handleIrisThread redraft failed:', err)
    await postMessage(
      channel,
      `⚠ IRIS: redraft failed — ${err instanceof Error ? err.message : String(err)}`,
      post.slack_ts ?? undefined,
    )
  }
}

// ─── Intent detection ─────────────────────────────────────────────────────────

export type IrisIntent = { type: 'status' }

export function detectIrisIntent(text: string): IrisIntent | null {
  const lower = text.trim().toLowerCase()
  if (/^iris[,.]?\s+status$/i.test(lower)) return { type: 'status' }
  return null
}

export async function handleIrisStatus(channel: string): Promise<void> {
  const voicePrefs = await getVoicePreferences()
  const recent = await getRecentTopics(7)
  const lines = [
    '*IRIS — Status*',
    `Posts drafted (last 7 days): ${recent.length}`,
    `Voice preferences logged: ${voicePrefs.length}`,
    recent.length > 0 ? `Last topic: ${recent[0]}` : 'No drafts yet.',
  ]
  await postMessage(channel, lines.join('\n'))
}
