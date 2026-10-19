// POST /api/admin/map-seed — one-time seed for map_companies (Greater Geneva
// + Lake Léman territory). Bearer auth via MAIA_API_KEY. Temporary — delete
// this route once run against production and confirmed, per the standing
// "temporary admin routes, deleted after use" rule.
//
// Idempotent: skips any company whose name already exists (case-insensitive)
// rather than duplicating it, so a re-run after a partial failure is safe.

import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { getDb } from '@/db'
import { map_companies } from '@/db/schema'
import { sql } from 'drizzle-orm'
import { addCompany, type NewCompanyInput } from '../../../../../tools/map-db'

const SEED_COMPANIES: NewCompanyInput[] = [
  // Commodities & Trading
  { name: 'Trafigura', type: 'company', sector: 'Commodities', employees_est: 1800, lat: 46.2086, lng: 6.1508, area: 'Paquis', hq_location: 'Singapore', office_type: 'regional' },
  { name: 'Gunvor Group', type: 'company', sector: 'Commodities', employees_est: 600, lat: 46.2070, lng: 6.1490, area: 'Paquis', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Mercuria Energy', type: 'company', sector: 'Commodities', employees_est: 500, lat: 46.2020, lng: 6.1650, area: 'Eaux-Vives', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Vitol Geneva', type: 'company', sector: 'Commodities', employees_est: 400, lat: 46.2040, lng: 6.1430, area: 'Centre-Ville', hq_location: 'Rotterdam', office_type: 'regional' },
  { name: 'Cargill Geneva', type: 'company', sector: 'Agri-Commodities', employees_est: 450, lat: 46.2200, lng: 6.0420, area: 'Satigny', hq_location: 'Minnesota USA', office_type: 'regional' },
  { name: 'Louis Dreyfus', type: 'company', sector: 'Agri-Commodities', employees_est: 500, lat: 46.2140, lng: 6.0890, area: 'Vernier', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Glencore Geneva', type: 'company', sector: 'Commodities', employees_est: 800, lat: 46.2060, lng: 6.1470, area: 'Centre-Ville', hq_location: 'Baar Switzerland', office_type: 'regional' },

  // Tech & Fintech
  { name: 'Temenos', type: 'company', sector: 'Fintech', employees_est: 800, lat: 46.1850, lng: 6.1400, area: 'Carouge', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'STMicroelectronics', type: 'company', sector: 'Technology', employees_est: 1200, lat: 46.1680, lng: 6.1080, area: 'Plan-les-Ouates', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Logitech Geneva', type: 'company', sector: 'Technology', employees_est: 300, lat: 46.1700, lng: 6.1060, area: 'Plan-les-Ouates', hq_location: 'Lausanne', office_type: 'regional' },
  { name: 'Swissquote', type: 'company', sector: 'Fintech', employees_est: 900, lat: 46.4200, lng: 6.2680, area: 'Gland', hq_location: 'Gland', office_type: 'hq' },

  // Pharma & Life Sciences
  { name: 'Ferring Pharmaceuticals', type: 'company', sector: 'Pharma', employees_est: 600, lat: 46.1730, lng: 6.1020, area: 'Plan-les-Ouates', hq_location: 'Copenhagen', office_type: 'regional' },
  { name: 'Bachem', type: 'company', sector: 'Pharma', employees_est: 350, lat: 46.1820, lng: 6.1370, area: 'Carouge', hq_location: 'Bubendorf Switzerland', office_type: 'regional' },
  { name: 'Shire/Takeda Geneva', type: 'company', sector: 'Pharma', employees_est: 400, lat: 46.1800, lng: 6.1420, area: 'Carouge', hq_location: 'Tokyo', office_type: 'regional' },
  { name: 'Lonza Geneva', type: 'company', sector: 'Pharma', employees_est: 500, lat: 46.1760, lng: 6.1050, area: 'Plan-les-Ouates', hq_location: 'Basel', office_type: 'regional' },

  // Flavours, Chemicals, Manufacturing
  { name: 'Givaudan', type: 'company', sector: 'F&F / Chemicals', employees_est: 1500, lat: 46.2060, lng: 6.0860, area: 'Vernier', hq_location: 'Vernier', office_type: 'hq' },
  { name: 'Firmenich', type: 'company', sector: 'F&F / Chemicals', employees_est: 1200, lat: 46.1980, lng: 6.1150, area: 'Plan-les-Ouates', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Bobst Group', type: 'company', sector: 'Manufacturing', employees_est: 700, lat: 46.1950, lng: 6.0620, area: 'Mex', hq_location: 'Mex Switzerland', office_type: 'hq' },
  { name: 'Rolex Meyrin', type: 'company', sector: 'Manufacturing', employees_est: 500, lat: 46.2220, lng: 6.0880, area: 'Meyrin', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Richemont Geneva', type: 'company', sector: 'Luxury', employees_est: 800, lat: 46.1660, lng: 6.1050, area: 'Plan-les-Ouates', hq_location: 'Geneva', office_type: 'regional' },

  // Logistics & Transport
  { name: 'Kuehne+Nagel Geneva', type: 'company', sector: 'Logistics', employees_est: 350, lat: 46.2080, lng: 6.0920, area: 'Vernier', hq_location: 'Schindellegi Switzerland', office_type: 'regional' },
  { name: 'MSC Geneva', type: 'company', sector: 'Shipping/Logistics', employees_est: 600, lat: 46.2100, lng: 6.1200, area: 'Vernier', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'PSA Geneva', type: 'company', sector: 'Automotive', employees_est: 280, lat: 46.2180, lng: 6.0380, area: 'Satigny', hq_location: 'Paris', office_type: 'regional' },
  { name: 'AOG Energy', type: 'company', sector: 'Commodities', employees_est: 120, lat: 46.2100, lng: 6.0980, area: 'Vernier', hq_location: 'Geneva', office_type: 'hq' },

  // Finance
  { name: 'Pictet & Cie', type: 'company', sector: 'Private Banking', employees_est: 1100, lat: 46.2010, lng: 6.1520, area: 'Rive', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Lombard Odier', type: 'company', sector: 'Private Banking', employees_est: 800, lat: 46.2045, lng: 6.1425, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'EFG International', type: 'company', sector: 'Private Banking', employees_est: 500, lat: 46.2060, lng: 6.1480, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Union Bancaire Privée', type: 'company', sector: 'Private Banking', employees_est: 600, lat: 46.2050, lng: 6.1460, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },

  // International Organisations — compliance check required before calling
  { name: 'WTO Secretariat', type: 'intl_org', sector: 'International Org', employees_est: 700, lat: 46.2265, lng: 6.1350, area: 'Nations', office_type: 'campus' },
  { name: 'UNHCR Geneva', type: 'intl_org', sector: 'International Org', employees_est: 900, lat: 46.2290, lng: 6.1310, area: 'Nations', office_type: 'campus' },
  { name: 'ILO Geneva', type: 'intl_org', sector: 'International Org', employees_est: 700, lat: 46.2250, lng: 6.1420, area: 'Nations', office_type: 'campus' },
  { name: 'WHO Geneva', type: 'intl_org', sector: 'International Org', employees_est: 2000, lat: 46.2333, lng: 6.1428, area: 'Nations', office_type: 'campus' },
  { name: 'WIPO', type: 'intl_org', sector: 'International Org', employees_est: 1300, lat: 46.2283, lng: 6.1390, area: 'Nations', office_type: 'campus' },
  { name: 'ITU', type: 'intl_org', sector: 'International Org', employees_est: 700, lat: 46.2305, lng: 6.1398, area: 'Nations', office_type: 'campus' },

  // International Schools
  { name: 'International School of Geneva', type: 'school', sector: 'Education', employees_est: 600, lat: 46.2280, lng: 6.1580, area: 'Champel', office_type: 'campus' },
  { name: 'Institut International de Lancy', type: 'school', sector: 'Education', employees_est: 400, lat: 46.1900, lng: 6.1050, area: 'Lancy', office_type: 'campus' },
  { name: 'Ecole Internationale de Genève', type: 'school', sector: 'Education', employees_est: 500, lat: 46.2100, lng: 6.1600, area: 'Petit-Saconnex', office_type: 'campus' },
  { name: 'Geneva English School', type: 'school', sector: 'Education', employees_est: 300, lat: 46.2050, lng: 6.1700, area: 'Bellevue', office_type: 'campus' },
  { name: 'College du Leman', type: 'school', sector: 'Education', employees_est: 500, lat: 46.3600, lng: 6.2300, area: 'Versoix', office_type: 'campus' },
  { name: 'Institut Florimont', type: 'school', sector: 'Education', employees_est: 400, lat: 46.1950, lng: 6.1550, area: 'Carouge', office_type: 'campus' },

  // Hospitals & Healthcare
  { name: 'HUG (University Hospital Geneva)', type: 'hospital', sector: 'Healthcare', employees_est: 7000, lat: 46.1936, lng: 6.1508, area: 'Eaux-Vives', office_type: 'campus' },
  { name: 'Clinique des Grangettes', type: 'hospital', sector: 'Healthcare', employees_est: 400, lat: 46.1800, lng: 6.1750, area: 'Chêne-Bougeries', office_type: 'campus' },
  { name: 'Hirslanden Clinique La Colline', type: 'hospital', sector: 'Healthcare', employees_est: 350, lat: 46.2100, lng: 6.1650, area: 'Eaux-Vives', office_type: 'campus' },

  // Professional Services
  { name: 'Deloitte Geneva', type: 'company', sector: 'Professional Services', employees_est: 600, lat: 46.2060, lng: 6.1400, area: 'Centre-Ville', hq_location: 'Zurich', office_type: 'regional' },
  { name: 'PwC Geneva', type: 'company', sector: 'Professional Services', employees_est: 500, lat: 46.2040, lng: 6.1380, area: 'Centre-Ville', hq_location: 'Zurich', office_type: 'regional' },
  { name: 'KPMG Geneva', type: 'company', sector: 'Professional Services', employees_est: 450, lat: 46.2050, lng: 6.1390, area: 'Centre-Ville', hq_location: 'Zurich', office_type: 'regional' },
  { name: 'EY Geneva', type: 'company', sector: 'Professional Services', employees_est: 400, lat: 46.2045, lng: 6.1385, area: 'Centre-Ville', hq_location: 'Zurich', office_type: 'regional' },

  // Nyon area
  { name: 'Procter & Gamble EMEA HQ', type: 'company', sector: 'FMCG', employees_est: 2000, lat: 46.3800, lng: 6.2400, area: 'Nyon', hq_location: 'Cincinnati USA', office_type: 'regional' },
  { name: 'Hublot', type: 'company', sector: 'Luxury/Manufacturing', employees_est: 500, lat: 46.3750, lng: 6.2380, area: 'Nyon', hq_location: 'Nyon', office_type: 'hq' },
  { name: 'Sonova', type: 'company', sector: 'Medical Devices', employees_est: 600, lat: 46.3700, lng: 6.2350, area: 'Nyon', hq_location: 'Stäfa Switzerland', office_type: 'regional' },

  // Gland / Rolle area
  { name: 'WWF International', type: 'intl_org', sector: 'NGO', employees_est: 400, lat: 46.4100, lng: 6.2600, area: 'Gland', office_type: 'hq' },
  { name: 'IUCN', type: 'intl_org', sector: 'NGO', employees_est: 300, lat: 46.4050, lng: 6.2580, area: 'Gland', office_type: 'hq' },

  // Vevey / Lausanne corridor
  { name: 'Nestlé (Vevey satellite)', type: 'company', sector: 'FMCG', employees_est: 800, lat: 46.5200, lng: 6.6300, area: 'Vevey', hq_location: 'Vevey', office_type: 'hq' },
  { name: 'Philip Morris International', type: 'company', sector: 'FMCG', employees_est: 1500, lat: 46.5180, lng: 6.6320, area: 'Lausanne', hq_location: 'New York', office_type: 'regional' },
  { name: 'Medtronic EMEA', type: 'company', sector: 'Medical Devices', employees_est: 900, lat: 46.5100, lng: 6.6200, area: 'Lausanne', hq_location: 'Minneapolis USA', office_type: 'regional' },

  // Lausanne
  { name: 'EPFL', type: 'university', sector: 'Research/Education', employees_est: 6000, lat: 46.5191, lng: 6.5668, area: 'Lausanne', office_type: 'campus' },
  { name: 'University of Lausanne', type: 'university', sector: 'Education', employees_est: 4000, lat: 46.5220, lng: 6.5810, area: 'Lausanne', office_type: 'campus' },
  { name: 'IOC (Olympic HQ)', type: 'intl_org', sector: 'International Org', employees_est: 500, lat: 46.5180, lng: 6.6390, area: 'Lausanne', office_type: 'hq' },
  { name: 'Swiss Federal Court', type: 'public_sector', sector: 'Public Sector', employees_est: 400, lat: 46.5300, lng: 6.6250, area: 'Lausanne', office_type: 'campus' },
  { name: 'Kuoni Group', type: 'company', sector: 'Travel/Tourism', employees_est: 600, lat: 46.5100, lng: 6.5900, area: 'Lausanne', hq_location: 'Zurich', office_type: 'regional' },
  { name: 'Swisscom Lausanne', type: 'company', sector: 'Telecommunications', employees_est: 800, lat: 46.5200, lng: 6.6100, area: 'Lausanne', hq_location: 'Worblaufen', office_type: 'regional' },
]

const HIGH_PRIORITY = [
  'STMicroelectronics', 'Procter & Gamble EMEA HQ', 'Philip Morris International',
  'Medtronic EMEA', 'EPFL', 'MSC Geneva', 'Firmenich', 'Glencore Geneva',
]

// International schools are NOT avoid — teachers on international contracts
// are valid prospects. Only WHO/ILO flagged, per spec — compliance to confirm
// the rest of the intl_org list separately.
const AVOID = ['WHO Geneva', 'ILO Geneva']
const AVOID_REASON = 'Compliance check required before calling'

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization') ?? ''
  const apiKey = env.MAIA_API_KEY()

  if (!apiKey) {
    return new Response('Service unavailable — MAIA_API_KEY not configured', { status: 503 })
  }

  const expected = `Bearer ${apiKey}`
  const isValid = (() => {
    try {
      const a = Buffer.from(expected, 'utf8')
      const b = Buffer.from(authHeader.padEnd(expected.length, '\0').slice(0, expected.length), 'utf8')
      return authHeader.length === expected.length && timingSafeEqual(a, b)
    } catch {
      return false
    }
  })()

  if (!isValid) {
    return new Response('Unauthorized', { status: 401 })
  }

  const db = getDb()
  const existing = await db.select({ name: map_companies.name }).from(map_companies)
  const existingLower = new Set(existing.map(r => r.name.toLowerCase()))

  let added = 0
  const skipped: string[] = []
  for (const company of SEED_COMPANIES) {
    if (existingLower.has(company.name.toLowerCase())) {
      skipped.push(company.name)
      continue
    }
    await addCompany(company)
    added++
  }

  await db.update(map_companies)
    .set({ prospect_priority: 'high' })
    .where(sql`${map_companies.name} in (${sql.join(HIGH_PRIORITY.map(n => sql`${n}`), sql`, `)})`)

  await db.update(map_companies)
    .set({ prospect_priority: 'avoid', avoid_reason: AVOID_REASON })
    .where(sql`${map_companies.type} = 'intl_org' and ${map_companies.name} in (${sql.join(AVOID.map(n => sql`${n}`), sql`, `)})`)

  return Response.json({ added, skipped, total: SEED_COMPANIES.length })
}
