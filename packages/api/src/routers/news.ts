import { z } from 'zod';
import * as core from '@docjob/core';
import { publicProcedure, adminProcedure, router } from '../trpc';

/**
 * `news` tRPC router — thin wire wrappers over `@docjob/core`'s `news.*`
 * domain functions (packages/core/src/news/news.service.ts). Every
 * procedure forwards `(ctx.actor, ...)` into the matching core function;
 * all business rules (field validation, NotFound) live in core and surface
 * here only via the DomainError -> TRPCError mapping middleware (see
 * trpc.ts).
 *
 * Auth tier per procedure, matched 1:1 against the `assert*` call each core
 * function actually makes (read directly off news.service.ts):
 * - `list`   = publicProcedure. Core's `listPublicNews()` takes no actor at
 *   all and has no internal assert — it's the public feed reused by
 *   `apps/web/src/lib/news.ts#getPublicNewsItems` for the landing page,
 *   `/news`, and the sitemap. No auth.
 * - `byId`   = adminProcedure. **Diverges from this task's brief, which
 *   pencilled `byId` in as a public read alongside `list`** — but core's
 *   `getNewsItem` actually calls `assertAdmin`, and its only caller in the
 *   app is the admin edit page (`apps/web/src/app/admin/news/[id]/edit/
 *   page.tsx`). Per the brief's own overriding instruction to match each
 *   procedure's auth tier to the core service's *actual* assert (zero
 *   divergence), this is adminProcedure — same correction pattern as
 *   `users.list` in users.ts (see that router's doc comment for the
 *   precedent).
 * - `create` / `update` / `delete` = adminProcedure. Core's `createNews` /
 *   `updateNews` / `deleteNews` all call `assertAdmin`.
 *
 * Input schemas: `create` reuses core's own `NewsInput` shape via
 * `z.custom` (core's internal `parseNewsInput` is the real validator, same
 * rationale as cases.ts/reviews.ts). `update` needs `id` split out from the
 * payload because core's `updateNews(actor, id, input)` takes them as two
 * separate params — the schema is a `z.object({ id })` intersected with
 * `NewsInput`, then split back apart before calling core. `byId`/`delete`
 * take a bare `id` string, no core-side schema to reuse.
 */

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const updateNewsInputSchema = z
  .object({ id: z.string().min(1) })
  .and(z.custom<core.news.NewsInput>(isPlainObject));

export const newsRouter = router({
  list: publicProcedure.query(() => core.news.listPublicNews()),

  byId: adminProcedure
    .input(z.string())
    .query(({ ctx, input }) => core.news.getNewsItem(ctx.actor, input)),

  create: adminProcedure
    .input(z.custom<core.news.NewsInput>(isPlainObject))
    .mutation(({ ctx, input }) => core.news.createNews(ctx.actor, input)),

  update: adminProcedure.input(updateNewsInputSchema).mutation(({ ctx, input }) => {
    const { id, ...rest } = input;
    return core.news.updateNews(ctx.actor, id, rest);
  }),

  delete: adminProcedure
    .input(z.string())
    .mutation(({ ctx, input }) => core.news.deleteNews(ctx.actor, input)),
});
