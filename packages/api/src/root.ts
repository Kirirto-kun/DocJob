import { router, publicProcedure } from './trpc';

/**
 * Root tRPC router. Starts with a trivial `health` check only — domain
 * routers (cases, search, reviews, saved, tags, submissions, users, news,
 * announcements, contact, banners) are merged in one per SP-1d task, mapping
 * 1:1 onto @docjob/core's namespaces (see packages/core/src/index.ts).
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
});

export type AppRouter = typeof appRouter;
