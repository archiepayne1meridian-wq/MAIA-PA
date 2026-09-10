// HERMES — database CRUD for the scenario bank, plus today's CASSANDRA call
// angle lookup and scenario matching. Pure data access, no Claude calls.

import { getDb } from '@/db'
import { hermes_scenarios, research_briefs } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import type { ObjectionPair } from '@/lib/hermes-scenarios-data'

export interface HermesScenario {
  id: string
  name: string
  angle: string | null
  opener: string
  fact_find_questions: string[]
  enlarge_points: string[]
  disturb_points: string[]
  product_pathway: string
  product_questions: string[]
  close_script: string
  soft_landing: string
  objections: ObjectionPair[]
  active: boolean
  created_at: number
  updated_at: number
}

interface ScenarioRow {
  id: string
  name: string
  angle: string | null
  opener: string
  fact_find_questions: string
  enlarge_points: string
  disturb_points: string
  product_pathway: string
  product_questions: string
  close_script: string
  soft_landing: string
  objections: string
  active: number
  created_at: number
  updated_at: number
}

function parseJsonArray<T>(json: string): T[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

function rowToScenario(row: ScenarioRow): HermesScenario {
  return {
    id: row.id,
    name: row.name,
    angle: row.angle,
    opener: row.opener,
    fact_find_questions: parseJsonArray<string>(row.fact_find_questions),
    enlarge_points: parseJsonArray<string>(row.enlarge_points),
    disturb_points: parseJsonArray<string>(row.disturb_points),
    product_pathway: row.product_pathway,
    product_questions: parseJsonArray<string>(row.product_questions),
    close_script: row.close_script,
    soft_landing: row.soft_landing,
    objections: parseJsonArray<ObjectionPair>(row.objections),
    active: row.active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function listScenarios(): Promise<HermesScenario[]> {
  const rows = await getDb().select().from(hermes_scenarios).orderBy(hermes_scenarios.created_at)
  return rows.map(rowToScenario)
}

export async function getScenario(id: string): Promise<HermesScenario | null> {
  const [row] = await getDb().select().from(hermes_scenarios).where(eq(hermes_scenarios.id, id)).limit(1)
  return row ? rowToScenario(row) : null
}

export interface ScenarioInput {
  name: string
  angle?: string | null
  opener: string
  fact_find_questions: string[]
  enlarge_points: string[]
  disturb_points: string[]
  product_pathway: string
  product_questions: string[]
  close_script: string
  soft_landing: string
  objections: ObjectionPair[]
}

export async function createScenario(input: ScenarioInput): Promise<HermesScenario> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await getDb().insert(hermes_scenarios).values({
    id,
    name: input.name,
    angle: input.angle ?? null,
    opener: input.opener,
    fact_find_questions: JSON.stringify(input.fact_find_questions),
    enlarge_points: JSON.stringify(input.enlarge_points),
    disturb_points: JSON.stringify(input.disturb_points),
    product_pathway: input.product_pathway,
    product_questions: JSON.stringify(input.product_questions),
    close_script: input.close_script,
    soft_landing: input.soft_landing,
    objections: JSON.stringify(input.objections),
    active: 1,
    created_at: now,
    updated_at: now,
  })
  const created = await getScenario(id)
  if (!created) throw new Error('Failed to read back created scenario')
  return created
}

// Partial update — only fields present in `patch` are changed. Array/object
// fields are JSON-stringified; everything else is passed through.
export async function updateScenario(id: string, patch: Partial<ScenarioInput>): Promise<HermesScenario | null> {
  const existing = await getScenario(id)
  if (!existing) return null

  const set: Record<string, unknown> = { updated_at: Math.floor(Date.now() / 1000) }
  if (patch.name !== undefined) set.name = patch.name
  if (patch.angle !== undefined) set.angle = patch.angle
  if (patch.opener !== undefined) set.opener = patch.opener
  if (patch.fact_find_questions !== undefined) set.fact_find_questions = JSON.stringify(patch.fact_find_questions)
  if (patch.enlarge_points !== undefined) set.enlarge_points = JSON.stringify(patch.enlarge_points)
  if (patch.disturb_points !== undefined) set.disturb_points = JSON.stringify(patch.disturb_points)
  if (patch.product_pathway !== undefined) set.product_pathway = patch.product_pathway
  if (patch.product_questions !== undefined) set.product_questions = JSON.stringify(patch.product_questions)
  if (patch.close_script !== undefined) set.close_script = patch.close_script
  if (patch.soft_landing !== undefined) set.soft_landing = patch.soft_landing
  if (patch.objections !== undefined) set.objections = JSON.stringify(patch.objections)

  await getDb().update(hermes_scenarios).set(set).where(eq(hermes_scenarios.id, id))
  return getScenario(id)
}

export async function deleteScenario(id: string): Promise<void> {
  await getDb().delete(hermes_scenarios).where(eq(hermes_scenarios.id, id))
}

// ── Today's CASSANDRA call angle ────────────────────────────────────────────
// research_briefs has no dedicated action_angles column — cassandra.ts's
// generateActionAngles embeds "Call angle: ...", "Post idea: ...",
// "Knowledge: ..." lines into the free-text `summary` field under a "Today's
// Angle" header (see CassandraWorkspace.tsx's parseActionAngles, which this
// mirrors). We only want the call-angle lines here — HERMES cares about a
// reason to call, not post ideas or knowledge notes.
export async function getTodayCallAngle(): Promise<string | null> {
  const [row] = await getDb()
    .select({ summary: research_briefs.summary })
    .from(research_briefs)
    .orderBy(desc(research_briefs.created_at))
    .limit(1)

  if (!row?.summary) return null

  for (const rawLine of row.summary.split('\n')) {
    const line = rawLine.trim()
    if (/^call angle:/i.test(line)) {
      return line.replace(/^call angle:\s*/i, '').trim()
    }
  }
  return null
}

// Best-effort keyword overlap between today's call angle text and each
// scenario's `angle` field (a short comma-separated phrase list — see
// hermes-scenarios-data.ts). Returns the first scenario with any keyword hit,
// or null if nothing matches (including when scenario.angle is null, e.g.
// "Second Door" and the 4 migrated legacy personas, which are never
// news-triggered). Deliberately simple substring matching, not fuzzy/LLM —
// this only drives a UI highlight, not anything that needs to be exact.
export function matchScenarioToAngle(scenarios: HermesScenario[], angleText: string | null): string | null {
  if (!angleText) return null
  const lowerAngle = angleText.toLowerCase()
  for (const scenario of scenarios) {
    if (!scenario.angle) continue
    const keywords = scenario.angle.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
    if (keywords.some(k => lowerAngle.includes(k))) return scenario.id
  }
  return null
}

// Best-effort company-name extraction for the Restructuring scenario's
// opener, which contains a "[at company name / in your sector]" placeholder.
// Looks for a capitalised word (or short run of them) immediately preceding
// one of the trigger phrases. Returns null if nothing confident is found —
// callers must leave the placeholder as-is rather than guess.
export function extractCompanyName(angleText: string): string | null {
  const match = angleText.match(/([A-Z][A-Za-z0-9&.]*(?:\s+[A-Z][A-Za-z0-9&.]*){0,2})\s+(?:job cuts|layoffs|redundanc\w*|restructur\w*)/)
  return match ? match[1].trim() : null
}
