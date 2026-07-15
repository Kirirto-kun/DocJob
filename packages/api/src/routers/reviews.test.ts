/**
 * Integration tests for the `reviews` tRPC router — run against the real dev
 * Postgres (same harness cases.test.ts uses: DATABASE_URL loaded via
 * `dotenv -e ../../.env.local -e ../../.env` in this package's `test`
 * script). Exercised through `appRouter.createCaller({actor})`, bypassing
 * `createContext`'s own token verification (that's context.test.ts's job).
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
  return `api-reviews-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
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

describe('reviews router (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  let reviewerUserId: string;
  let reviewerActor: Actor;
  let doctorUserId: string;
  let doctorActor: Actor;
  let caseId: string;
  const createdReviewIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: uniqueEmail('admin'),
        passwordHash: 'unused-in-tests',
        name: 'API Reviews Test Admin',
        role: 'ADMIN',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    adminUserId = admin.id;
    adminActor = { id: admin.id, role: 'ADMIN', approvedAt: new Date() };

    const reviewer = await prisma.user.create({
      data: {
        email: uniqueEmail('reviewer'),
        passwordHash: 'unused-in-tests',
        name: 'API Reviews Test Reviewer',
        role: 'REVIEWER',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    reviewerUserId = reviewer.id;
    reviewerActor = { id: reviewer.id, role: 'REVIEWER', approvedAt: new Date() };

    const doctor = await prisma.user.create({
      data: {
        email: uniqueEmail('doctor'),
        passwordHash: 'unused-in-tests',
        name: 'API Reviews Test Doctor',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    doctorUserId = doctor.id;
    doctorActor = { id: doctor.id, role: 'DOCTOR', approvedAt: new Date() };

    const created = await core.cases.createCase(adminActor, { name: 'API Reviews Router Test Case' });
    caseId = created.id;
  });

  afterAll(async () => {
    if (createdReviewIds.length) {
      await prisma.review.deleteMany({ where: { id: { in: createdReviewIds } } });
    }
    await prisma.case.delete({ where: { id: caseId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, reviewerUserId, doctorUserId] } } });
  });

  it('create rejects with TRPCError FORBIDDEN for a non-reviewer, non-admin actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const err = await captureTRPCError(() =>
      caller.reviews.create({ caseId, body: 'This should never be created.' }),
    );
    expect(err.code).toBe('FORBIDDEN');
  });

  it('create rejects with TRPCError UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: null });
    const err = await captureTRPCError(() =>
      caller.reviews.create({ caseId, body: 'This should never be created.' }),
    );
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('create as a reviewer persists and returns a SerializedReview', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: reviewerActor });
    const result = await caller.reviews.create({
      caseId,
      body: 'A sufficiently long review body for validation.',
    });
    createdReviewIds.push(result.id);

    expect(result.id).toBeTruthy();
    expect(result.caseId).toBe(caseId);
    expect(result.reviewerId).toBe(reviewerUserId);
    expect(result.body).toBe('A sufficiently long review body for validation.');
  });

  it('create rejects a too-short body with TRPCError BAD_REQUEST (core ValidationError)', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: reviewerActor });
    const err = await captureTRPCError(() => caller.reviews.create({ caseId, body: 'short' }));
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('Текст рецензии должен содержать минимум 10 символов.');
  });

  it('forCase throws UNAUTHORIZED for no actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: null });
    const err = await captureTRPCError(() => caller.reviews.forCase(caseId));
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('forCase returns reviews for the case, any approved actor', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const rows = await caller.reviews.forCase(caseId);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.some((r) => r.id === createdReviewIds[0])).toBe(true);
  });

  it("mine returns only the caller's own reviews, with a case summary", async () => {
    const caller = createCaller({ email: noopEmailSender, actor: reviewerActor });
    const mine = await caller.reviews.mine();
    expect(mine.some((r) => r.id === createdReviewIds[0])).toBe(true);
    expect(mine.every((r) => r.reviewerId === reviewerUserId)).toBe(true);

    const adminCaller = createCaller({ email: noopEmailSender, actor: adminActor });
    const adminMine = await adminCaller.reviews.mine();
    expect(adminMine.some((r) => r.id === createdReviewIds[0])).toBe(false);
  });

  it('delete: author can delete their own review', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: reviewerActor });
    const created = await caller.reviews.create({
      caseId,
      body: 'A review that will be deleted by its author.',
    });

    const deleted = await caller.reviews.delete(created.id);
    expect(deleted).toEqual({ id: created.id });

    const gone = await prisma.review.findUnique({ where: { id: created.id } });
    expect(gone).toBeNull();
  });

  it("delete: a different non-admin actor is rejected with TRPCError FORBIDDEN", async () => {
    const reviewerCaller = createCaller({ email: noopEmailSender, actor: reviewerActor });
    const created = await reviewerCaller.reviews.create({
      caseId,
      body: 'A review that a stranger will try to delete.',
    });
    createdReviewIds.push(created.id);

    const doctorCaller = createCaller({ email: noopEmailSender, actor: doctorActor });
    const err = await captureTRPCError(() => doctorCaller.reviews.delete(created.id));
    expect(err.code).toBe('FORBIDDEN');
  });

  it('delete: admin can delete someone else\'s review', async () => {
    const reviewerCaller = createCaller({ email: noopEmailSender, actor: reviewerActor });
    const created = await reviewerCaller.reviews.create({
      caseId,
      body: 'A review that will be deleted by an admin.',
    });

    const adminCaller = createCaller({ email: noopEmailSender, actor: adminActor });
    const deleted = await adminCaller.reviews.delete(created.id);
    expect(deleted).toEqual({ id: created.id });
  });

  it('delete throws TRPCError NOT_FOUND for a missing review id', async () => {
    const caller = createCaller({ email: noopEmailSender, actor: adminActor });
    const err = await captureTRPCError(() => caller.reviews.delete('does-not-exist'));
    expect(err.code).toBe('NOT_FOUND');
  });
});
