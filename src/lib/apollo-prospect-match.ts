// APOLLO — suggests which NEXUS prospect a booked call's extracted name
// refers to. Never auto-links — always returns candidates for Archie to
// confirm with one click, even on a confident rule-based match (updating a
// shared prospect record silently isn't something this app does anywhere
// else either — see Nexus/Meetings' identical save-to-CRM pattern).

import { findProspectMatch, aiMatchNames } from './nexus'
import { getAllNamesLower } from '../../tools/nexus-db'

export interface ProspectMatchCandidate { id: string; name: string; company: string | null }

// useAi defaults true — the one-time call right after /analyse wants the
// full treatment (rule match, then the AI fallback, then substring
// candidates). The call-list route recomputes this on every page load for
// any still-unresolved booked call, which would otherwise mean a real
// Claude call on every single refresh for the same unresolved name — that
// path passes useAi:false and accepts the (free) rule-match-or-substring-
// candidates result instead.
export async function suggestProspectMatches(name: string | null, useAi = true): Promise<ProspectMatchCandidate[]> {
  if (!name?.trim()) return []
  const existing = await getAllNamesLower()

  const ruleMatch = findProspectMatch(name, existing)
  if (ruleMatch) return [{ id: ruleMatch.id, name: ruleMatch.name, company: ruleMatch.company }]

  if (useAi) {
    const [aiResult] = await aiMatchNames([name], existing).catch(() => [])
    if (aiResult?.prospectId) {
      const match = existing.find(p => p.id === aiResult.prospectId)
      if (match) return [{ id: match.id, name: match.name, company: match.company }]
    }
  }

  const tokens = name.toLowerCase().split(/\s+/).filter(Boolean)
  return existing
    .filter(p => tokens.some(t => p.firstLower.includes(t) || p.lastLower.includes(t)))
    .slice(0, 8)
    .map(p => ({ id: p.id, name: p.name, company: p.company }))
}
