// POST /api/admin/map-seed-batch2 — v2 territory expansion: ~90 more
// companies (watches, medtech, tech, FMCG, commodities, private banking,
// law, hotels, aviation, schools, intl orgs, Lausanne corridor) plus an
// aliases backfill for the original batch-1 companies. Bearer auth via
// MAIA_API_KEY. Temporary — delete this route once run against production
// and confirmed, per the standing "temporary admin routes, deleted after
// use" rule.
//
// Idempotent: skips any company whose name already exists (case-insensitive).
// The alias backfill always re-applies (harmless to repeat).

import { timingSafeEqual } from 'crypto'
import { env } from '@/lib/env'
import { getDb } from '@/db'
import { map_companies } from '@/db/schema'
import { addCompany, setCompanyAliases, type NewCompanyInput } from '../../../../../tools/map-db'

const ALIAS_BACKFILL: { name: string; aliases: string[] }[] = [
  { name: 'Procter & Gamble EMEA HQ', aliases: ['P&G', 'Procter & Gamble', 'Procter and Gamble'] },
  { name: 'STMicroelectronics', aliases: ['STMicro', 'ST Micro', 'ST Microelectronics'] },
  { name: 'Nestlé (Vevey satellite)', aliases: ['Nestle', 'Nestlé Vevey', 'Nestle SA', 'Nestlé SA'] },
  { name: 'Givaudan', aliases: ['Givaudan SA', 'Givaudan Vernier'] },
  { name: 'Firmenich', aliases: ['Firmenich SA', 'Firmenich International'] },
  { name: 'MSC Geneva', aliases: ['MSC', 'MSC Cruises', 'Mediterranean Shipping'] },
  { name: 'Trafigura', aliases: ['Trafigura Group', 'Trafigura Pte'] },
  { name: 'Gunvor Group', aliases: ['Gunvor', 'Gunvor SA'] },
  { name: 'Mercuria Energy', aliases: ['Mercuria', 'Mercuria SA'] },
  { name: 'Pictet & Cie', aliases: ['Pictet', 'Pictet Group', 'Banque Pictet'] },
  { name: 'Lombard Odier', aliases: ['LO', 'Banque Lombard Odier'] },
  { name: 'HUG (University Hospital Geneva)', aliases: ['HUG', 'Hopitaux Universitaires', 'Hôpitaux Universitaires de Genève'] },
  { name: 'Temenos', aliases: ['Temenos AG', 'Temenos Group'] },
  { name: 'Cargill Geneva', aliases: ['Cargill', 'Cargill SA'] },
  { name: 'Louis Dreyfus', aliases: ['LDC', 'Louis Dreyfus Company'] },
  { name: 'Glencore Geneva', aliases: ['Glencore', 'Glencore SA'] },
  { name: 'Vitol Geneva', aliases: ['Vitol', 'Vitol SA'] },
]

