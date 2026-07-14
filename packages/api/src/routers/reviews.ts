import { z } from 'zod';
import * as core from '@docjob/core';
import { protectedProcedure, reviewerProcedure, router } from '../trpc';

/**
 * `reviews` tRPC router — thin wire wrappers over `@docjob/core`'s
 * `reviews.*` domain functions (packages/core/src/reviews/review.service.ts).
 * Every procedure forwards `(ctx.actor, input)` into the matching core
 * function; all business rules (fine-grained auth, field validation,
 * NotFound/Forbidden/Validation) live in core and surface here only via the
 * DomainError -> TRPCError mapping middleware (see trpc.ts).
 *
 * Auth tier per procedure:
 * - `create` = reviewerProcedure. This mirrors core's own rule exactly
 *   (`assertReviewer` allows ADMIN or REVIEWER) — no divergence, just an
 *   early gate that documents intent, same as the plan's Task 1 note.
 * - `forCase` / `delete` / `mine` = protectedProcedure. `delete`'s real rule
 *   ("author or admin may delete") is fine-grained and stays in core
 *   (`deleteReview` throws ForbiddenError for anyone else) — the router does
 *   NOT re-check ownership here, it only gates "is *someone* logged in?".
 *
 * Input schemas: `create` reuses core's own `CreateReviewInput` shape via
 * `z.custom` (core's internal `safeParse` is the real validator — see
 * cases.ts for the fuller rationale); `forCase`/`delete` take a bare `id`
 * string, which has no core-side zod schema to reuse.
 */

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export const reviewsRouter = router({
  forCase: protectedProcedure
    .input(z.string())
    .query(({ ctx, input }) => core.reviews.getReviewsForCase(ctx.actor, input)),

  create: reviewerProcedure
    .input(z.custom<core.reviews.CreateReviewInput>(isPlainObject))
    .mutation(({ ctx, input }) => core.reviews.createReview(ctx.actor, input)),

  delete: protectedProcedure
    .input(z.string())
    .mutation(({ ctx, input }) => core.reviews.deleteReview(ctx.actor, input)),

  mine: protectedProcedure.query(({ ctx }) => core.reviews.getMyReviews(ctx.actor)),
});
