import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { regenerateSlideText, regenerateOneSlideImage, type SocialSlide } from '@/lib/social-knowledge'
import { getPostById, updatePost } from '../../../../../../../tools/social-db'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { postId, slideNumber, tweakNote } = await req.json().catch(() => ({})) as { postId?: string; slideNumber?: number; tweakNote?: string }
  if (!postId || !slideNumber) {
    return NextResponse.json({ error: 'postId and slideNumber are required' }, { status: 400 })
  }

  try {
    const post = await getPostById(postId)
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    const slides = JSON.parse(post.slides) as SocialSlide[]
    const current = slides.find(s => s.slideNumber === slideNumber)
    if (!current) return NextResponse.json({ error: 'Slide not found' }, { status: 404 })

    const regenerated = await regenerateSlideText(current, tweakNote)
    const newSlide: SocialSlide = { ...current, text: regenerated.text, imagePrompt: regenerated.imagePrompt }
    const newSlides = slides.map(s => (s.slideNumber === slideNumber ? newSlide : s))

    await regenerateOneSlideImage(postId, newSlide)
    await updatePost(postId, { slides: newSlides })

    return NextResponse.json({ slide: newSlide })
  } catch (err) {
    console.error('[social/generate/slide] failed:', err)
    const message = err instanceof Error ? err.message : 'Slide regeneration failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
