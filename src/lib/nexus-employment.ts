// NEXUS — AI employment-type inference (Claude calls only; DB access lives
// in tools/nexus-db.ts). Classifies a prospect's seniority tier from their
// job title alone — cheap, high-volume, same model-choice logic as
// CASSANDRA's bulk relevance filter.

import { askWith } from './claude'

const HAIKU = 'claude-haiku-4-5-20251001'

export type EmploymentType = 'Managing Director' | 'Director' | 'Employee' | 'Self-Employed'

const VALID_TYPES: EmploymentType[] = ['Managing Director', 'Director', 'Employee', 'Self-Employed']

const CLASSIFY_SYSTEM = `Classify the employment type of someone with this job title.
Return exactly one of: Managing Director, Director, Employee, Self-Employed
Rules:
- Managing Director: MD, CEO, Founder, Owner, Principal, Partner (law/consulting)
- Director: any Director title, VP, Head of, C-suite (CFO, CTO etc)
- Self-Employed: Consultant, Freelance, Independent, self-employed in title
- Employee: everyone else
Return only the classification, nothing else.`

export async function inferEmploymentType(jobTitle: string): Promise<EmploymentType> {
  const raw = await askWith(CLASSIFY_SYSTEM, `Job title: "${jobTitle}"`, 20, HAIKU)
  const trimmed = raw.trim()
  return VALID_TYPES.includes(trimmed as EmploymentType) ? (trimmed as EmploymentType) : 'Employee'
}
