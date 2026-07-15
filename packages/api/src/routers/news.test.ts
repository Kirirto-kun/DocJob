/**
 * Integration tests for the `news` tRPC router — run against the real dev
 * Postgres, same harness as reviews.test.ts/tags.test.ts.
 *
 * Note `byId` uses adminProcedure even though this task's brief pencilled it
 * in as a public read — core's `getNewsItem` actually calls `assertAdmin`
 * (see news.ts's doc comment for the correction rationale). The non-admin /
 * no-actor rejection tests below assert on that, matching core exactly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { prisma } from '@docjob/db';
import type { Actor } from '@docjob/core';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';
import { noopEmailSender, testPasswordResetBase, testContactInboxEmail } from '../test-helpers';

const createCaller = createCallerFactory(appRouter);

function uniqueEmail(tag: string): string {
  return `api-news-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
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

describe('news router (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  let doctorUserId: string;
  let doctorActor: Actor;
  const createdNewsIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: uniqueEmail('admin'),
        passwordHash: 'unused-in-tests',
        name: 'API News Test Admin',
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
        name: 'API News Test Doctor',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    doctorUserId = doctor.id;
    doctorActor = { id: doctor.id, role: 'DOCTOR', approvedAt: new Date() };
  });

  afterAll(async () => {
    if (createdNewsIds.length) {
      await prisma.newsItem.deleteMany({ where: { id: { in: createdNewsIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, doctorUserId] } } });
  });

  it('create rejects with TRPCError FORBIDDEN for a non-admin actor', async () => {
    const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: doctorActor });
    const err = await captureTRPCError(() =>
      caller.news.create({ title: 'Should never be created', body: 'Body text.' }),
    );
    expect(err.code).toBe('FORBIDDEN');
  });

  it('create rejects with TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: null });
    const err = await captureTRPCError(() =>
      caller.news.create({ title: 'Should never be created', body: 'Body text.' }),
    );
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('list (public, no actor) returns an array', async () => {
    const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: null });
    const items = await caller.news.list();
    expect(Array.isArray(items)).toBe(true);
  });

  it('create as admin persists; public list includes it', async () => {
    const adminCaller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: adminActor });
    const title = `API News Test ${Date.now()}`;
    const created = await adminCaller.news.create({ title, body: 'Some news body.' });
    createdNewsIds.push(created.id);
    expect(created.id).toBeTruthy();

    const guestCaller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: null });
    const items = await guestCaller.news.list();
    expect(items.some((i) => i.id === created.id && i.title === title)).toBe(true);
  });

  it('byId rejects with TRPCError FORBIDDEN for a non-admin actor', async () => {
    const adminCaller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: adminActor });
    const created = await adminCaller.news.create({ title: 'byId target', body: 'Body.' });
    createdNewsIds.push(created.id);

    const doctorCaller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: doctorActor });
    const err = await captureTRPCError(() => doctorCaller.news.byId(created.id));
    expect(err.code).toBe('FORBIDDEN');
  });

  it('byId rejects with TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: null });
    const err = await captureTRPCError(() => caller.news.byId('does-not-matter'));
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('byId as admin returns the item; throws NOT_FOUND for a missing id', async () => {
    const adminCaller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: adminActor });
    const created = await adminCaller.news.create({ title: 'byId success', body: 'Body.' });
    createdNewsIds.push(created.id);

    const fetched = await adminCaller.news.byId(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.title).toBe('byId success');

    const err = await captureTRPCError(() => adminCaller.news.byId('does-not-exist'));
    expect(err.code).toBe('NOT_FOUND');
  });

  it('update as admin persists changes; rejects FORBIDDEN for a non-admin actor', async () => {
    const adminCaller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: adminActor });
    const created = await adminCaller.news.create({ title: 'Before update', body: 'Body.' });
    createdNewsIds.push(created.id);

    const doctorCaller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: doctorActor });
    const err = await captureTRPCError(() =>
      doctorCaller.news.update({ id: created.id, title: 'Hacked', body: 'Hacked.' }),
    );
    expect(err.code).toBe('FORBIDDEN');

    const updated = await adminCaller.news.update({
      id: created.id,
      title: 'After update',
      body: 'Updated body.',
    });
    expect(updated).toEqual({ id: created.id });

    const fetched = await adminCaller.news.byId(created.id);
    expect(fetched.title).toBe('After update');
    expect(fetched.body).toBe('Updated body.');
  });

  it('delete as admin removes the item; rejects FORBIDDEN for a non-admin actor', async () => {
    const adminCaller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: adminActor });
    const created = await adminCaller.news.create({ title: 'To be deleted', body: 'Body.' });

    const doctorCaller = createCaller({ email: noopEmailSender, passwordResetBase: testPasswordResetBase, contactInboxEmail: testContactInboxEmail, actor: doctorActor });
    const forbidden = await captureTRPCError(() => doctorCaller.news.delete(created.id));
    expect(forbidden.code).toBe('FORBIDDEN');

    const deleted = await adminCaller.news.delete(created.id);
    expect(deleted).toEqual({ id: created.id });

    const gone = await prisma.newsItem.findUnique({ where: { id: created.id } });
    expect(gone).toBeNull();
  });
});
