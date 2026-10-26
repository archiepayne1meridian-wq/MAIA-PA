// NEXUS — employment-type classification. Pure, deterministic, synchronous —
// no Claude call. The rules below are explicit substring triggers (not open-
// ended semantic judgment), so a model call would add latency and cost for
// zero benefit over plain string matching; this also makes backfilling
// hundreds of prospects instant instead of a rate-limited batch job.

export type EmploymentType = 'Controlling Director' | 'Director' | 'Employee' | 'Self-Employed'

export const EMPLOYMENT_TYPES: EmploymentType[] = ['Controlling Director', 'Director', 'Employee', 'Self-Employed']

// 'chief executive officer' is listed here, not just the 'ceo' abbreviation
// — without it, a spelled-out "Chief Executive Officer" title would match
// DIRECTOR_WORDS' generic 'chief' trigger (meant for the other, genuinely
// Director-tier C-suite roles) before ever reaching the 'ceo' check below,
// since 'chief' and 'ceo' are substrings of two different spellings of the
// same role.
const CONTROLLING_DIRECTOR_WORDS = ['founder', 'owner', 'ceo', 'chief executive officer', 'md', 'managing director', 'principal', 'partner']
const DIRECTOR_WORDS = ['director', 'vp', 'vice president', 'head of', 'chief', 'cfo', 'cto', 'coo', 'cmo']
const SELF_EMPLOYED_WORDS = ['consultant', 'freelance', 'independent', 'self-employed', 'self employed']

function containsAny(haystack: string, words: string[]): boolean {
  return words.some(w => haystack.includes(w))
}

// Priority order per spec:
// 1. No company set -> Self-Employed (no company = likely independent)
// 2. Controlling Director keywords
// 3. Director keywords
// 4. Self-employed keywords (job title explicitly says so, despite having a company)
// 5. Everything else, or no job title -> Employee
export function inferEmploymentType(jobTitle: string | null, company: string | null): EmploymentType {
  const hasCompany = Boolean(company?.trim())
  if (!hasCompany) return 'Self-Employed'

  const title = (jobTitle ?? '').toLowerCase().trim()
  if (!title) return 'Employee'

  if (containsAny(title, CONTROLLING_DIRECTOR_WORDS)) return 'Controlling Director'
  if (containsAny(title, DIRECTOR_WORDS)) return 'Director'
  if (containsAny(title, SELF_EMPLOYED_WORDS)) return 'Self-Employed'
  return 'Employee'
}
