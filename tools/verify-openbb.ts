/**
 * MAIA OpenBB Verification Script
 *
 * Tests every endpoint the DEMETER terminal needs, with both yfinance and FMP providers.
 * Run AFTER deploying openbb-service to Railway:
 *
 *   OPENBB_URL=https://... OPENBB_TOKEN=... npx tsx tools/verify-openbb.ts
 *
 * Or with .env loaded:
 *   npx tsx --env-file=.env tools/verify-openbb.ts
 *
 * Reports raw per-symbol results. Used to confirm D3a is done.
 */

const BASE = process.env.OPENBB_URL?.replace(/\/$/, '')
const TOKEN = process.env.OPENBB_TOKEN

if (!BASE || !TOKEN) {
  console.error('\n✗  Missing OPENBB_URL or OPENBB_TOKEN. Export them or use --env-file=.env\n')
  process.exit(1)
}

const AUTH = { Authorization: `Bearer ${TOKEN}` }

// ── Helpers ───────────────────────────────────────────────────────────────────

type ApiResult = { ok: boolean; status: number; body: unknown }

async function get(path: string): Promise<ApiResult> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: AUTH })
    const body = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, body }
  } catch (err) {
    return { ok: false, status: 0, body: String(err) }
  }
}

function isoDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]!
}

function truncate(s: string, n = 200): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ── Quote test ────────────────────────────────────────────────────────────────

async function testQuote(symbols: string[], provider: string) {
  const sym = symbols.join(',')
  const r = await get(`/api/v1/equity/price/quote?symbol=${encodeURIComponent(sym)}&provider=${provider}`)
  console.log(`\n  ── QUOTE [${provider}]  ${sym}`)
  console.log(`     HTTP ${r.status}`)

  if (!r.ok || !r.body || typeof r.body !== 'object') {
    console.log(`     ✗  ${truncate(JSON.stringify(r.body))}`)
    return
  }

  const results = ((r.body as { results?: unknown[] }).results) ?? []
  if (results.length === 0) {
    console.log('     ⚠  Empty results array — provider may not cover these symbols')
    return
  }

  for (const row of results) {
    const q = row as Record<string, unknown>
    const price = q.last_price ?? q.price ?? '?'
    const prev  = q.prev_close ?? q.previous_close ?? '?'
    const ccy   = q.currency ?? '?'
    const sym2  = q.symbol ?? '?'
    const flag  = (price === '?' || price === 0) ? '⚠' : '✓'
    console.log(`     ${flag}  ${sym2}: price=${price}  prev=${prev}  currency=${ccy}`)
  }
}

// ── Historical bars test ──────────────────────────────────────────────────────

async function testHistory(symbol: string, provider: string) {
  const start = isoDate(-30)
  const end   = isoDate(0)
  const r = await get(
    `/api/v1/equity/price/historical?symbol=${encodeURIComponent(symbol)}` +
    `&start_date=${start}&end_date=${end}&interval=1d&provider=${provider}`,
  )
  console.log(`\n  ── HISTORY [${provider}]  ${symbol}  (30d)`)
  console.log(`     HTTP ${r.status}`)

  if (!r.ok || !r.body || typeof r.body !== 'object') {
    console.log(`     ✗  ${truncate(JSON.stringify(r.body))}`)
    return
  }

  const results = ((r.body as { results?: unknown[] }).results) ?? []
  if (results.length === 0) {
    console.log('     ⚠  Empty results — no historical bars returned')
    return
  }

  const first = results[0] as Record<string, unknown>
  const last  = results[results.length - 1] as Record<string, unknown>
  console.log(`     ✓  ${results.length} bars`)
  console.log(`        first: ${JSON.stringify(first).slice(0, 140)}`)
  console.log(`        last:  ${JSON.stringify(last).slice(0, 140)}`)
}

// ── FX test ───────────────────────────────────────────────────────────────────

