import { z } from 'zod';
import * as core from '@docjob/core';
import { protectedProcedure, adminProcedure, router } from '../trpc';

/**
 * `tags` tRPC router — thin wire wrappers over `@docjob/core`'s `tags.*`
 * domain functions (packages/core/src/tags/tag.service.ts).
 *
 * Auth tier per procedure — INTENTIONAL DIVERGENCE on `add`:
 * - `list` = protectedProcedure, matching core's `getTags` (`assertApproved`
 *   — any approved user).
 * - `add` = adminProcedure. Core's `addTag` itself only calls
 *   `assertApproved` (any approved user, same as the pre-existing
 *   `addTag` Server Action — see apps/web/src/app/actions.ts), so this
 *   router is DELIBERATELY stricter than core at the procedure tier, the
 *   same pattern cases.ts uses for case mutations (see that router's doc
 *   comment). This is a new-surface policy choice, not a bug: the shared
 *   tag taxonomy is easy to pollute if any approved doctor/reviewer can add
 *   arbitrary labels, so the tRPC surface requires admin while core's
 *   underlying rule (and the legacy Server Action) stays looser. Flagged in
 *   the Task 3 report per the SP-1d brief's request to call out any
 *   procedure-level vs core-level auth divergence rather than silently
 *   "fixing" it.
 */
export const tagsRouter = router({
  list: protectedProcedure.query(({ ctx }) => core.tags.getTags(ctx.actor)),

  add: adminProcedure
    .input(z.string())
    .mutation(({ ctx, input }) => core.tags.addTag(ctx.actor, input)),
});
