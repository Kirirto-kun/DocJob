import { z } from 'zod';
import * as core from '@docjob/core';
import { protectedProcedure, adminProcedure, router } from '../trpc';

/**
 * `tags` tRPC router — thin wire wrappers over `@docjob/core`'s `tags.*`
 * domain functions (packages/core/src/tags/tag.service.ts).
 *
 * Auth tier per procedure:
 * - `list` = protectedProcedure, matching core's `getTags` (`assertApproved`
 *   — any approved user; the tag pool must stay readable by all approved
 *   users for the tag-picker UI).
 * - `add` = adminProcedure, matching core's `addTag` (`assertAdmin` — tag
 *   creation was tightened from `assertApproved` in a security-hardening
 *   pass, since the tag-picker's add flow only ever lives in the admin
 *   case-authoring UI and an open gate let any approved doctor/reviewer
 *   pollute the shared tag taxonomy). This router now matches core 1:1 —
 *   no divergence.
 */
export const tagsRouter = router({
  list: protectedProcedure.query(({ ctx }) => core.tags.getTags(ctx.actor)),

  add: adminProcedure
    .input(z.string())
    .mutation(({ ctx, input }) => core.tags.addTag(ctx.actor, input)),
});
