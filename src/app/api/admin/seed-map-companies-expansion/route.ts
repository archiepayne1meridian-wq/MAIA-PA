import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { findCompanyId, getCompanyNameToIdMap, addCompany, type NewCompanyInput } from '../../../../../tools/map-db'

// POST /api/admin/seed-map-companies-expansion — one-off web-search
// enrichment pass, run once after deploy. Bearer auth via MAIA_API_KEY.
// Temporary — delete this route once run against production and confirmed,
// per the standing "temporary admin routes, deleted after use" rule.
//
// The existing 361-row map_companies seed already covers the large majority
// of Greater Geneva / Lake Léman employers across the requested sectors
// (finance, commodities, pharma, tech, FMCG, medtech, luxury, logistics,
// professional services, international orgs, law firms). A broad web
// search for further additions mostly surfaced company-registry directory
// noise with no verifiable headcount or address — rather than fabricate
// coordinates/employee estimates for those, this is a short, high-
// confidence list of specific well-known 50+-employee Greater Geneva
// employers confirmed missing from the existing set, notably UBS (already
// on Archie's own News-agent Swiss-restructuring watchlist in CLAUDE.md).
const EXPANSION: NewCompanyInput[] = [
  {
    name: 'UBS Geneva', type: 'company', sector: 'Private Banking', employees_est: 800,
    lat: 46.2048, lng: 6.1455, area: 'Centre-Ville', office_type: 'regional', prospect_priority: 'normal',
    aliases: ['UBS'],
  },
  {
    name: 'J. Safra Sarasin', type: 'company', sector: 'Private Banking', employees_est: 900,
    lat: 46.2030, lng: 6.1450, area: 'Centre-Ville', office_type: 'hq', prospect_priority: 'normal',
    aliases: ['Bank J. Safra Sarasin', 'Safra Sarasin'],
  },
  {
    name: 'HSBC Private Bank (Suisse) SA', type: 'company', sector: 'Private Banking', employees_est: 400,
    lat: 46.2065, lng: 6.1435, area: 'Centre-Ville', office_type: 'regional', prospect_priority: 'normal',
    aliases: ['HSBC Private Bank', 'HSBC Geneva'],
  },
  {
    name: 'CA Indosuez (Switzerland) SA', type: 'company', sector: 'Private Banking', employees_est: 500,
    lat: 46.2020, lng: 6.1480, area: 'Centre-Ville', office_type: 'hq', prospect_priority: 'normal',
    aliases: ['CA Indosuez', 'Credit Agricole Indosuez Geneva'],
  },
  {
    name: 'Transocean Geneva', type: 'company', sector: 'Energy', employees_est: 200,
    lat: 46.2180, lng: 6.0950, area: 'Vernier', office_type: 'office', prospect_priority: 'normal',
    aliases: ['Transocean Ltd', 'Transocean'],
  },
  {
    name: 'Komgo', type: 'company', sector: 'Fintech', employees_est: 75,
    lat: 46.2040, lng: 6.1440, area: 'Centre-Ville', office_type: 'hq', prospect_priority: 'normal',
    aliases: ['Komgo SA'],
  },
]

function checkAuth(request: Request): boolean {
  const authHeader = request.headers.get('Authorization') ?? ''
  const apiKey = env.MAIA_API_KEY()
  if (!apiKey) return false
  const expected = `Bearer ${apiKey}`
  try {
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(authHeader.padEnd(expected.length, '\0').slice(0, expected.length), 'utf8')
    return authHeader.length === expected.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!checkAuth(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const nameToId = await getCompanyNameToIdMap()
  let added = 0
  const skipped: string[] = []

  for (const company of EXPANSION) {
    if (findCompanyId(company.name, nameToId) !== undefined) {
      skipped.push(company.name)
      continue
    }
    await addCompany(company)
    added++
  }

  return Response.json({ added, skipped })
}
