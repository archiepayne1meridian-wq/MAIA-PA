// POST /api/dashboard/social/generate — {sourceType, sourceContent} → full
// slideshow. Claude's text generation is blocking (fast — one sonnet call),
// but image generation (5-7 sequential DALL-E + sharp calls) runs in the
// background after the response, writing the growing imageUrls array back
// to the DB after each slide so the client's progress indicator can poll
// GET /posts/[id] and see real incremental progress.

import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { generateSlideshow, generateAllSlideImages } from '@/lib/social-knowledge'
import { createPost, type SocialSourceType } from '../../../../../../tools/social-db'

export async function POST(req: NextRequest) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sourceType, sourceContent } = await req.json().catch(() => ({})) as { sourceType?: SocialSourceType; sourceContent?: string }
  if (!sourceContent?.trim() || !sourceType) {
    return NextResponse.json({ error: 'sourceType and sourceContent are required' }, { status: 400 })
  }

  try {
    const result = await generateSlideshow(sourceType, sourceContent.trim())
    const postId = await createPost({
      sourceType,
      sourceContent: sourceContent.trim(),
      hookText: result.hook,
      slides: result.slides,
      caption: result.caption,
      hashtags: result.hashtags,
    })

    void generateAllSlideImages(postId, result.slides).catch(err => console.error('[social/generate] background image generation failed:', err))

    return NextResponse.json({
      id: postId,
      hook: result.hook,
      slides: result.slides,
      caption: result.caption,
      hashtags: result.hashtags,
      totalSlides: result.slides.length,
    })
  } catch (err) {
    console.error('[social/generate] failed:', err)
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
