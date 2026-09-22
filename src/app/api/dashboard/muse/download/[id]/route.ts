import { NextRequest, NextResponse } from 'next/server'
import { requireDashboardAuth } from '@/lib/dashboard-auth'
import { getEntryFile } from '../../../../../../../tools/muse'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireDashboardAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const file = await getEntryFile(id)
  if (!file) {
    return NextResponse.json({ error: 'No file stored for this entry' }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(file.file_data), {
    status: 200,
    headers: {
      'Content-Type': file.file_type,
      'Content-Disposition': `attachment; filename="${file.file_name.replace(/"/g, '')}"`,
      'Content-Length': String(file.file_data.length),
    },
  })
}
