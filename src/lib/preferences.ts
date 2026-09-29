// MAIA preferences layer — confirmed rules that get injected into every agent's
// system prompt, plus a lightweight rejection-pattern tracker that proposes new
// rules after repeated dismissals rather than acting on a single one.

import { getDb } from '@/db'
import { maia_preferences, maia_preference_proposals } from '@/db/schema'
import { and, eq, or, sql } from 'drizzle-orm'

export type PreferenceCategory = 'cassandra' | 'iris' | 'diana' | 'hermes' | 'general' | 'all'
export type RuleType = 'exclude' | 'include' | 'style' | 'behaviour'

export interface Preference {
  id: string
  category: string
  rule_type: string
  rule_key: string
  rule_value: string
  confirmed: number
  source: string
  times_applied: number
  created_at: number
  updated_at: number
}

export interface PreferenceProposal {
  id: string
  rule_key: string
  rule_value: string
  category: string
  reason: string | null
  rejection_count: number
  status: string
  created_at: number
}

// ─── Reader — confirmed preferences for a category (+ any category='all' rows) ─

export async function getPreferences(category: PreferenceCategory): Promise<Preference[]> {
  const rows = await getDb()
    .select()
    .from(maia_preferences)
    .where(
      and(
        eq(maia_preferences.confirmed, 1),
        or(
          eq(maia_preferences.category, category),
          eq(maia_preferences.category, 'all'),
        ),
      ),
    )
    .orderBy(maia_preferences.category, maia_preferences.rule_type)

  return rows as Preference[]
}

export function formatPreferencesForPrompt(prefs: Preference[]): string {
  if (prefs.length === 0) return ''

  const exclusions = prefs.filter(p => p.rule_type === 'exclude').map(p => `- ${p.rule_value}`)
  const inclusions = prefs.filter(p => p.rule_type === 'include').map(p => `- ${p.rule_value}`)
  const styles = prefs.filter(p => p.rule_type === 'style').map(p => `- ${p.rule_value}`)
  const behaviours = prefs.filter(p => p.rule_type === 'behaviour').map(p => `- ${p.rule_value}`)

  let output = "ARCHIE'S CONFIRMED PREFERENCES (apply these always):\n"
  if (exclusions.length) output += `\nNEVER DO:\n${exclusions.join('\n')}`
  if (inclusions.length) output += `\nALWAYS INCLUDE:\n${inclusions.join('\n')}`
  if (styles.length) output += `\nSTYLE RULES:\n${styles.join('\n')}`
  if (behaviours.length) output += `\nBEHAVIOUR RULES:\n${behaviours.join('\n')}`

  return output
}

export async function incrementTimesApplied(preferenceIds: string[]): Promise<void> {
  for (const id of preferenceIds) {
    await getDb().update(maia_preferences)
      .set({ times_applied: sql`times_applied + 1` })
      .where(eq(maia_preferences.id, id))
  }
}

// ─── CRUD — backs the dashboard's preferences page ─────────────────────────────

export async function getAllPreferences(): Promise<Preference[]> {
  const rows = await getDb().select().from(maia_preferences).orderBy(maia_preferences.category, maia_preferences.rule_type)
  return rows as Preference[]
}

export async function addPreference(input: {
  category: string
  rule_type: RuleType
  rule_key: string
  rule_value: string
  source?: string
}): Promise<string> {
  const id = crypto.randomUUID()
  await getDb().insert(maia_preferences).values({
    id,
    category: input.category,
    rule_type: input.rule_type,
    rule_key: input.rule_key,
    rule_value: input.rule_value,
    confirmed: 1,
    source: input.source ?? 'manual',
  })
  return id
}

export async function updatePreferenceValue(id: string, rule_value: string): Promise<void> {
  await getDb().update(maia_preferences)
    .set({ rule_value, updated_at: sql`(unixepoch())` })
    .where(eq(maia_preferences.id, id))
}

export async function deletePreference(id: string): Promise<void> {
  await getDb().delete(maia_preferences).where(eq(maia_preferences.id, id))
}

// ─── Proposals — surfaced pattern-detection candidates ────────────────────────

export async function getPendingProposals(): Promise<PreferenceProposal[]> {
  const rows = await getDb().select().from(maia_preference_proposals)
    .where(eq(maia_preference_proposals.status, 'pending'))
    .orderBy(maia_preference_proposals.created_at)
  return rows as PreferenceProposal[]
}

// Confirming a proposal promotes it to a real, confirmed preference and marks
// the proposal row so it's never surfaced again.
export async function confirmProposal(proposalId: string): Promise<string | null> {
  const db = getDb()
  const [proposal] = await db.select().from(maia_preference_proposals).where(eq(maia_preference_proposals.id, proposalId)).limit(1)
  if (!proposal) return null

  const newId = await addPreference({
    category: proposal.category,
    rule_type: 'exclude',
    rule_key: proposal.rule_key,
    rule_value: proposal.rule_value,
    source: 'suggested',
  })
  await db.update(maia_preference_proposals).set({ status: 'confirmed' }).where(eq(maia_preference_proposals.id, proposalId))
  return newId
}

export async function declineProposal(proposalId: string): Promise<void> {
  await getDb().update(maia_preference_proposals).set({ status: 'declined' }).where(eq(maia_preference_proposals.id, proposalId))
}

// ─── Pattern detection ──────────────────────────────────────────────────────
// Tracks a rejection of a given content type (ruleKey). After the SAME pending
// proposal has been rejected 3+ times, it's ready to surface to the user as a
// proposal — the dashboard reads it via getPendingProposals() above. Declined
// proposals are never reconsidered: a fresh trackRejection() call always looks
// for a 'pending' row only, so a declined pattern starting over requires the
// same rule_key to accumulate 3 fresh rejections as an entirely new row (the
// old declined row is left alone, not reused) — the simplest way to honour
// "declined → never proposed again" for that exact prior decision while still
// letting a genuinely different rejection streak start its own count.
export async function trackRejection(
  ruleKey: string,
  category: string,
  reason: string,
): Promise<{ shouldPropose: boolean; proposal?: PreferenceProposal }> {
  const db = getDb()
  const existing = await db.select().from(maia_preference_proposals)
    .where(and(eq(maia_preference_proposals.rule_key, ruleKey), eq(maia_preference_proposals.status, 'pending')))
    .limit(1)

  if (existing[0]) {
    const newCount = (existing[0].rejection_count || 0) + 1
    await db.update(maia_preference_proposals)
      .set({ rejection_count: newCount })
      .where(eq(maia_preference_proposals.id, existing[0].id))

    if (newCount >= 3) {
      return { shouldPropose: true, proposal: { ...existing[0], rejection_count: newCount } as PreferenceProposal }
    }
  } else {
    await db.insert(maia_preference_proposals).values({
      id: crypto.randomUUID(),
      rule_key: ruleKey,
      rule_value: reason,
      category,
      reason: `Rejected ${ruleKey} content 3+ times`,
      rejection_count: 1,
      status: 'pending',
    })
  }

  return { shouldPropose: false }
}
