// Static agent-rail metadata for the new three-column dashboard shell.
// Preview text/time are placeholders matching the reference design — wiring
// these to live per-agent signals is part of the "next phase" work described
// in the build spec (agent-specific conversation logic).

export type ConversationAgent =
  | 'hub' | 'news' | 'calls' | 'linkedin' | 'social'
  | 'practice' | 'outreach' | 'study' | 'prospects' | 'pipeline'

export interface HubAgentMeta {
  id: ConversationAgent
  name: string
  role: string
  contextTitle: string
  time: string
  preview: string
  dotOn: boolean
}

export const HUB_AGENTS: HubAgentMeta[] = [
  { id: 'hub', name: 'MAIA', role: 'Orchestrator', contextTitle: 'MAIA HUB', time: 'now', preview: "Good morning. Today's angle ready →", dotOn: true },
  { id: 'news', name: 'News', role: 'Financial Intelligence', contextTitle: 'NEWS', time: '8:02', preview: 'UK pension IHT confirmed Apr 2027', dotOn: true },
  { id: 'calls', name: 'Calls', role: 'Transcription & Coaching', contextTitle: 'CALLS', time: '17:34', preview: 'CRM notes ready — John S. booked', dotOn: true },
  { id: 'practice', name: 'Practice', role: 'Full Call Drills', contextTitle: 'PRACTICE', time: 'yesterday', preview: 'Weak point today: opener resistance', dotOn: false },
  { id: 'linkedin', name: 'LinkedIn', role: 'Posts & Conversations', contextTitle: 'LINKEDIN', time: '8:05', preview: 'Draft ready — IHT pension angle', dotOn: true },
  { id: 'social', name: 'Instagram & Facebook', role: 'Managed autonomously', contextTitle: 'INSTAGRAM & FACEBOOK', time: '8:10', preview: '2 posts scheduled · 3 comments to approve', dotOn: true },
  { id: 'outreach', name: 'Outreach', role: 'Email Sequences', contextTitle: 'OUTREACH', time: '9:15', preview: 'Sarah M. — email 3 due today', dotOn: true },
  { id: 'study', name: 'Study', role: 'CII & Products', contextTitle: 'STUDY', time: '8:00', preview: '5 cards due — R01 Financial Crime', dotOn: true },
  { id: 'prospects', name: 'Prospects', role: 'NEXUS · List Management', contextTitle: 'PROSPECTS', time: 'yesterday', preview: '307 total · 23 unwashed', dotOn: false },
  { id: 'pipeline', name: 'Pipeline', role: 'With Steven', contextTitle: 'PIPELINE', time: 'Mon', preview: '3 meetings this week · 1 sat', dotOn: false },
]
