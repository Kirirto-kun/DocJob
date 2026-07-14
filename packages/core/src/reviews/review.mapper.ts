import type { Prisma } from '@docjob/db';

export type SerializedReview = {
  id: string;
  caseId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerSpecialty: string | null;
  reviewerAcademicDegree: string | null;
  reviewerWorkplace: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

/** `getMyReviews` shape — a review plus a small summary of its parent case. */
export type SerializedReviewWithCase = SerializedReview & {
  case: { id: string; name: string; subgroup: string | null };
};

export type ReviewWithReviewer = Prisma.ReviewGetPayload<{ include: { reviewer: true } }>;

/** Moved verbatim from apps/web/src/app/actions.ts (SP-1b Task 5). */
export function serializeReview(r: ReviewWithReviewer): SerializedReview {
  return {
    id: r.id,
    caseId: r.caseId,
    reviewerId: r.reviewerId,
    reviewerName: r.reviewer.fullName || r.reviewer.name,
    reviewerSpecialty: r.reviewer.specialty,
    reviewerAcademicDegree: r.reviewer.academicDegree,
    reviewerWorkplace: r.reviewer.workplace,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
