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
  type IrisSkip,
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
  getSuggestedTopic,
  type IrisPost,
  type VoicePref,
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
// Relevance test for every signal and topic below: "Would someone living in
// Switzerland with assets in another country think this affects them?"

const PILLAR_1_SIGNALS = [
  'inheritance tax', 'iht', 'pension death benefit',
  'non-dom', 'non-domicile',
  'tax residency', 'residency rules', 'residency status',
  'double taxation', 'double tax treaty', 'tax treaty',
  'qrops', 'annual allowance', 'pension access age', 'pension transfer',
  'state pension', 'frozen abroad', 'triple lock', 'qualifying years',
  'isa rules', 'isa non-resident',
  'offshore bond',
  'gbp/chf', 'gbp/eur', 'eur/chf', 'swiss franc', 'exchange rate',
  'swiss tax', 'switzerland tax', 'finma',
  'fatca', 'crs', 'common reporting standard',
  'budget', 'autumn statement', 'spring statement',
  'forced heirship', 'succession rules', 'estate planning', 'inheritance rules',
  'cost of living', 'inflation',
  'uk property abroad', 'property while abroad',
]

const PILLAR_1_TOPICS = [
  'IHT changes — especially pension death benefits from April 2027',
  'Non-dom rule changes and what they mean for long-term expats',
  'Tax residency rules — when does it change, what triggers it, what are the consequences',
  'Double taxation treaties — updates, new agreements, what they mean practically',
  'Pension changes — QROPS rules, annual allowance, access age (55→57 in 2028)',
  'State pension — frozen abroad rules, qualifying years, triple lock updates',
  'ISA rules for non-UK residents — frozen, can\'t contribute, still tax-free',
  'Offshore bond regulation changes',
  'Currency moves — GBP/CHF, GBP/EUR, EUR/CHF — when significant enough to matter',
  'Swiss tax changes affecting residents with foreign assets',
  'EU/FATCA/CRS reporting changes affecting cross-border money',
  'Political changes with direct financial implications — budgets, autumn statements, new government policies on tax or pensions',
  'Inheritance and estate planning — forced heirship, succession rules across borders',
  'Cost of living/inflation where it hits purchasing power of foreign-held assets',
  'What happens to your UK property when you live abroad',
  'The cash pile problem — expats holding too much in cash across multiple currencies',
]

const PILLAR_2_TOPICS = [
  'Moving to Switzerland — financial things nobody tells you',
  'Managing money across multiple currencies',
  '"I\'ve got a pension back home I haven\'t looked at in years" — who else?',
  'What does your adviser actually do — and can they follow you if you move again?',
  'The wrapper problem — your ISA, GIA, pension sitting in the wrong structure',
  'Estate planning across borders — does your will hold up in Switzerland?',
  'The IHT tail — leaving the UK doesn\'t mean leaving the UK tax system',
  'Swiss banking vs offshore — what\'s the difference and does it matter?',
  'Retiring abroad — what does that actually cost and where does the money come from?',
  '"What are you waiting for?" — the cash sitting doing nothing for years',
  'Protection abroad — life cover, health cover, what follows you and what doesn\'t',
  'Currency risk — earning in CHF, thinking in GBP, retiring somewhere else',
]

// Pillar 3 is opportunistic, not a fixed topic bank — this is the search
// guidance handed to generateDraft() once per run to see if anything's worth
// posting today. Claude reports back its own specific story label (or skips).
const PILLAR_3_SEARCH_TOPIC = (dateStr: string): string =>
  `sports news finance money lifestyle today ${dateStr} golf football F1 tennis`

// ─── Topic selection (deterministic) ─────────────────────────────────────────

export interface SelectedTopic {
  pillar: 1 | 2 | 3
  topic: string
  cassandraSignal: string | null
}

// Pillar 3 requires an actual web search to know if it's even in play today, so
// selection is async and — when Pillar 3 fires — already carries the fully
// generated draft (generateDraft() both searches and judges "is this worth
// posting" in one call; there's no cheaper way to pre-check it).
export interface PickedTopic extends SelectedTopic {
  pregeneratedDraft?: IrisDraft
}

