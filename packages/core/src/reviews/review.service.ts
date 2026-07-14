import { z } from 'zod';
import { prisma } from '@docjob/db';
import { assertApproved, assertReviewer, type Actor } from '../shared/actor';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors';
import {
  serializeReview,
  type SerializedReview,
  type SerializedReviewWithCase,
} from './review.mapper';

// ───────────────────────── Validation schemas (moved verbatim from actions.ts)

const createReviewSchema = z.object({
  caseId: z.string().min(1),
  body: z.string().min(10, 'Текст рецензии должен содержать минимум 10 символов.'),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

// ───────────────────────── Writes

/**
 * Create a review for a case. Only reviewers and admins may leave reviews
 * (preserves the original `user.role !== 'REVIEWER' && user.role !== 'ADMIN'`
 * check via `assertReviewer`, which asserts exactly that role set).
 */
export async function createReview(
  actor: Actor | null,
  input: CreateReviewInput,
): Promise<SerializedReview> {
  const user = assertReviewer(actor, 'Оставлять рецензии могут только рецензенты.');

  const parsed = createReviewSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Некорректные данные рецензии.');
  }

  const c = await prisma.case.findUnique({ where: { id: parsed.data.caseId }, select: { id: true } });
  if (!c) throw new NotFoundError('Кейс не найден.');

  const created = await prisma.review.create({
    data: {
      caseId: parsed.data.caseId,
      reviewerId: user.id,
      body: parsed.data.body.trim(),
    },
    include: { reviewer: true },
  });
  return serializeReview(created);
}

/**
 * Delete a review. Preserves the original author-or-admin check: any
 * approved user may call this, but only the review's own author or an admin
 * may actually delete it — everyone else gets a ForbiddenError with the
 * original Russian message.
 */
export async function deleteReview(actor: Actor | null, reviewId: string): Promise<{ id: string }> {
  const user = assertApproved(actor, 'Требуется авторизация.');

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw new NotFoundError('Рецензия не найдена.');
  if (review.reviewerId !== user.id && user.role !== 'ADMIN') {
    throw new ForbiddenError('Удалять рецензию может только её автор или администратор.');
  }

  await prisma.review.delete({ where: { id: reviewId } });
  return { id: reviewId };
}

// ───────────────────────── Reads

/** List all reviews for a case, newest first. Any approved user. */
export async function getReviewsForCase(actor: Actor | null, caseId: string): Promise<SerializedReview[]> {
  assertApproved(actor, 'Требуется авторизация.');
  const rows = await prisma.review.findMany({
    where: { caseId },
    include: { reviewer: true },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(serializeReview);
}

/** List the current actor's own authored reviews, each with a small parent-case summary. */
export async function getMyReviews(actor: Actor | null): Promise<SerializedReviewWithCase[]> {
  const user = assertApproved(actor, 'Требуется авторизация.');
  const rows = await prisma.review.findMany({
    where: { reviewerId: user.id },
    include: {
      reviewer: true,
      case: { select: { id: true, name: true, subgroup: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    ...serializeReview(r),
    case: { id: r.case.id, name: r.case.name, subgroup: r.case.subgroup },
  }));
}
