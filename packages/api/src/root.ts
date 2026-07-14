import { router, publicProcedure } from './trpc';
import { casesRouter } from './routers/cases';
import { searchRouter } from './routers/search';

/**
 * Root tRPC router. Domain routers (cases, search, reviews, saved, tags,
 * submissions, users, news, announcements, contact, banners) are merged in
 * one per SP-1d task, mapping 1:1 onto @docjob/core's namespaces (see
 * packages/core/src/index.ts). `cases` + `search` land in Task 2 (see
 * packages/api/src/routers/{cases,search}.ts) — the rest follow in Tasks 3-6.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  cases: casesRouter,
  search: searchRouter,
});

export type AppRouter = typeof appRouter;
