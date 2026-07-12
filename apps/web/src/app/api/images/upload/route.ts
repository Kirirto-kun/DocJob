import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { saveImage } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveImage(buffer, file.type);

    return NextResponse.json({
      filename: saved.filename,
      mimeType: saved.mimeType,
      url: saved.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
