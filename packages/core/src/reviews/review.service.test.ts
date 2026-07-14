/**
 * Integration tests for review.service — run against the real dev Postgres
 * (same harness Task 2 established: DATABASE_URL loaded via
 * `dotenv -e ../../.env.local -e ../../.env` in the package's `test` script).
 *
 * Each test creates its own rows and cleans them up (create → assert →
 * delete) rather than relying on transaction rollback.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@docjob/db';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../shared/errors';
import type { Actor } from '../shared/actor';
import * as caseService from '../cases/case.service';
import * as reviewService from './review.service';

describe('review.service (integration, real Postgres)', () => {
  let adminUserId: string;
  let adminActor: Actor;
  let reviewerUserId: string;
  let reviewerActor: Actor;
  let doctorUserId: string;
  let doctorActor: Actor;
  let caseId: string;
  const createdReviewIds: string[] = [];

  beforeAll(async () => {
    const suffix = Date.now();
    const admin = await prisma.user.create({
      data: {
        email: `core-review-admin-${suffix}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core Review Admin',
        role: 'ADMIN',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    adminUserId = admin.id;
    adminActor = { id: admin.id, role: 'ADMIN', approvedAt: new Date() };

    const reviewer = await prisma.user.create({
      data: {
        email: `core-review-reviewer-${suffix}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core Test Reviewer',
        role: 'REVIEWER',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    reviewerUserId = reviewer.id;
    reviewerActor = { id: reviewer.id, role: 'REVIEWER', approvedAt: new Date() };

    const doctor = await prisma.user.create({
      data: {
        email: `core-review-doctor-${suffix}@test.local`,
        passwordHash: 'unused-in-tests',
        name: 'Core Test Doctor',
        role: 'DOCTOR',
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    doctorUserId = doctor.id;
    doctorActor = { id: doctor.id, role: 'DOCTOR', approvedAt: new Date() };

    const created = await caseService.createCase(adminActor, { name: 'Core Review Test Case' });
    caseId = created.id;
  });

  afterAll(async () => {
    if (createdReviewIds.length) {
      await prisma.review.deleteMany({ where: { id: { in: createdReviewIds } } });
    }
    await prisma.case.delete({ where: { id: caseId } });
    await prisma.user.deleteMany({
      where: { id: { in: [adminUserId, reviewerUserId, doctorUserId] } },
    });
  });

  it('createReview throws ForbiddenError for a non-reviewer, non-admin actor', async () => {
    await expect(
      reviewService.createReview(doctorActor, { caseId, body: 'This should never be created.' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('createReview throws UnauthorizedError for no actor', async () => {
    await expect(
      reviewService.createReview(null, { caseId, body: 'This should never be created.' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('createReview as a reviewer persists and returns a SerializedReview', async () => {
    const result = await reviewService.createReview(reviewerActor, {
      caseId,
      body: 'A sufficiently long review body for validation.',
    });
    createdReviewIds.push(result.id);

    expect(result.id).toBeTruthy();
    expect(result.caseId).toBe(caseId);
    expect(result.reviewerId).toBe(reviewerUserId);
    expect(result.body).toBe('A sufficiently long review body for validation.');

    const fetched = await prisma.review.findUnique({ where: { id: result.id } });
    expect(fetched).not.toBeNull();
  });

  it('createReview as admin also succeeds (admins are reviewers too)', async () => {
    const result = await reviewService.createReview(adminActor, {
      caseId,
      body: 'Admin-authored review body, long enough.',
    });
    createdReviewIds.push(result.id);
    expect(result.reviewerId).toBe(adminUserId);
  });

  it('createReview rejects a too-short body with the original Russian validation message', async () => {
    await expect(
      reviewService.createReview(reviewerActor, { caseId, body: 'short' }),
    ).rejects.toThrow('Текст рецензии должен содержать минимум 10 символов.');
  });

  it('getReviewsForCase returns reviews for the case, requires an approved actor', async () => {
    const result = await reviewService.createReview(reviewerActor, {
      caseId,
      body: 'Another review body long enough to pass validation.',
    });
    createdReviewIds.push(result.id);

    const rows = await reviewService.getReviewsForCase(doctorActor, caseId);
    expect(rows.some((r) => r.id === result.id)).toBe(true);

    await expect(reviewService.getReviewsForCase(null, caseId)).rejects.toThrow(UnauthorizedError);
  });

  it('getMyReviews returns only the caller\'s own reviews, with a case summary', async () => {
    const result = await reviewService.createReview(reviewerActor, {
      caseId,
      body: 'Yet another review body long enough to pass.',
    });
    createdReviewIds.push(result.id);

    const mine = await reviewService.getMyReviews(reviewerActor);
    expect(mine.some((r) => r.id === result.id)).toBe(true);
    expect(mine.every((r) => r.reviewerId === reviewerUserId)).toBe(true);
    const match = mine.find((r) => r.id === result.id)!;
    expect(match.case).toEqual({ id: caseId, name: 'Core Review Test Case', subgroup: null });

    const adminMine = await reviewService.getMyReviews(adminActor);
    expect(adminMine.some((r) => r.id === result.id)).toBe(false);
  });

  it('deleteReview: author can delete their own review', async () => {
    const created = await reviewService.createReview(reviewerActor, {
      caseId,
      body: 'A review that will be deleted by its author.',
    });

    const deleted = await reviewService.deleteReview(reviewerActor, created.id);
    expect(deleted).toEqual({ id: created.id });

    const gone = await prisma.review.findUnique({ where: { id: created.id } });
    expect(gone).toBeNull();
  });

  it('deleteReview: admin can delete someone else\'s review', async () => {
    const created = await reviewService.createReview(reviewerActor, {
      caseId,
      body: 'A review that will be deleted by an admin.',
    });

    const deleted = await reviewService.deleteReview(adminActor, created.id);
    expect(deleted).toEqual({ id: created.id });
  });

  it('deleteReview: a different non-admin actor is forbidden', async () => {
    const created = await reviewService.createReview(reviewerActor, {
      caseId,
      body: 'A review that a stranger will try to delete.',
    });
    createdReviewIds.push(created.id);

    await expect(reviewService.deleteReview(doctorActor, created.id)).rejects.toThrow(ForbiddenError);
  });

  it('deleteReview throws NotFoundError for a missing review id', async () => {
    await expect(reviewService.deleteReview(adminActor, 'does-not-exist')).rejects.toThrow(
      NotFoundError,
    );
  });
});
