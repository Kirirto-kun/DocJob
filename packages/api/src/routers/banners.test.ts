/**
 * Integration tests for the `banners` tRPC router — run against the real dev
 * Postgres (for actor fixtures) plus the real filesystem manifest
 * (`core.banners.readBannerManifest`/`setBannerSlot`, backed by
 * `UPLOAD_DIR`/banners.json — see banner.service.ts). The manifest file this
 * test creates (under `UPLOAD_DIR` relative to this package's cwd, since
 * `packages/api/storage/uploads` did not previously exist) is removed in
 * `afterAll` so the suite leaves no stray untracked files behind.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '@docjob/db';
import type { Actor } from '@docjob/core';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';
import { noopEmailSender, testPasswordResetBase, testContactInboxEmail } from '../test-helpers';

const createCaller = createCallerFactory(appRouter);

function uniqueEmail(tag: string): string {
  return `api-banners-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
}

async function captureTRPCError(fn: () => Promise<unknown>): Promise<TRPCError> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof TRPCError) return e;
    throw e;
  }
  throw new Error('expected a TRPCError to be thrown');
}

describe('banners router (integration, real Postgres + filesystem manifest)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  let doctorUserId: string;
  let doctorActor: Actor;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: uniqueEmail('admin'),
        passwordHash: 'unused-in-tests',
        name: 'API Banners Test Admin',
        role: 'ADMIN',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    adminUserId = admin.id;
    adminActor = { id: admin.id, role: 'ADMIN', approvedAt: new Date() };

    const doctor = await prisma.user.create({
      data: {
        email: uniqueEmail('doctor'),
        passwordHash: 'unused-in-tests',
        name: 'API Banners Test Doctor',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    doctorUserId = doctor.id;
    doctorActor = { id: doctor.id, role: 'DOCTOR', approvedAt: new Date() };
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, doctorUserId] } } });
    // Best-effort cleanup of whatever this suite created under UPLOAD_DIR
    // (relative to this package's cwd) so no stray manifest is left behind.
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'storage', 'uploads');
    await fs.rm(path.resolve(process.cwd(), uploadDir), { recursive: true, force: true }).catch(() => {});
  });

  it('get (public, no actor) returns a manifest object', async () => {
    const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: null });
    const manifest = await caller.banners.get();
    expect(manifest).toHaveProperty('1');
  });

  it('set rejects with TRPCError FORBIDDEN for a non-admin actor', async () => {
    const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: doctorActor });
    const err = await captureTRPCError(() =>
      caller.banners.set({
        slot: 1,
        info: {
          filename: 'nope.png',
          url: '/api/images/nope.png',
          mimeType: 'image/png',
          linkUrl: null,
          updatedAt: new Date().toISOString(),
        },
      }),
    );
    expect(err.code).toBe('FORBIDDEN');
  });

  it('set rejects with TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: null });
    const err = await captureTRPCError(() =>
      caller.banners.set({
        slot: 1,
        info: {
          filename: 'nope.png',
          url: '/api/images/nope.png',
          mimeType: 'image/png',
          linkUrl: null,
          updatedAt: new Date().toISOString(),
        },
      }),
    );
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('set rejects an invalid slot with TRPCError BAD_REQUEST', async () => {
    const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: adminActor });
    const err = await captureTRPCError(() =>
      caller.banners.set({
        // @ts-expect-error deliberately invalid slot for the runtime check
        slot: 2,
        info: null,
      }),
    );
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('set as admin persists banner info; get reflects it; clearing (info: null) removes it', async () => {
    const adminCaller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: adminActor });
    const info = {
      filename: `api-banners-test-${Date.now()}.png`,
      url: '/api/images/api-banners-test.png',
      mimeType: 'image/png',
      linkUrl: 'https://example.com',
      updatedAt: new Date().toISOString(),
    };

    const updated = await adminCaller.banners.set({ slot: 1, info });
    expect(updated['1']).toEqual(info);

    const fetched = await adminCaller.banners.get();
    expect(fetched['1']).toEqual(info);

    const cleared = await adminCaller.banners.set({ slot: 1, info: null });
    expect(cleared['1']).toBeNull();

    const fetchedAfterClear = await adminCaller.banners.get();
    expect(fetchedAfterClear['1']).toBeNull();
  });
});
