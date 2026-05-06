import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';
import type { BannerInfo, BannerManifest, BannerSlot } from './banners';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'storage', 'uploads');
const MANIFEST_PATH = path.join(UPLOAD_DIR, 'banners.json');

const EMPTY_MANIFEST: BannerManifest = { '1': null };

async function ensureDir(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function readBannerManifest(): Promise<BannerManifest> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<BannerManifest>;
    return {
      '1': parsed['1'] ?? null,
    };
  } catch {
    return { ...EMPTY_MANIFEST };
  }
}

export async function writeBannerManifest(manifest: BannerManifest): Promise<void> {
  await ensureDir();
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
}

export async function setBanner(
  slot: BannerSlot,
  info: BannerInfo | null,
): Promise<BannerManifest> {
  const manifest = await readBannerManifest();
  manifest[String(slot) as '1'] = info;
  await writeBannerManifest(manifest);
  return manifest;
}