export async function selectTopic(
  brief: string | null,
  recentTopics: string[],
  lastThreePillars: number[],
  slot: 'morning' | 'evening',
  voicePrefs: VoicePref[],
  attemptPillar3 = true,
): Promise<PickedTopic> {
  const recentLower = new Set(recentTopics.map(t => t.toLowerCase()))

  // Pillar balance override: if last 3 posts all Pillar 1, force 2
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

  // Step 2 — Pillar 3, opportunistic only: try once per run (not on retries).
  // No fixed rotation slot, no forced post — only fires if today's sports/
  // lifestyle search turns up something with a genuine finance angle.
  if (attemptPillar3) {
    const dateStr = new Date().toISOString().slice(0, 10)
    const pillar3Result = await generateDraft(slot, 3, PILLAR_3_SEARCH_TOPIC(dateStr), null, voicePrefs)
    if (!pillar3Result.skip) {
      return {
        pillar: 3,
        topic: pillar3Result.topic,
        cassandraSignal: null,
        pregeneratedDraft: pillar3Result,
      }
    }
    console.log('[iris] Pillar 3 skipped — no strong sports angle today')
  }

  // Step 3 — pillar balance between 1 and 2 only
  const p1count = lastThreePillars.filter(p => p === 1).length

  const targetPillar: 1 | 2 = (last3AllP1 || p1count >= 2) ? 2 : 1

  // Step 4 — pick from topic bank for target pillar, avoiding recent
  const bankMap: Record<1 | 2, string[]> = {
    1: PILLAR_1_TOPICS,   // fallback if no CASSANDRA signal fires
    2: PILLAR_2_TOPICS,
  }

  const bank = bankMap[targetPillar]
  const fresh = bank.filter(t => !recentLower.has(t.toLowerCase()))
  const pool = fresh.length > 0 ? fresh : bank  // reset if all recently used
  // Cycle: pick first in pool (deterministic — same run = same pick)
  return { pillar: targetPillar, topic: pool[0]!, cassandraSignal: null }
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
    const [recentTopics, lastThreePillars, brief, suggestedPost] = await Promise.all([
      getRecentTopics(7),
      getLastThreePillars(),
      getTodaysBrief(),
      getSuggestedTopic(),
    ])
    const voicePrefs = await getVoicePreferences()

    let selected: PickedTopic
    if (suggestedPost) {
      // Consume the CASSANDRA-flagged topic: mark it selected, use it for this draft.
      await updatePostStatus(suggestedPost.id, 'selected')
      selected = {
        pillar: suggestedPost.pillar as 1 | 2 | 3,
        topic: suggestedPost.topic,
        cassandraSignal: null,
      }
    } else {
      selected = await selectTopic(brief, recentTopics, lastThreePillars, slot, voicePrefs)
    }

    // Relevance filter can skip a topic — fall back to the next topic in the
    // bank, up to a few attempts, rather than force a weak/irrelevant post.
    // A Pillar 3 pick already ran its search+draft inside selectTopic() — reuse
    // that result instead of searching a second time via generateDraft.
    const MAX_ATTEMPTS = 4
    const skipped: { topic: string; reason: string }[] = []
    const excludedTopics = [...recentTopics]
    let result: IrisDraft | IrisSkip = selected.pregeneratedDraft
      ?? await generateDraft(slot, selected.pillar, selected.topic, selected.cassandraSignal, voicePrefs)

    while (result.skip && skipped.length < MAX_ATTEMPTS - 1) {
      skipped.push({ topic: selected.topic, reason: result.reason })
      console.log(`[iris] topic skipped (${result.reason}): "${selected.topic}" — falling back to next topic in bank`)
      if (suggestedPost && selected.topic === suggestedPost.topic) {
        await updatePostStatus(suggestedPost.id, 'skipped')
      }
      excludedTopics.push(selected.topic)
      // Pillar 3 already had its one shot this run — don't re-search on retries.
      selected = await selectTopic(brief, excludedTopics, lastThreePillars, slot, voicePrefs, false)
      result = selected.pregeneratedDraft
        ?? await generateDraft(slot, selected.pillar, selected.topic, selected.cassandraSignal, voicePrefs)
    }

    if (result.skip) {
      skipped.push({ topic: selected.topic, reason: result.reason })
      const summary = skipped.map(s => `"${s.topic}" (${s.reason})`).join('; ')
      console.log(`[iris] buildScheduledDraft: all ${skipped.length} attempts skipped by relevance filter — ${summary}`)
      await getDb()
        .update(activity)
        .set({ output: `no relevant topic found — skipped: ${summary}`, status: 'success', duration_ms: Date.now() - startMs })
        .where(eq(activity.id, rowId))
      await postMessage(channel, `_IRIS: nothing relevant to post this ${slot} — every topic tried failed the relevance filter. Skipped rather than forcing it._`)
      return
    }

    const draft: IrisDraft = result
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

    const redraftResult: IrisDraft | IrisSkip = await generateDraft(
      post.slot as 'morning' | 'evening',
      post.pillar as 1 | 2 | 3,
      post.topic,
      feedbackContext,
      voicePrefs,
    )

    if (redraftResult.skip) {
      console.log(`[iris] handleIrisThread redraft skipped (${redraftResult.reason}): "${post.topic}"`)
      await postMessage(
        channel,
        `_IRIS: this redraft failed the relevance filter (${redraftResult.reason}) — original draft left unchanged._`,
        post.slack_ts ?? undefined,
      )
      return
    }

    const newDraft: IrisDraft = redraftResult

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
