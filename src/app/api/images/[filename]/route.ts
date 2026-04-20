import { NextResponse } from 'next/server';
import { readImage } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const result = await readImage(filename);
  if (!result) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return new NextResponse(result.buffer, {
    status: 200,
    headers: {
      'Content-Type': result.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
