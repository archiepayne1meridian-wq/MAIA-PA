// Live one-line preview text for the agent rail's third row — reuses the
// exact same data the right-side context panel already fetches
// (src/lib/hub-context-sections.ts) rather than standing up a second data
// path. Four agents have no live source to pull from (no backing feature
// yet, same ones hub-context's EMPTY_AGENT_SECTIONS already treats as
// honestly empty): social, outreach, map, meetings — these fall back to
// hub-agents.ts's static placeholder text, same as a fetch failure would.

import type { ConversationAgent } from '@/app/dashboard/components/hub-agents'
import { hubSections, newsSections, callsSections, linkedinSections, practiceSections, studySections, type Section } from './hub-context-sections'
import { getStats } from '../../tools/nexus-db'

function firstOfType<T extends Section['type']>(sections: Section[], type: T): Extract<Section, { type: T }> | null {
  return (sections.find(s => s.type === type) as Extract<Section, { type: T }> | undefined) ?? null
}

async function hubPreview(): Promise<string | null> {
  const sections = await hubSections()
  const reminders = firstOfType(sections, 'reminders')
  const first = reminders?.items[0]
  if (!first) return null
  return first.sub ? `${first.text} · ${first.sub}` : first.text
}

async function newsPreview(): Promise<string | null> {
  const sections = await newsSections()
  // Two 'list' sections exist here — FOLLOWING (static topic list, always
  // present) and TODAY'S ITEMS (the actual live articles) — must match by
  // title, not just type, or this silently picks the wrong one.
  const todaysItems = sections.find(s => s.type === 'list' && s.title === "TODAY'S ITEMS")
  return todaysItems?.type === 'list' ? (todaysItems.items[0]?.text ?? null) : null
}

async function callsPreview(): Promise<string | null> {
  const sections = await callsSections()
  const callbacks = sections.find(s => s.type === 'list' && s.title === 'CALLBACKS DUE')
  if (callbacks?.type === 'list' && callbacks.items[0]) {
    const item = callbacks.items[0]
    return item.sub ? `Callback due — ${item.text} (${item.sub})` : `Callback due — ${item.text}`
  }
  const stats = firstOfType(sections, 'stats')
  const booked = stats?.rows.find(r => r.label === 'Meetings booked')
  if (booked && Number(booked.value) > 0) return `${booked.value} meeting${booked.value === '1' ? '' : 's'} booked this week`
  return null
}

async function linkedinPreview(): Promise<string | null> {
  const sections = await linkedinSections()
  const tracker = firstOfType(sections, 'stats')
  if (!tracker) return null
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const today = DAYS[new Date().getDay()]
  const todayRow = tracker.rows.find(r => r.label === today)
  if (todayRow && todayRow.value !== '—') return `${today}: ${todayRow.value}`
  return null
}

async function practicePreview(): Promise<string | null> {
  const sections = await practiceSections()
  const weak = sections.find(s => s.type === 'tags' && s.title === 'WEAK POINTS')
  if (weak?.type === 'tags' && weak.tags[0]) return `Weak point: ${weak.tags[0].text}`
  const lastSession = sections.find(s => s.type === 'list' && s.title === 'LAST SESSION')
  if (lastSession?.type === 'list' && lastSession.items[0]) return lastSession.items[0].text
  return null
}

async function studyPreview(): Promise<string | null> {
  const sections = await studySections()
  const progress = sections.find(s => s.type === 'stats' && s.title === 'PROGRESS')
  if (progress?.type !== 'stats') return null
  const due = progress.rows.find(r => r.label === 'Cards due today')
  if (!due || due.value === '0') return null
  return `${due.value} card${due.value === '1' ? '' : 's'} due today`
}

async function prospectsPreview(): Promise<string | null> {
  const stats = await getStats()
  return `${stats.total} total · ${stats.unwashed} unwashed`
}

const BUILDERS: Partial<Record<ConversationAgent, () => Promise<string | null>>> = {
  hub: hubPreview,
  news: newsPreview,
  calls: callsPreview,
  linkedin: linkedinPreview,
  practice: practicePreview,
  study: studyPreview,
  prospects: prospectsPreview,
}

export async function buildRailPreviews(): Promise<Partial<Record<ConversationAgent, string>>> {
  const entries = await Promise.all(
    (Object.entries(BUILDERS) as [ConversationAgent, () => Promise<string | null>][]).map(async ([id, build]) => {
      try {
        return [id, await build()] as const
      } catch (err) {
        console.error(`[hub-rail-preview] ${id} failed:`, err)
        return [id, null] as const
      }
    }),
  )

  const result: Partial<Record<ConversationAgent, string>> = {}
  for (const [id, preview] of entries) {
    if (preview) result[id] = preview
  }
  return result
}
