import { z } from 'zod';
import * as core from '@docjob/core';
import { publicProcedure, protectedProcedure, adminProcedure, router } from '../trpc';

/**
 * `announcements` tRPC router — thin wire wrappers over `@docjob/core`'s
 * `announcements.*` domain functions
 * (packages/core/src/announcements/announcement.service.ts). Every
 * procedure forwards `(ctx.actor, ...)` into the matching core function;
 * all business rules live in core and surface here only via the
 * DomainError -> TRPCError mapping middleware (see trpc.ts).
 *
 * Auth tier per procedure, matched 1:1 against the `assert*` call each core
 * function actually makes (read directly off announcement.service.ts):
 * - `active`  = publicProcedure. **Diverges from this task's brief, which
 *   labelled this "protected"** — but core's `getActiveAnnouncements`
 *   deliberately does NOT call `assertApproved`/`assertAdmin` at all; a
 *   `null` actor is not an error, it just short-circuits to `[]` (see that
 *   function's own doc comment: "the original action called
 *   `getCurrentUser()` and returned `ok([])` rather than throwing").
 *   Making this `protectedProcedure` would reject guests with UNAUTHORIZED
 *   instead of silently returning an empty list — a real behavior-parity
 *   break versus the pre-existing `getActiveAnnouncements` Server Action,
 *   which never required a session. Per the brief's own overriding
 *   instruction ("match each procedure's auth level to the core service's
 *   ACTUAL assert"), this is `publicProcedure` forwarding `ctx.actor`
 *   (which may be `null`) straight through — same zero-divergence
 *   correction pattern as `users.list` in users.ts and `news.byId` in
 *   news.ts.
 * - `dismiss` = protectedProcedure. Core's `dismissAnnouncement` throws
 *   `UnauthorizedError` for a `null` actor itself — this procedure just
 *   gates the same requirement one layer earlier, matching core exactly
 *   (zero divergence).
 * - `list` / `byId` / `create` / `update` / `delete` = adminProcedure.
 *   Core's `getAnnouncements` / `getAnnouncement` / `createAnnouncement` /
 *   `updateAnnouncement` / `deleteAnnouncement` all call `assertAdmin`.
 *
 * Input schemas: `create` reuses core's own `AnnouncementInput` shape via
 * `z.custom`; `update` reuses `AnnouncementInput & { id: string }` directly
 * since core's own `updateAnnouncement(actor, input)` already takes `id`
 * folded into a single object (unlike news.ts's `updateNews`, which takes
 * two separate params). `dismiss`/`byId`/`delete` take a bare `id` string,
 * no core-side schema to reuse.
 */

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export const announcementsRouter = router({
  active: publicProcedure.query(({ ctx }) => core.announcements.getActiveAnnouncements(ctx.actor)),

  dismiss: protectedProcedure
    .input(z.string())
    .mutation(({ ctx, input }) => core.announcements.dismissAnnouncement(ctx.actor, input)),

  list: adminProcedure.query(({ ctx }) => core.announcements.getAnnouncements(ctx.actor)),

  byId: adminProcedure
    .input(z.string())
    .query(({ ctx, input }) => core.announcements.getAnnouncement(ctx.actor, input)),

  create: adminProcedure
    .input(z.custom<core.announcements.AnnouncementInput>(isPlainObject))
    .mutation(({ ctx, input }) => core.announcements.createAnnouncement(ctx.actor, input)),

  update: adminProcedure
    .input(z.custom<core.announcements.AnnouncementInput & { id: string }>(isPlainObject))
    .mutation(({ ctx, input }) => core.announcements.updateAnnouncement(ctx.actor, input)),

  delete: adminProcedure
    .input(z.string())
    .mutation(({ ctx, input }) => core.announcements.deleteAnnouncement(ctx.actor, input)),
});
