// Static agent-rail metadata for the new three-column dashboard shell.
// Preview text/time are placeholders matching the reference design — wiring
// these to live per-agent signals is part of the "next phase" work described
// in the build spec (agent-specific conversation logic).

export type ConversationAgent =
  | 'hub' | 'news' | 'calls' | 'linkedin' | 'social'
  | 'practice' | 'outreach' | 'study' | 'prospects'

export interface HubAgentMeta {
  id: ConversationAgent
  name: string
  role: string
  contextTitle: string
  time: string
  preview: string
  dotOn: boolean
  icon: string   // single emoji — shown alone in the collapsed rail strip
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
  social: '/dashboard/social',
  outreach: '/dashboard/mercury',
}

export const HUB_AGENTS: HubAgentMeta[] = [
  { id: 'hub', name: 'MAIA', role: 'Orchestrator', contextTitle: 'MAIA HUB', time: 'now', preview: "Good morning. Today's angle ready →", dotOn: true, icon: '🏠' },
  { id: 'news', name: 'News', role: 'Financial Intelligence', contextTitle: 'NEWS', time: '8:02', preview: 'UK pension IHT confirmed Apr 2027', dotOn: true, icon: '📰' },
  { id: 'calls', name: 'Calls', role: 'Transcription & Coaching', contextTitle: 'CALLS', time: '17:34', preview: 'CRM notes ready — John S. booked', dotOn: true, icon: '📞' },
  { id: 'practice', name: 'Practice', role: 'Full Call Drills', contextTitle: 'PRACTICE', time: 'yesterday', preview: 'Weak point today: opener resistance', dotOn: false, icon: '🎯' },
  { id: 'linkedin', name: 'LinkedIn', role: 'Posts & Conversations', contextTitle: 'LINKEDIN', time: '8:05', preview: 'Draft ready — IHT pension angle', dotOn: true, icon: '💼' },
  { id: 'social', name: 'Instagram & Facebook', role: 'Managed autonomously', contextTitle: 'INSTAGRAM & FACEBOOK', time: '8:10', preview: '2 posts scheduled · 3 comments to approve', dotOn: true, icon: '📱' },
  { id: 'outreach', name: 'Outreach', role: 'Email Sequences', contextTitle: 'OUTREACH', time: '9:15', preview: 'Sarah M. — email 3 due today', dotOn: true, icon: '✉️' },
  { id: 'study', name: 'Study', role: 'CII & Products', contextTitle: 'STUDY', time: '8:00', preview: '5 cards due — R01 Financial Crime', dotOn: true, icon: '📚' },
  { id: 'prospects', name: 'Prospects', role: 'NEXUS · List Management', contextTitle: 'PROSPECTS', time: 'yesterday', preview: '307 total · 23 unwashed', dotOn: false, icon: '📋' },
]