const SEED_COMPANIES: NewCompanyInput[] = [
  // Watchmaking cluster
  { name: 'Patek Philippe', type: 'company', sector: 'Luxury Watches', employees_est: 2000, lat: 46.1650, lng: 6.1050, area: 'Plan-les-Ouates', hq_location: 'Geneva', office_type: 'hq', prospect_priority: 'high' },
  { name: 'Vacheron Constantin', type: 'company', sector: 'Luxury Watches', employees_est: 1500, lat: 46.1680, lng: 6.1080, area: 'Plan-les-Ouates', hq_location: 'Geneva', office_type: 'hq', prospect_priority: 'high' },
  { name: 'Chopard', type: 'company', sector: 'Luxury Watches/Jewellery', employees_est: 1800, lat: 46.1700, lng: 6.1100, area: 'Meyrin', hq_location: 'Geneva', office_type: 'hq', prospect_priority: 'high' },
  { name: 'Richard Mille Geneva', type: 'company', sector: 'Luxury Watches', employees_est: 400, lat: 46.1720, lng: 6.1120, area: 'Plan-les-Ouates', hq_location: 'Les Breuleux', office_type: 'regional' },
  { name: 'Audemars Piguet', type: 'company', sector: 'Luxury Watches', employees_est: 1200, lat: 46.6350, lng: 6.3230, area: 'Le Brassus', hq_location: 'Le Brassus', office_type: 'hq', prospect_priority: 'high' },
  { name: 'Jaeger-LeCoultre', type: 'company', sector: 'Luxury Watches', employees_est: 1400, lat: 46.5960, lng: 6.2210, area: 'Sentier', hq_location: 'Le Sentier', office_type: 'hq', prospect_priority: 'high' },
  { name: 'Breguet (Swatch Group)', type: 'company', sector: 'Luxury Watches', employees_est: 600, lat: 46.1980, lng: 6.1420, area: 'Carouge', hq_location: 'Biel/Bienne', office_type: 'regional' },
  { name: 'Cartier Geneva', type: 'company', sector: 'Luxury Watches/Jewellery', employees_est: 800, lat: 46.2050, lng: 6.1500, area: 'Centre-Ville', hq_location: 'Paris', office_type: 'regional' },
  { name: 'IWC Schaffhausen', type: 'company', sector: 'Luxury Watches', employees_est: 700, lat: 47.6960, lng: 8.6350, area: 'Schaffhausen', hq_location: 'Schaffhausen', office_type: 'hq' },
  { name: 'Omega (Swatch Group)', type: 'company', sector: 'Luxury Watches', employees_est: 900, lat: 47.1460, lng: 7.2440, area: 'Biel/Bienne', hq_location: 'Biel/Bienne', office_type: 'hq' },

  // MedTech & healthcare
  { name: 'Edwards Lifesciences', type: 'company', sector: 'Medical Devices', employees_est: 600, lat: 46.3800, lng: 6.2420, area: 'Nyon', hq_location: 'Irvine USA', office_type: 'regional', prospect_priority: 'high' },
  { name: 'Alcon Switzerland', type: 'company', sector: 'Medical Devices', employees_est: 800, lat: 46.1750, lng: 6.1050, area: 'Vernier', hq_location: 'Fort Worth USA', office_type: 'regional', prospect_priority: 'high' },
  { name: 'Johnson & Johnson MedTech', type: 'company', sector: 'Medical Devices', employees_est: 900, lat: 46.3820, lng: 6.2400, area: 'Nyon', hq_location: 'New Brunswick USA', office_type: 'regional', prospect_priority: 'high' },
  { name: 'Boston Scientific EMEA', type: 'company', sector: 'Medical Devices', employees_est: 500, lat: 46.3810, lng: 6.2410, area: 'Nyon', hq_location: 'Marlborough USA', office_type: 'regional' },
  { name: 'Stryker Geneva', type: 'company', sector: 'Medical Devices', employees_est: 400, lat: 46.2100, lng: 6.1400, area: 'Centre-Ville', hq_location: 'Kalamazoo USA', office_type: 'regional' },
  { name: 'Zimmer Biomet', type: 'company', sector: 'Medical Devices', employees_est: 350, lat: 46.3790, lng: 6.2390, area: 'Nyon', hq_location: 'Warsaw USA', office_type: 'regional' },
  { name: 'Beckton Dickinson', type: 'company', sector: 'Medical Devices', employees_est: 400, lat: 46.3800, lng: 6.2400, area: 'Nyon', hq_location: 'Franklin Lakes USA', office_type: 'regional' },
  { name: 'Vifor Pharma', type: 'company', sector: 'Pharma', employees_est: 600, lat: 46.1780, lng: 6.1060, area: 'Plan-les-Ouates', hq_location: 'St Gallen Switzerland', office_type: 'hq' },
  { name: 'Straumann Group', type: 'company', sector: 'Medical Devices/Dental', employees_est: 400, lat: 46.5180, lng: 6.6200, area: 'Lausanne', hq_location: 'Basel', office_type: 'regional' },

  // Tech & enterprise software
  { name: 'Oracle Geneva', type: 'company', sector: 'Technology', employees_est: 500, lat: 46.2060, lng: 6.1430, area: 'Centre-Ville', hq_location: 'Austin USA', office_type: 'regional' },
  { name: 'Cisco Systems Geneva', type: 'company', sector: 'Technology', employees_est: 400, lat: 46.3800, lng: 6.2350, area: 'Nyon', hq_location: 'San Jose USA', office_type: 'regional' },
  { name: 'Hewlett Packard Enterprise', type: 'company', sector: 'Technology', employees_est: 600, lat: 46.3790, lng: 6.2340, area: 'Nyon', hq_location: 'Houston USA', office_type: 'regional' },
  { name: 'Honeywell Geneva', type: 'company', sector: 'Technology/Industrial', employees_est: 600, lat: 46.2200, lng: 6.1050, area: 'Vernier', hq_location: 'Charlotte USA', office_type: 'regional' },
  { name: 'Caterpillar EAME HQ', type: 'company', sector: 'Machinery/Industrial', employees_est: 800, lat: 46.2150, lng: 6.0980, area: 'Meyrin', hq_location: 'Peoria USA', office_type: 'regional', prospect_priority: 'high' },
  { name: 'Mettler-Toledo', type: 'company', sector: 'Precision Instruments', employees_est: 700, lat: 46.2280, lng: 6.0600, area: 'Greifensee', hq_location: 'Columbus USA', office_type: 'regional' },
  { name: 'Agilent Technologies', type: 'company', sector: 'Life Sciences/Tech', employees_est: 400, lat: 46.2100, lng: 6.1300, area: 'Vernier', hq_location: 'Santa Clara USA', office_type: 'regional' },
  { name: 'Thermo Fisher Scientific', type: 'company', sector: 'Life Sciences', employees_est: 500, lat: 46.2120, lng: 6.1320, area: 'Vernier', hq_location: 'Waltham USA', office_type: 'regional' },
  { name: 'Danaher Geneva', type: 'company', sector: 'Technology', employees_est: 350, lat: 46.2080, lng: 6.1380, area: 'Centre-Ville', hq_location: 'Washington USA', office_type: 'regional' },
  { name: 'SAP Geneva', type: 'company', sector: 'Enterprise Software', employees_est: 400, lat: 46.2055, lng: 6.1445, area: 'Centre-Ville', hq_location: 'Walldorf Germany', office_type: 'regional' },
  { name: 'Salesforce Geneva', type: 'company', sector: 'Technology', employees_est: 300, lat: 46.2060, lng: 6.1450, area: 'Centre-Ville', hq_location: 'San Francisco USA', office_type: 'regional' },

  // FMCG & consumer
  { name: 'Unilever Geneva', type: 'company', sector: 'FMCG', employees_est: 800, lat: 46.3800, lng: 6.2420, area: 'Nyon', hq_location: 'London', office_type: 'regional', prospect_priority: 'high' },
  { name: 'Colgate-Palmolive Europe', type: 'company', sector: 'FMCG', employees_est: 500, lat: 46.2050, lng: 6.1380, area: 'Centre-Ville', hq_location: 'New York USA', office_type: 'regional' },
  { name: 'Barry Callebaut', type: 'company', sector: 'Food Manufacturing', employees_est: 600, lat: 46.2180, lng: 6.0950, area: 'Meyrin', hq_location: 'Zurich', office_type: 'regional' },
  { name: 'Elanco Animal Health', type: 'company', sector: 'Pharma/Animal Health', employees_est: 400, lat: 46.5150, lng: 6.6100, area: 'Lausanne', hq_location: 'Greenfield USA', office_type: 'regional' },
  { name: 'Jacobs Douwe Egberts', type: 'company', sector: 'Food/Beverage', employees_est: 300, lat: 46.2060, lng: 6.1400, area: 'Centre-Ville', hq_location: 'Amsterdam', office_type: 'regional' },

  // Commodities — additional
  { name: 'Freepoint Commodities', type: 'company', sector: 'Commodities', employees_est: 200, lat: 46.2080, lng: 6.1470, area: 'Paquis', hq_location: 'Stamford USA', office_type: 'regional' },
  { name: 'Phibro LLC Geneva', type: 'company', sector: 'Commodities', employees_est: 180, lat: 46.2070, lng: 6.1480, area: 'Centre-Ville', hq_location: 'Stamford USA', office_type: 'regional' },
  { name: 'BB Energy', type: 'company', sector: 'Energy/Commodities', employees_est: 150, lat: 46.2075, lng: 6.1490, area: 'Paquis', hq_location: 'London', office_type: 'regional' },
  { name: 'Axpo Geneva', type: 'company', sector: 'Energy', employees_est: 300, lat: 46.2080, lng: 6.1420, area: 'Centre-Ville', hq_location: 'Baden Switzerland', office_type: 'regional' },
  { name: 'Alpiq Geneva', type: 'company', sector: 'Energy', employees_est: 400, lat: 46.2090, lng: 6.1430, area: 'Centre-Ville', hq_location: 'Lausanne', office_type: 'regional' },
  { name: 'Petroineos Geneva', type: 'company', sector: 'Energy/Refining', employees_est: 200, lat: 46.2065, lng: 6.1475, area: 'Centre-Ville', hq_location: 'London', office_type: 'regional' },

  // Private banking & asset management
  { name: 'Julius Baer Geneva', type: 'company', sector: 'Private Banking', employees_est: 700, lat: 46.2055, lng: 6.1445, area: 'Centre-Ville', hq_location: 'Zurich', office_type: 'regional', prospect_priority: 'high' },
  { name: 'Mirabaud & Cie', type: 'company', sector: 'Private Banking', employees_est: 400, lat: 46.2040, lng: 6.1420, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Bordier & Cie', type: 'company', sector: 'Private Banking', employees_est: 300, lat: 46.2045, lng: 6.1430, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Banque SYZ', type: 'company', sector: 'Private Banking', employees_est: 350, lat: 46.2050, lng: 6.1440, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Unigestion', type: 'company', sector: 'Asset Management', employees_est: 300, lat: 46.2065, lng: 6.1470, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Reyl & Cie', type: 'company', sector: 'Private Banking', employees_est: 250, lat: 46.2070, lng: 6.1480, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Edmond de Rothschild', type: 'company', sector: 'Private Banking', employees_est: 800, lat: 46.2035, lng: 6.1415, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq', prospect_priority: 'high' },
  { name: 'Stonehage Fleming', type: 'company', sector: 'Family Office', employees_est: 200, lat: 46.2045, lng: 6.1425, area: 'Centre-Ville', hq_location: 'London', office_type: 'regional' },
  { name: 'Vontobel Geneva', type: 'company', sector: 'Private Banking', employees_est: 350, lat: 46.2060, lng: 6.1450, area: 'Centre-Ville', hq_location: 'Zurich', office_type: 'regional' },
  { name: 'Banque Cantonale de Genève', type: 'company', sector: 'Banking', employees_est: 900, lat: 46.2055, lng: 6.1445, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Banque Cantonale Vaudoise', type: 'company', sector: 'Banking', employees_est: 1500, lat: 46.5200, lng: 6.6350, area: 'Lausanne', hq_location: 'Lausanne', office_type: 'hq' },
  { name: 'Vaudoise Insurance', type: 'company', sector: 'Insurance', employees_est: 600, lat: 46.5160, lng: 6.6250, area: 'Lausanne', hq_location: 'Lausanne', office_type: 'hq' },

  // Law firms
  { name: 'Lenz & Staehelin', type: 'law_firm', sector: 'Legal', employees_est: 300, lat: 46.2055, lng: 6.1445, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Schellenberg Wittmer', type: 'law_firm', sector: 'Legal', employees_est: 280, lat: 46.2045, lng: 6.1435, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Niederer Kraft Frey', type: 'law_firm', sector: 'Legal', employees_est: 250, lat: 46.2050, lng: 6.1440, area: 'Centre-Ville', hq_location: 'Zurich', office_type: 'regional' },
  { name: 'Baker McKenzie Geneva', type: 'law_firm', sector: 'Legal', employees_est: 200, lat: 46.2060, lng: 6.1450, area: 'Centre-Ville', hq_location: 'Chicago USA', office_type: 'regional' },
  { name: 'Freshfields Geneva', type: 'law_firm', sector: 'Legal', employees_est: 150, lat: 46.2065, lng: 6.1455, area: 'Centre-Ville', hq_location: 'London', office_type: 'regional' },
  { name: 'Linklaters Geneva', type: 'law_firm', sector: 'Legal', employees_est: 120, lat: 46.2070, lng: 6.1460, area: 'Centre-Ville', hq_location: 'London', office_type: 'regional' },
  { name: 'MLL Legal Geneva', type: 'law_firm', sector: 'Legal', employees_est: 200, lat: 46.2055, lng: 6.1445, area: 'Centre-Ville', hq_location: 'Zurich', office_type: 'regional' },
  { name: 'Lalive', type: 'law_firm', sector: 'Legal', employees_est: 180, lat: 46.2050, lng: 6.1440, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },

  // Consulting
  { name: 'McKinsey Geneva', type: 'company', sector: 'Consulting', employees_est: 300, lat: 46.2060, lng: 6.1450, area: 'Centre-Ville', hq_location: 'New York USA', office_type: 'regional' },
  { name: 'BCG Geneva', type: 'company', sector: 'Consulting', employees_est: 250, lat: 46.2055, lng: 6.1445, area: 'Centre-Ville', hq_location: 'Boston USA', office_type: 'regional' },
  { name: 'Bain & Company Geneva', type: 'company', sector: 'Consulting', employees_est: 200, lat: 46.2065, lng: 6.1455, area: 'Centre-Ville', hq_location: 'Boston USA', office_type: 'regional' },
  { name: 'Oliver Wyman Geneva', type: 'company', sector: 'Consulting', employees_est: 200, lat: 46.2060, lng: 6.1450, area: 'Centre-Ville', hq_location: 'New York USA', office_type: 'regional' },

  // International organisations — additional
  { name: 'CERN', type: 'intl_org', sector: 'Research', employees_est: 3000, lat: 46.2330, lng: 6.0530, area: 'Meyrin', office_type: 'campus', prospect_priority: 'high' },
  { name: 'ICRC (Red Cross)', type: 'intl_org', sector: 'International Org', employees_est: 1800, lat: 46.2260, lng: 6.1350, area: 'Petit-Saconnex', office_type: 'hq' },
  { name: 'Gavi (Vaccine Alliance)', type: 'intl_org', sector: 'International Org', employees_est: 500, lat: 46.2270, lng: 6.1360, area: 'Petit-Saconnex', office_type: 'hq' },
  { name: 'The Global Fund', type: 'intl_org', sector: 'International Org', employees_est: 800, lat: 46.2250, lng: 6.1340, area: 'Vernier', office_type: 'hq', prospect_priority: 'high' },
  { name: 'UNAIDS', type: 'intl_org', sector: 'International Org', employees_est: 600, lat: 46.2255, lng: 6.1345, area: 'Nations', office_type: 'hq' },
  { name: 'UNEP Geneva', type: 'intl_org', sector: 'International Org', employees_est: 400, lat: 46.2265, lng: 6.1355, area: 'Nations', office_type: 'regional' },
  { name: 'UN Trade & Development', type: 'intl_org', sector: 'International Org', employees_est: 500, lat: 46.2280, lng: 6.1380, area: 'Nations', office_type: 'hq' },
  { name: 'World Meteorological Organization', type: 'intl_org', sector: 'International Org', employees_est: 350, lat: 46.2310, lng: 6.1420, area: 'Nations', office_type: 'hq' },
  { name: 'Graduate Institute Geneva', type: 'university', sector: 'Education/Research', employees_est: 400, lat: 46.2240, lng: 6.1380, area: 'Petit-Saconnex', office_type: 'campus' },

  // Luxury hotels — expat management on international contracts, valid prospects
  { name: 'Kempinski Hotel Geneva', type: 'hotel', sector: 'Hospitality', employees_est: 400, lat: 46.2060, lng: 6.1470, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Four Seasons Geneva', type: 'hotel', sector: 'Hospitality', employees_est: 350, lat: 46.2045, lng: 6.1440, area: 'Centre-Ville', hq_location: 'Toronto Canada', office_type: 'regional' },
  { name: 'Mandarin Oriental Geneva', type: 'hotel', sector: 'Hospitality', employees_est: 300, lat: 46.2050, lng: 6.1450, area: 'Centre-Ville', hq_location: 'Hong Kong', office_type: 'regional' },
  { name: 'InterContinental Geneva', type: 'hotel', sector: 'Hospitality', employees_est: 400, lat: 46.2280, lng: 6.1380, area: 'Nations', hq_location: 'Atlanta USA', office_type: 'regional' },
  { name: 'Hotel President Wilson', type: 'hotel', sector: 'Hospitality', employees_est: 300, lat: 46.2040, lng: 6.1520, area: 'Eaux-Vives', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Beau-Rivage Geneva', type: 'hotel', sector: 'Hospitality', employees_est: 250, lat: 46.2055, lng: 6.1510, area: 'Eaux-Vives', hq_location: 'Geneva', office_type: 'hq' },
  { name: 'Fairmont Grand Hotel Geneva', type: 'hotel', sector: 'Hospitality', employees_est: 350, lat: 46.2060, lng: 6.1500, area: 'Centre-Ville', hq_location: 'Toronto Canada', office_type: 'regional' },
  { name: 'Le Richemond Geneva', type: 'hotel', sector: 'Hospitality', employees_est: 200, lat: 46.2065, lng: 6.1490, area: 'Centre-Ville', hq_location: 'Geneva', office_type: 'hq' },

  // Aviation & private jets
  { name: 'TAG Aviation', type: 'company', sector: 'Aviation', employees_est: 500, lat: 46.2380, lng: 6.1090, area: 'Cointrin', hq_location: 'Geneva', office_type: 'hq', prospect_priority: 'high' },
  { name: 'VistaJet Geneva', type: 'company', sector: 'Aviation', employees_est: 300, lat: 46.2380, lng: 6.1090, area: 'Cointrin', hq_location: 'Malta', office_type: 'regional', prospect_priority: 'high' },
  { name: 'Luxaviation Geneva', type: 'company', sector: 'Aviation', employees_est: 200, lat: 46.2380, lng: 6.1090, area: 'Cointrin', hq_location: 'Luxembourg', office_type: 'regional' },
  { name: 'Jet Aviation Basel', type: 'company', sector: 'Aviation', employees_est: 600, lat: 47.5960, lng: 7.5290, area: 'Basel', hq_location: 'Basel', office_type: 'regional' },
  { name: 'Swiss International Air Lines', type: 'company', sector: 'Aviation', employees_est: 800, lat: 46.2380, lng: 6.1090, area: 'Cointrin', hq_location: 'Basel', office_type: 'regional' },
  { name: 'Geneva Airport (GVA)', type: 'company', sector: 'Transport/Public', employees_est: 1200, lat: 46.2380, lng: 6.1090, area: 'Cointrin', hq_location: 'Geneva', office_type: 'hq' },

  // International schools — additional
  { name: 'Institut Le Rosey', type: 'school', sector: 'Education', employees_est: 500, lat: 46.4780, lng: 6.3350, area: 'Rolle', hq_location: 'Rolle', office_type: 'hq', prospect_priority: 'high' },
  { name: 'La Côte International School', type: 'school', sector: 'Education', employees_est: 400, lat: 46.4950, lng: 6.3900, area: 'Aubonne', hq_location: 'Aubonne', office_type: 'hq' },
  { name: 'Brillantmont International School', type: 'school', sector: 'Education', employees_est: 300, lat: 46.5150, lng: 6.6350, area: 'Lausanne', hq_location: 'Lausanne', office_type: 'hq' },
  { name: 'Aiglon College', type: 'school', sector: 'Education', employees_est: 400, lat: 46.4470, lng: 6.9860, area: 'Chesières', hq_location: 'Chesières', office_type: 'hq' },
  { name: 'Leysin American School', type: 'school', sector: 'Education', employees_est: 350, lat: 46.3390, lng: 7.0070, area: 'Leysin', hq_location: 'Leysin', office_type: 'hq' },
  { name: 'Collège Alpin Beau Soleil', type: 'school', sector: 'Education', employees_est: 300, lat: 46.2800, lng: 7.0100, area: 'Villars', hq_location: 'Villars', office_type: 'hq' },

  // Pharma — additional
  { name: 'Roche Geneva', type: 'company', sector: 'Pharma', employees_est: 400, lat: 46.2060, lng: 6.1440, area: 'Centre-Ville', hq_location: 'Basel', office_type: 'regional' },
  { name: 'Novartis Geneva', type: 'company', sector: 'Pharma', employees_est: 500, lat: 46.2055, lng: 6.1435, area: 'Centre-Ville', hq_location: 'Basel', office_type: 'regional' },
  { name: 'AstraZeneca Geneva', type: 'company', sector: 'Pharma', employees_est: 300, lat: 46.2065, lng: 6.1445, area: 'Centre-Ville', hq_location: 'Cambridge UK', office_type: 'regional' },
  { name: 'Ipsen Geneva', type: 'company', sector: 'Pharma', employees_est: 250, lat: 46.2070, lng: 6.1455, area: 'Centre-Ville', hq_location: 'Paris', office_type: 'regional' },
  { name: 'Servier Geneva', type: 'company', sector: 'Pharma', employees_est: 200, lat: 46.2075, lng: 6.1460, area: 'Centre-Ville', hq_location: 'Paris', office_type: 'regional' },

  // Logistics
  { name: 'CEVA Logistics', type: 'company', sector: 'Logistics', employees_est: 400, lat: 46.2150, lng: 6.0950, area: 'Meyrin', hq_location: 'Baar Switzerland', office_type: 'hq' },
  { name: 'Swiss International Air Lines Cargo', type: 'company', sector: 'Logistics/Aviation', employees_est: 300, lat: 46.2390, lng: 6.1100, area: 'Cointrin', hq_location: 'Basel', office_type: 'regional' },

  // Universities & research — additional
  { name: 'IMD Business School', type: 'university', sector: 'Education', employees_est: 500, lat: 46.5190, lng: 6.6340, area: 'Lausanne', office_type: 'campus', prospect_priority: 'high' },
  { name: 'IHEID Geneva', type: 'university', sector: 'Education/Research', employees_est: 500, lat: 46.2240, lng: 6.1380, area: 'Petit-Saconnex', office_type: 'campus' },
  { name: 'University of Geneva', type: 'university', sector: 'Education', employees_est: 5000, lat: 46.1969, lng: 6.1480, area: 'Carouge', office_type: 'campus' },
  { name: 'ISREC Cancer Research', type: 'university', sector: 'Research', employees_est: 200, lat: 46.5185, lng: 6.5665, area: 'Lausanne', office_type: 'campus' },

  // Lake Léman corridor — additional
  { name: 'Nestlé HQ', type: 'company', sector: 'FMCG', employees_est: 3500, lat: 46.4590, lng: 6.8430, area: 'Vevey', hq_location: 'Vevey', office_type: 'hq', prospect_priority: 'high' },
  { name: 'Tetra Pak Lausanne', type: 'company', sector: 'Packaging', employees_est: 600, lat: 46.5150, lng: 6.6100, area: 'Lausanne', hq_location: 'Lund Sweden', office_type: 'regional' },
  { name: 'SICPA', type: 'company', sector: 'Security Technologies', employees_est: 500, lat: 46.5180, lng: 6.6350, area: 'Prilly', hq_location: 'Prilly', office_type: 'hq' },
  { name: 'Bobst Renens', type: 'company', sector: 'Manufacturing', employees_est: 400, lat: 46.5100, lng: 6.5850, area: 'Renens', hq_location: 'Mex Switzerland', office_type: 'regional' },
  { name: 'Sunrise UPC Lausanne', type: 'company', sector: 'Telecommunications', employees_est: 700, lat: 46.5200, lng: 6.6300, area: 'Lausanne', hq_location: 'Opfikon Switzerland', office_type: 'regional' },
]

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

  for (const { name, aliases } of ALIAS_BACKFILL) {
    await setCompanyAliases(name, aliases)
  }

  return Response.json({ added, skipped, total: SEED_COMPANIES.length, aliasesBackfilled: ALIAS_BACKFILL.length })
}
