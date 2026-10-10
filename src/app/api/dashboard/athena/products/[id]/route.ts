import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getProductById, deleteProduct, listCards } from '../../../../../../../tools/athena-db'
import { podcastPath } from '@/lib/athena-knowledge'
import fs from 'fs/promises'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  try {
    const product = await getProductById(id)
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    const cards = await listCards({ tab: 'product', productId: id })
    return NextResponse.json({
      product: {
        ...product,
        salesAngles: JSON.parse(product.sales_angles) as string[],
        mcqs: JSON.parse(product.mcqs) as unknown[],
        podcastStreamUrl: product.podcast_audio_url ? `/api/dashboard/athena/podcasts/${product.id}` : null,
      },
      cards,
    })
  } catch (err) {
    console.error('[athena/products/[id]] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load product' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  try {
    await deleteProduct(id)
    await fs.unlink(podcastPath(id)).catch(() => { /* no audio file — fine */ })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[athena/products/[id]] DELETE failed:', err)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
