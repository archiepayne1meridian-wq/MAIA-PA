// Static agent-rail metadata for the new three-column dashboard shell.
// `preview` below is the FALLBACK shown until the live preview fetch
// resolves (AgentRailNew.tsx calls GET /api/dashboard/hub-rail-previews,
// see src/lib/hub-rail-preview.ts) and the permanent value for the agents
// with no backing data yet (outreach, map, meetings) — see that file's
// header comment for which agents have a live source and which don't.
// `time` stays static for every agent; the live tier only replaces `preview`.
//
// Instagram & Facebook ('social') removed from the UI/nav — its data
// (social_posts table, SocialWorkspace.tsx, API routes) is left intact in
// case it's re-added later; only the nav entry points were removed.

export type ConversationAgent =
  | 'hub' | 'news' | 'calls' | 'linkedin'
  | 'practice' | 'outreach' | 'study' | 'prospects' | 'map' | 'meetings'

export interface HubAgentMeta {
  id: ConversationAgent
  name: string
  role: string
  contextTitle: string
  time: string
  preview: string
  dotOn: boolean
  icon: string   // single emoji, shown next to the agent name
}

// Agents with their own dedicated full-page workspace — selecting one of
// these (from the hub rail, or from another full-page agent's own rail)
// navigates straight there rather than opening the generic hub chat tile.
export const AGENT_WORKSPACE_ROUTE: Partial<Record<ConversationAgent, string>> = {
  prospects: '/dashboard/nexus',
  calls: '/dashboard/apollo',
  linkedin: '/dashboard/iris',
  practice: '/dashboard/diana',
  study: '/dashboard/athena',
  outreach: '/dashboard/mercury',
  map: '/dashboard/map',
  meetings: '/dashboard/meetings',
}

export const HUB_AGENTS: HubAgentMeta[] = [
  { id: 'hub', name: 'MAIA', role: 'Orchestrator', contextTitle: 'MAIA HUB', time: 'now', preview: "Good morning. Today's angle ready →", dotOn: true, icon: '🏠' },
  { id: 'news', name: 'News', role: 'Financial Intelligence', contextTitle: 'NEWS', time: '8:02', preview: 'UK pension IHT confirmed Apr 2027', dotOn: true, icon: '📰' },
  { id: 'calls', name: 'Calls', role: 'Transcription & Coaching', contextTitle: 'CALLS', time: '17:34', preview: 'CRM notes ready — John S. booked', dotOn: true, icon: '📞' },
  { id: 'practice', name: 'Practice', role: 'Full Call Drills', contextTitle: 'PRACTICE', time: 'yesterday', preview: 'Weak point today: opener resistance', dotOn: false, icon: '🎯' },
  { id: 'linkedin', name: 'LinkedIn', role: 'Posts & Conversations', contextTitle: 'LINKEDIN', time: '8:05', preview: 'Draft ready — IHT pension angle', dotOn: true, icon: '💼' },
  { id: 'outreach', name: 'Outreach', role: 'Email Sequences', contextTitle: 'OUTREACH', time: '9:15', preview: 'Sarah M. — email 3 due today', dotOn: true, icon: '✉️' },
  { id: 'study', name: 'Study', role: 'CII & Products', contextTitle: 'STUDY', time: '8:00', preview: '5 cards due — R01 Financial Crime', dotOn: true, icon: '📚' },
  { id: 'prospects', name: 'Prospects', role: 'NEXUS · List Management', contextTitle: 'PROSPECTS', time: 'yesterday', preview: '307 total · 23 unwashed', dotOn: false, icon: '📋' },
  { id: 'map', name: 'Map', role: 'Territory Intelligence', contextTitle: 'MAP', time: 'today', preview: 'Greater Geneva · live prospect overlay', dotOn: false, icon: '🗺️' },
  { id: 'meetings', name: 'Meetings', role: 'Meeting Summaries', contextTitle: 'MEETINGS', time: 'today', preview: 'Drop a voice note to debrief', dotOn: false, icon: '🗓️' },
]
