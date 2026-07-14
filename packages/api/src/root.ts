import { router, publicProcedure } from './trpc';
import { casesRouter } from './routers/cases';
import { searchRouter } from './routers/search';
import { reviewsRouter } from './routers/reviews';
import { savedRouter } from './routers/saved';
import { tagsRouter } from './routers/tags';
import { submissionsRouter } from './routers/submissions';

/**
 * Root tRPC router. Domain routers (cases, search, reviews, saved, tags,
 * submissions, users, news, announcements, contact, banners) are merged in
 * one per SP-1d task, mapping 1:1 onto @docjob/core's namespaces (see
 * packages/core/src/index.ts). `cases` + `search` landed in Task 2; `reviews`
 * + `saved` + `tags` landed in Task 3 (see packages/api/src/routers/
 * {reviews,saved,tags}.ts); `submissions` lands in Task 4 (see
 * packages/api/src/routers/submissions.ts) — the rest follow in Tasks 5-6.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  cases: casesRouter,
  search: searchRouter,
  reviews: reviewsRouter,
  saved: savedRouter,
  tags: tagsRouter,
  submissions: submissionsRouter,
});

export type AppRouter = typeof appRouter;
