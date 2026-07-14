import { z } from 'zod';
import * as core from '@docjob/core';
import { protectedProcedure, router } from '../trpc';

/**
 * `saved` tRPC router — thin wire wrappers over `@docjob/core`'s `saved.*`
 * domain functions (packages/core/src/saved/saved.service.ts). Every
 * procedure requires an approved actor (core's `assertApproved`), so every
 * procedure here uses `protectedProcedure` — matches core's own rule, no
 * divergence.
 *
 * `toggle` is idempotent per `(userId, caseId)`: the underlying `SavedCase`
 * row has a unique constraint on that pair, so calling `toggle` twice in a
 * row un-saves what the first call saved (see saved.service.ts's own doc
 * comment).
 */
export const savedRouter = router({
  toggle: protectedProcedure
    .input(z.string())
    .mutation(({ ctx, input }) => core.saved.toggleSavedCase(ctx.actor, input)),

  isSaved: protectedProcedure
    .input(z.string())
    .query(({ ctx, input }) => core.saved.isCaseSaved(ctx.actor, input)),

  list: protectedProcedure.query(({ ctx }) => core.saved.getSavedCases(ctx.actor)),

  ids: protectedProcedure.query(({ ctx }) => core.saved.getSavedCaseIds(ctx.actor)),
});
