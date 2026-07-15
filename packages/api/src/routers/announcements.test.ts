/**
 * Integration tests for the `announcements` tRPC router — run against the
 * real dev Postgres, same harness as reviews.test.ts/tags.test.ts.
 *
 * Note `active` uses publicProcedure (forwarding `ctx.actor`, which may be
 * `null`) even though this task's brief labelled it "protected" — core's
 * `getActiveAnnouncements` gracefully returns `[]` for a `null` actor rather
 * than throwing (see announcements.ts's doc comment for the rationale). The
 * guest test below asserts on that graceful behavior directly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { prisma } from '@docjob/db';
import type { Actor } from '@docjob/core';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';
import { noopEmailSender } from '../test-helpers';

const createCaller = createCallerFactory(appRouter);

function uniqueEmail(tag: string): string {
  return `api-announce-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
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

describe('announcements router (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  let doctorUserId: string;
  let doctorActor: Actor;
  const createdAnnouncementIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: uniqueEmail('admin'),
        passwordHash: 'unused-in-tests',
        name: 'API Announce Test Admin',
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
        name: 'API Announce Test Doctor',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    doctorUserId = doctor.id;
    doctorActor = { id: doctor.id, role: 'DOCTOR', approvedAt: new Date() };
  });

  afterAll(async () => {
    await prisma.announcementDismissal.deleteMany({ where: { userId: { in: [adminUserId, doctorUserId] } } });
    if (createdAnnouncementIds.length) {
      await prisma.announcement.deleteMany({ where: { id: { in: createdAnnouncementIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, doctorUserId] } } });
  });

  it('create rejects with TRPCError FORBIDDEN for a non-admin actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const err = await captureTRPCError(() =>
      caller.announcements.create({ title: 'Nope', body: 'Never created.' }),
    );
    expect(err.code).toBe('FORBIDDEN');
  });

  it('create rejects with TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: null });
    const err = await captureTRPCError(() =>
      caller.announcements.create({ title: 'Nope', body: 'Never created.' }),
    );
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('active as a guest (no actor) does not throw and returns an empty list', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: null });
    await expect(caller.announcements.active()).resolves.toEqual([]);
  });

  it('list/byId reject with TRPCError FORBIDDEN for a non-admin actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const listErr = await captureTRPCError(() => caller.announcements.list());
    expect(listErr.code).toBe('FORBIDDEN');
    const byIdErr = await captureTRPCError(() => caller.announcements.byId('whatever'));
    expect(byIdErr.code).toBe('FORBIDDEN');
  });

  it('active excludes an announcement the actor has dismissed', async () => {
    const adminCaller = createCaller({ email: noopEmailSender, actor: adminActor });
    const created = await adminCaller.announcements.create({
      title: `API Announce Dismiss Test ${Date.now()}`,
      body: 'Body text.',
    });
    createdAnnouncementIds.push(created.id);

    const doctorCaller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const beforeDismiss = await doctorCaller.announcements.active();
    expect(beforeDismiss.some((a) => a.id === created.id)).toBe(true);

    const dismissed = await doctorCaller.announcements.dismiss(created.id);
    expect(dismissed).toEqual({ id: created.id });

    const afterDismiss = await doctorCaller.announcements.active();
    expect(afterDismiss.some((a) => a.id === created.id)).toBe(false);

    // A different actor who never dismissed it still sees it.
    const adminActive = await adminCaller.announcements.active();
    expect(adminActive.some((a) => a.id === created.id)).toBe(true);
  });

  it('dismiss rejects with TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: null });
    const err = await captureTRPCError(() => caller.announcements.dismiss('whatever'));
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('byId as admin returns the item; throws NOT_FOUND for a missing id', async () => {
    const adminCaller = createCaller({ email: noopEmailSender, actor: adminActor });
    const created = await adminCaller.announcements.create({
      title: 'byId success',
      body: 'Body.',
    });
    createdAnnouncementIds.push(created.id);

    const fetched = await adminCaller.announcements.byId(created.id);
    expect(fetched.id).toBe(created.id);

    const err = await captureTRPCError(() => adminCaller.announcements.byId('does-not-exist'));
    expect(err.code).toBe('NOT_FOUND');
  });

  it('update as admin persists changes; rejects FORBIDDEN for a non-admin actor', async () => {
    const adminCaller = createCaller({ email: noopEmailSender, actor: adminActor });
    const created = await adminCaller.announcements.create({ title: 'Before update', body: 'Body.' });
    createdAnnouncementIds.push(created.id);

    const doctorCaller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const err = await captureTRPCError(() =>
      doctorCaller.announcements.update({ id: created.id, title: 'Hacked', body: 'Hacked.' }),
    );
    expect(err.code).toBe('FORBIDDEN');

    const updated = await adminCaller.announcements.update({
      id: created.id,
      title: 'After update',
      body: 'Updated body.',
    });
    expect(updated.title).toBe('After update');
    expect(updated.body).toBe('Updated body.');
  });

  it('delete as admin removes the item; rejects FORBIDDEN for a non-admin actor', async () => {
    const adminCaller = createCaller({ email: noopEmailSender, actor: adminActor });
    const created = await adminCaller.announcements.create({ title: 'To be deleted', body: 'Body.' });

    const doctorCaller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const forbidden = await captureTRPCError(() => doctorCaller.announcements.delete(created.id));
    expect(forbidden.code).toBe('FORBIDDEN');

    const deleted = await adminCaller.announcements.delete(created.id);
    expect(deleted).toEqual({ id: created.id });

    const gone = await prisma.announcement.findUnique({ where: { id: created.id } });
    expect(gone).toBeNull();
  });
});
