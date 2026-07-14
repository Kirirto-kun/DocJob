/**
 * Unit tests for banner.service — pure filesystem I/O against a temp
 * directory (UPLOAD_DIR overridden per test), plus the actor-gating on
 * `setBannerSlot`. No DB involved, so — unlike most other core domain tests
 * added in this SP-1b pass — these run fine without Postgres.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { ForbiddenError, UnauthorizedError } from '../shared/errors';
import type { Actor } from '../shared/actor';
import {
  isValidSlot,
  readBannerManifest,
  setBanner,
  setBannerSlot,
  BANNER_SLOT_SPECS,
} from './banner.service';

const adminActor: Actor = { id: 'admin-1', role: 'ADMIN', approvedAt: new Date() };
const doctorActor: Actor = { id: 'doctor-1', role: 'DOCTOR', approvedAt: new Date() };

describe('banner.service', () => {
  let tmpDir: string;
  const originalUploadDir = process.env.UPLOAD_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docjob-banner-test-'));
    process.env.UPLOAD_DIR = tmpDir;
  });

  afterAll(() => {
    if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = originalUploadDir;
  });

  it('isValidSlot only accepts 1', () => {
    expect(isValidSlot(1)).toBe(true);
    expect(isValidSlot(2)).toBe(false);
    expect(isValidSlot('1')).toBe(false);
    expect(isValidSlot(null)).toBe(false);
  });

  it('BANNER_SLOT_SPECS defines a 300x300 spec for slot 1', () => {
    expect(BANNER_SLOT_SPECS[1]).toEqual({ width: 300, height: 300, aspect: '1 / 1' });
  });

  it('readBannerManifest returns an empty manifest when no file exists yet', async () => {
    const manifest = await readBannerManifest();
    expect(manifest).toEqual({ '1': null });
  });

  it('setBanner writes the manifest to disk and readBannerManifest reads it back', async () => {
    const info = {
      filename: 'banner-1.png',
      url: '/api/images/banner-1.png',
      mimeType: 'image/png',
      linkUrl: 'https://example.com',
      updatedAt: new Date().toISOString(),
    };
    const written = await setBanner(1, info);
    expect(written).toEqual({ '1': info });

    const reRead = await readBannerManifest();
    expect(reRead).toEqual({ '1': info });

    const raw = await fs.readFile(path.join(tmpDir, 'banners.json'), 'utf-8');
    expect(JSON.parse(raw)).toEqual({ '1': info });
  });

  it('setBanner(1, null) clears the slot', async () => {
    await setBanner(1, {
      filename: 'x.png',
      url: '/api/images/x.png',
      mimeType: 'image/png',
      linkUrl: null,
      updatedAt: new Date().toISOString(),
    });
    const cleared = await setBanner(1, null);
    expect(cleared).toEqual({ '1': null });
  });

  it('setBannerSlot throws UnauthorizedError for no actor', async () => {
    await expect(setBannerSlot(null, 1, null)).rejects.toThrow(UnauthorizedError);
  });

  it('setBannerSlot throws ForbiddenError for a non-admin actor', async () => {
    await expect(setBannerSlot(doctorActor, 1, null)).rejects.toThrow(ForbiddenError);
  });

  it('setBannerSlot succeeds for an admin actor', async () => {
    const info = {
      filename: 'admin-set.png',
      url: '/api/images/admin-set.png',
      mimeType: 'image/png',
      linkUrl: null,
      updatedAt: new Date().toISOString(),
    };
    const manifest = await setBannerSlot(adminActor, 1, info);
    expect(manifest).toEqual({ '1': info });
  });
});
