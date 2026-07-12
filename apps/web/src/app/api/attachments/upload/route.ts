import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@docjob/db';
import { saveAttachment } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    const titleRaw = formData.get('title');
    const descriptionRaw = formData.get('description');
    const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : null;
    const description = typeof descriptionRaw === 'string' && descriptionRaw.trim() ? descriptionRaw.trim() : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveAttachment(buffer, file.type || 'application/octet-stream');

    const record = await prisma.caseAttachment.create({
      data: {
        filename: saved.filename,
        originalName: file.name,
        title,
        description,
        mimeType: saved.mimeType,
        size: saved.size,
        kind: saved.kind,
        uploaderId: admin.id,
      },
    });

    return NextResponse.json({
      id: record.id,
      filename: saved.filename,
      originalName: file.name,
      title: record.title,
      description: record.description,
      mimeType: saved.mimeType,
      size: saved.size,
      kind: saved.kind,
      url: saved.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
