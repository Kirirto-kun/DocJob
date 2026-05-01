import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { saveImage, deleteImage } from '@/lib/storage';
import {
  isValidSlot,
  readBannerManifest,
  setBanner,
  type BannerSlot,
} from '@/lib/banners';

export const runtime = 'nodejs';

export async function GET() {
  const manifest = await readBannerManifest();
  return NextResponse.json(manifest);
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const rawSlot = Number(formData.get('slot'));
    if (!isValidSlot(rawSlot)) {
      return NextResponse.json({ error: 'Invalid slot' }, { status: 400 });
    }
    const slot = rawSlot as BannerSlot;
    const file = formData.get('file');
    const linkUrlField = formData.get('linkUrl');
    const linkUrl = typeof linkUrlField === 'string' && linkUrlField.trim() ? linkUrlField.trim() : null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveImage(buffer, file.type);

    const manifest = await readBannerManifest();
    const previous = manifest[String(slot) as '1' | '2'];
    const updated = await setBanner(slot, {
      filename: saved.filename,
      url: saved.url,
      mimeType: saved.mimeType,
      linkUrl,
      updatedAt: new Date().toISOString(),
    });

    if (previous?.filename) {
      await deleteImage(previous.filename);
    }

    return NextResponse.json({ manifest: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { slot?: number; linkUrl?: string | null };
    if (!isValidSlot(body.slot)) {
      return NextResponse.json({ error: 'Invalid slot' }, { status: 400 });
    }
    const slot = body.slot as BannerSlot;
    const linkUrl = typeof body.linkUrl === 'string' && body.linkUrl.trim() ? body.linkUrl.trim() : null;

    const manifest = await readBannerManifest();
    const current = manifest[String(slot) as '1' | '2'];
    if (!current) {
      return NextResponse.json({ error: 'Slot is empty' }, { status: 404 });
    }
    const updated = await setBanner(slot, { ...current, linkUrl });
    return NextResponse.json({ manifest: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const rawSlot = Number(url.searchParams.get('slot'));
    if (!isValidSlot(rawSlot)) {
      return NextResponse.json({ error: 'Invalid slot' }, { status: 400 });
    }
    const slot = rawSlot as BannerSlot;
    const manifest = await readBannerManifest();
    const current = manifest[String(slot) as '1' | '2'];
    const updated = await setBanner(slot, null);
    if (current?.filename) {
      await deleteImage(current.filename);
    }
    return NextResponse.json({ manifest: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
