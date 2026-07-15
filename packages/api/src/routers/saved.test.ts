/**
 * Integration tests for the `saved` tRPC router — run against the real dev
 * Postgres, same harness as reviews.test.ts/cases.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { prisma } from '@docjob/db';
import * as core from '@docjob/core';
import type { Actor } from '@docjob/core';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';
import { noopEmailSender } from '../test-helpers';

const createCaller = createCallerFactory(appRouter);

function uniqueEmail(tag: string): string {
  return `api-saved-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
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

describe('saved router (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  let doctorUserId: string;
  let doctorActor: Actor;
  let caseId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: uniqueEmail('admin'),
        passwordHash: 'unused-in-tests',
        name: 'API Saved Test Admin',
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
        name: 'API Saved Test Doctor',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    doctorUserId = doctor.id;
    doctorActor = { id: doctor.id, role: 'DOCTOR', approvedAt: new Date() };

    const created = await core.cases.createCase(adminActor, { name: 'API Saved Router Test Case' });
    caseId = created.id;
  });

  afterAll(async () => {
    await prisma.savedCase.deleteMany({ where: { userId: { in: [adminUserId, doctorUserId] } } });
    await prisma.case.delete({ where: { id: caseId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, doctorUserId] } } });
  });

  it('isSaved throws UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: null });
    const err = await captureTRPCError(() => caller.saved.isSaved(caseId));
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('isSaved returns false before the case has been saved', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: doctorActor });
    await expect(caller.saved.isSaved(caseId)).resolves.toEqual({ saved: false });
  });

  it('toggle throws TRPCError NOT_FOUND for a missing case id', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const err = await captureTRPCError(() => caller.saved.toggle('does-not-exist'));
    expect(err.code).toBe('NOT_FOUND');
  });

  it('toggle is idempotent per (userId, caseId): save then un-save on the same actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: doctorActor });

    const first = await caller.saved.toggle(caseId);
    expect(first).toEqual({ saved: true });
    await expect(caller.saved.isSaved(caseId)).resolves.toEqual({ saved: true });

    const second = await caller.saved.toggle(caseId);
    expect(second).toEqual({ saved: false });
    await expect(caller.saved.isSaved(caseId)).resolves.toEqual({ saved: false });
  });

  it('list includes the case-list-item summary while saved, empty again once un-saved', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: doctorActor });

    await caller.saved.toggle(caseId);
    const listedWhileSaved = await caller.saved.list();
    expect(listedWhileSaved.some((s) => s.caseId === caseId)).toBe(true);
    const match = listedWhileSaved.find((s) => s.caseId === caseId)!;
    expect(match.case.id).toBe(caseId);
    expect(match.case.name).toBe('API Saved Router Test Case');

    await caller.saved.toggle(caseId);
    const listedAfterUnsave = await caller.saved.list();
    expect(listedAfterUnsave.some((s) => s.caseId === caseId)).toBe(false);
  });

  it('ids returns the actor\'s saved case ids only', async () => {
    const doctorCaller = createCaller({ email: noopEmailSender, actor: doctorActor });
    await doctorCaller.saved.toggle(caseId);

    const doctorIds = await doctorCaller.saved.ids();
    expect(doctorIds).toContain(caseId);

    const adminCaller = createCaller({ email: noopEmailSender, actor: adminActor });
    const adminIds = await adminCaller.saved.ids();
    expect(adminIds).not.toContain(caseId);

    // Cleanup: leave the doctor un-saved for test isolation.
    await doctorCaller.saved.toggle(caseId);
  });

  it('list/ids/toggle all throw UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: null });
    await expect(captureTRPCError(() => caller.saved.list())).resolves.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(captureTRPCError(() => caller.saved.ids())).resolves.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(captureTRPCError(() => caller.saved.toggle(caseId))).resolves.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
