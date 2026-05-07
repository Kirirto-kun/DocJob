import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { saveAttachment } from '@/lib/storage';

export const runtime = 'nodejs';

// Limit to 10 MB per support attachment to discourage abuse — saveAttachment
// also enforces a 25 MB hard cap.
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Файл слишком большой (лимит 10 МБ)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveAttachment(buffer, file.type);

    return NextResponse.json({
      filename: saved.filename,
      mimeType: saved.mimeType,
      size: saved.size,
      kind: saved.kind,
      url: saved.url,
      originalName: file.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
