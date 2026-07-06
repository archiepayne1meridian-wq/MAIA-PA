// MUSE — Second Brain. All Claude-dependent functions throw until Step 3+.

export interface MuseAssessment {
  sector: string
  depth: 'simple' | 'medium' | 'detailed'
  title: string
  summary: string
  content: string
  links: string[]
  isDuplicate: boolean
  duplicateId?: string
  isLowValue: boolean
  lowValueReason?: string
}

export async function assessValue(
  _content: string,
  _existingTitles: { id: string; title: string; sector: string }[],
  _sectorHint?: string,
): Promise<MuseAssessment> {
  throw new Error('[muse] assessValue not yet wired — awaiting Step 3')
}

export async function processInput(
  _content: string,
  _type: 'file' | 'brain_dump',
  _sectorHint?: string,
): Promise<{ pendingIds: string[] }> {
  throw new Error('[muse] processInput not yet wired — awaiting Step 3')
}

export async function generateBrief(
  _assessment: MuseAssessment,
  _source: string,
): Promise<string> {
  throw new Error('[muse] generateBrief not yet wired — awaiting Step 3')
}

export async function searchKnowledge(
  _query: string,
  _sector?: string,
): Promise<{
  results: {
    id: string
    title: string
    sector: string
    summary: string
    date_filed: number
    last_updated: number
  }[]
}> {
  throw new Error('[muse] searchKnowledge not yet wired — awaiting Step 4')
}

export async function checkDuplicate(
  _title: string,
  _content: string,
): Promise<{ isDuplicate: boolean; matchId?: string; matchTitle?: string }> {
  throw new Error('[muse] checkDuplicate not yet wired — awaiting Step 3')
}

export async function extractLinks(
  _content: string,
  _existingTitles: { id: string; title: string; sector: string }[],
): Promise<string[]> {
  throw new Error('[muse] extractLinks not yet wired — awaiting Step 3')
}
