import { z } from 'zod';
import * as core from '@docjob/core';
import { publicProcedure, adminProcedure, router } from '../trpc';

/**
 * `banners` tRPC router — thin wire wrappers over `@docjob/core`'s
 * `banners.*` filesystem-manifest functions
 * (packages/core/src/banners/banner.service.ts).
 *
 * Auth tier per procedure, matched to core's actual behavior:
 * - `get` = publicProcedure. Core's `readBannerManifest()` takes no actor
 *   and does no auth check — matches the original `GET /api/banners` route
 *   (apps/web/src/app/api/banners/route.ts), which has no `requireAdmin()`
 *   call either.
 * - `set` = adminProcedure. Core exports two write paths: the bare
 *   `setBanner(slot, info)` (no actor, no gating — the existing
 *   `POST`/`PATCH`/`DELETE /api/banners` routes call this directly *after*
 *   doing their own `requireAdmin()`) and `setBannerSlot(actor, slot, info)`,
 *   an actor-gated wrapper around the same write, specifically documented in
 *   banner.service.ts as "for direct `@docjob/core` callers (e.g. a future
 *   SP-1d tRPC endpoint) that don't have their own admin check" — i.e. for
 *   this router. `set` calls `setBannerSlot`, which calls `assertAdmin`.
 *   Clearing a slot is `info: null` (mirrors the existing `DELETE` route,
 *   which calls `setBanner(slot, null)`), so there is no separate `delete`
 *   procedure.
 *
 * Input schema: core's `setBanner`/`setBannerSlot` do no runtime validation
 * on `info` at all (a plain TS param, no zod schema in banner.service.ts) —
 * same situation submissions.ts's `updateStatus` describes — so this router
 * defines a local zod object mirroring `BannerInfo` exactly, giving the wire
 * boundary real runtime validation core's one trusted, TS-checked caller
 * never needed. `slot` reuses core's own `isValidSlot` type-guard directly
 * via `z.custom` (the actual validator, not a re-declaration of "must be 1").
 */

const bannerInfoSchema = z.object({
  filename: z.string().min(1),
  url: z.string().min(1),
  mimeType: z.string().min(1),
  linkUrl: z.string().nullable(),
  updatedAt: z.string().min(1),
});

const setBannerInputSchema = z.object({
  slot: z.custom<core.BannerSlot>(core.banners.isValidSlot),
  info: bannerInfoSchema.nullable(),
});

export const bannersRouter = router({
  get: publicProcedure.query(() => core.banners.readBannerManifest()),

  set: adminProcedure
    .input(setBannerInputSchema)
    .mutation(({ ctx, input }) => core.banners.setBannerSlot(ctx.actor, input.slot, input.info)),
});
