// Pure DB functions for ORACLE's pension-estimate history. No Claude calls.

import { desc, eq } from 'drizzle-orm'
import { getDb } from '@/db'
import { oracle_analyses } from '@/db/schema'
import type { OracleAnalysis } from '../src/lib/oracle'

export interface OracleAnalysisRow {
  id: string
  prospect_name: string | null
  current_employer: string | null
  current_role: string | null
  current_location: string | null
  raw_linkedin_text: string | null
  analysis_json: string
  muse_case_id: string | null
  created_at: number
}

export async function saveAnalysis(data: {
  raw_linkedin_text: string
  analysis: OracleAnalysis
  muse_case_id: string | null
}): Promise<string> {
  const id = crypto.randomUUID()
  await getDb().insert(oracle_analyses).values({
    id,
    prospect_name: data.analysis.prospect.name,
    current_employer: data.analysis.prospect.current_employer,
    current_role: data.analysis.prospect.current_role,
    current_location: data.analysis.prospect.current_location,
    raw_linkedin_text: data.raw_linkedin_text,
    analysis_json: JSON.stringify(data.analysis),
    muse_case_id: data.muse_case_id,
  })
  return id
}

// Recent analyses — includes analysis_json (the list view needs it for pension
// totals + top flag chip) but deliberately excludes raw_linkedin_text, the Tier 2
// original paste, which is never needed outside the single analysis detail view.
export async function getRecentAnalyses(limit = 20): Promise<Omit<OracleAnalysisRow, 'raw_linkedin_text'>[]> {
  const rows = await getDb()
    .select({
      id: oracle_analyses.id,
      prospect_name: oracle_analyses.prospect_name,
      current_employer: oracle_analyses.current_employer,
      current_role: oracle_analyses.current_role,
      current_location: oracle_analyses.current_location,
      analysis_json: oracle_analyses.analysis_json,
      muse_case_id: oracle_analyses.muse_case_id,
      created_at: oracle_analyses.created_at,
    })
    .from(oracle_analyses)
    .orderBy(desc(oracle_analyses.created_at))
    .limit(limit)
  return rows
}

export async function getAnalysis(id: string): Promise<OracleAnalysisRow | null> {
  const rows = await getDb().select().from(oracle_analyses).where(eq(oracle_analyses.id, id)).limit(1)
  return (rows[0] as OracleAnalysisRow) ?? null
}