async function testFx(pair: string, provider: string) {
  const start = isoDate(-2)
  const end   = isoDate(0)
  const r = await get(
    `/api/v1/currency/price/historical?symbol=${encodeURIComponent(pair)}` +
    `&start_date=${start}&end_date=${end}&interval=1d&provider=${provider}`,
  )
  console.log(`\n  ── FX [${provider}]  ${pair}`)
  console.log(`     HTTP ${r.status}`)

  if (!r.ok || !r.body || typeof r.body !== 'object') {
    console.log(`     ✗  ${truncate(JSON.stringify(r.body))}`)
    return
  }

  const results = ((r.body as { results?: unknown[] }).results) ?? []
  if (results.length === 0) {
    console.log('     ⚠  Empty results')
    return
  }

  const row = results[results.length - 1] as Record<string, unknown>
  const rate = row.close ?? row.rate ?? row.price ?? '?'
  const date = row.date ?? '?'
  console.log(`     ✓  ${pair} = ${rate}  (${date})`)
}

// ── News test ─────────────────────────────────────────────────────────────────

async function testNews(symbol: string, provider: string) {
  const r = await get(
    `/api/v1/news/company?symbol=${encodeURIComponent(symbol)}&limit=3&provider=${provider}`,
  )
  console.log(`\n  ── NEWS [${provider}]  ${symbol}`)
  console.log(`     HTTP ${r.status}`)

  if (!r.ok || !r.body || typeof r.body !== 'object') {
    console.log(`     ✗  ${truncate(JSON.stringify(r.body))}`)
    return
  }

  const results = ((r.body as { results?: unknown[] }).results) ?? []
  if (results.length === 0) {
    console.log('     ⚠  No news items')
    return
  }

  for (const row of results.slice(0, 2)) {
    const n = row as Record<string, unknown>
    console.log(`     ✓  "${String(n.title ?? '').slice(0, 90)}"`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Health check
  const h = await get('/health')
  console.log('\n═══════════════════════════════════════════════════════')
  console.log(`  MAIA OpenBB Verification — ${new Date().toISOString()}`)
  console.log(`  URL: ${BASE}`)
  console.log(`  Health: HTTP ${h.status}  ${JSON.stringify(h.body)}`)
  console.log('═══════════════════════════════════════════════════════')

  // ── Section 1: US equity quotes ─────────────────────────────────────────
  console.log('\n● US equities  (MU, AMAT, IONQ, MSTR)')
  await testQuote(['MU', 'AMAT', 'IONQ', 'MSTR'], 'yfinance')
  await testQuote(['MU', 'AMAT', 'IONQ', 'MSTR'], 'fmp')

  // ── Section 2: LSE ETF quotes — the hard ones ───────────────────────────
  console.log('\n● LSE ETFs  (VWRP.L, VDPG.L)')
  await testQuote(['VWRP.L', 'VDPG.L'], 'yfinance')
  await testQuote(['VWRP.L', 'VDPG.L'], 'fmp')

  // ── Section 3: Historical bars — US ────────────────────────────────────
  console.log('\n● Historical bars — US equity')
  await testHistory('MU', 'yfinance')
  await testHistory('MU', 'fmp')

  // ── Section 4: Historical bars — LSE ETF ───────────────────────────────
  console.log('\n● Historical bars — LSE ETF')
  await testHistory('VWRP.L', 'yfinance')
  await testHistory('VWRP.L', 'fmp')

  // ── Section 5: FX ──────────────────────────────────────────────────────
  console.log('\n● FX  (GBP/USD)')
  await testFx('GBPUSD', 'yfinance')
  await testFx('GBPUSD', 'fmp')

  // ── Section 6: News ────────────────────────────────────────────────────
  console.log('\n● Company news')
  await testNews('MU', 'fmp')
  await testNews('MU', 'yfinance')
  await testNews('AMAT', 'fmp')

  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  Done. Paste full output back for D3a sign-off.')
  console.log('═══════════════════════════════════════════════════════\n')
}

main().catch(err => {
  console.error('\nVerify script crashed:', err)
  process.exit(1)
})
