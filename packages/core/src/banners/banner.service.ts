import { promises as fs } from 'fs';
import path from 'path';
import { assertAdmin, type Actor } from '../shared/actor';

// Types moved verbatim from apps/web/src/lib/banners.ts. Kept web-side too
// (apps/web/src/lib/banners.ts / banners-server.ts are untouched by this
// task — those files are imported by 'use client' components, and this
// module pulls in Node's `fs`/`path`, which must never end up in a client
// bundle; see task-7-report.md for the reasoning). This is the intentional
// small duplication the brief allows ("the actual filesystem/manifest
// mechanism can stay").
export type BannerSlot = 1;

export type BannerInfo = {
  filename: string;
  url: string;
  mimeType: string;
  linkUrl: string | null;
  updatedAt: string;
};

export type BannerManifest = {
  '1': BannerInfo | null;
};

export type BannerSlotSpec = {
  width: number;
  height: number;
  aspect: string;
};

export const BANNER_SLOT_SPECS: Record<BannerSlot, BannerSlotSpec> = {
  1: { width: 300, height: 300, aspect: '1 / 1' },
};

export function isValidSlot(value: unknown): value is BannerSlot {
  return value === 1;
}

const EMPTY_MANIFEST: BannerManifest = { '1': null };

/**
 * Resolved per-call (not cached at module load) so tests can override it via
 * `process.env.UPLOAD_DIR` before each call. Same effective value as the
 * original module-level constant in apps/web/src/lib/banners-server.ts — the
 * env var never actually changes mid-process in production.
 */
function uploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), 'storage', 'uploads');
}

function manifestPath(): string {
  return path.join(uploadDir(), 'banners.json');
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(uploadDir(), { recursive: true });
}

/**
 * Read the banner manifest from disk. Public read — no auth (matches the
 * original `GET /api/banners`, which has no admin check).
 */
export async function readBannerManifest(): Promise<BannerManifest> {
  try {
    const raw = await fs.readFile(manifestPath(), 'utf-8');
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
  await fs.writeFile(manifestPath(), JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Set (or clear) a banner slot's manifest entry. Pure — takes no actor,
 * matching the original `@/lib/banners-server.ts#setBanner` signature
 * exactly (the API route does its own `requireAdmin()` check before calling
 * the equivalent web-side function).
 */
export async function setBanner(slot: BannerSlot, info: BannerInfo | null): Promise<BannerManifest> {
  const manifest = await readBannerManifest();
  manifest[String(slot) as '1'] = info;
  await writeBannerManifest(manifest);
  return manifest;
}

/**
 * Actor-gated variant of `setBanner`, for direct `@docjob/core` callers
 * (e.g. a future SP-1d tRPC endpoint) that don't have their own admin
 * check. Admin only. Not currently called from the web app — the existing
 * `/api/banners` route keeps its own `requireAdmin()` + web-side manifest
 * helpers unchanged (see task-7-report.md).
 */
export async function setBannerSlot(
  actor: Actor | null,
  slot: BannerSlot,
  info: BannerInfo | null,
): Promise<BannerManifest> {
  assertAdmin(actor, 'Управлять баннерами может только администратор.');
  return setBanner(slot, info);
}
