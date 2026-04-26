import { NextResponse } from 'next/server';
import { readAttachment } from '@/lib/storage';
import { requireUser } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { filename } = await params;
  const result = await readAttachment(filename);
  if (!result) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return new NextResponse(result.buffer, {
    status: 200,
    headers: {
      'Content-Type': result.mimeType,
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
