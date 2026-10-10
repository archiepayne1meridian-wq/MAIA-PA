import { NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { listProducts, getProductAvgEase } from '../../../../../../tools/athena-db'

export async function GET() {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const [products, avgEase] = await Promise.all([listProducts(), getProductAvgEase()])
    const withIndicator = products.map(p => ({
      ...p,
      salesAngles: JSON.parse(p.sales_angles) as string[],
      // podcast_audio_url stores the real filesystem path (per spec) — the
      // client needs the streaming route instead, derived here from presence.
      podcastStreamUrl: p.podcast_audio_url ? `/api/dashboard/athena/podcasts/${p.id}` : null,
      avgEaseFactor: avgEase[p.id] ?? null,
      healthy: avgEase[p.id] !== undefined ? avgEase[p.id] > 2.0 : null,
    }))
    return NextResponse.json({ products: withIndicator })
  } catch (err) {
    console.error('[athena/products] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 })
  }
}
