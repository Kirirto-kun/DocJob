import { router, publicProcedure } from './trpc';
import { casesRouter } from './routers/cases';
import { searchRouter } from './routers/search';
import { reviewsRouter } from './routers/reviews';
import { savedRouter } from './routers/saved';
import { tagsRouter } from './routers/tags';
import { submissionsRouter } from './routers/submissions';
import { usersRouter } from './routers/users';
import { newsRouter } from './routers/news';
import { announcementsRouter } from './routers/announcements';
import { contactRouter } from './routers/contact';
import { bannersRouter } from './routers/banners';

/**
 * Root tRPC router. Domain routers (cases, search, reviews, saved, tags,
 * submissions, users, news, announcements, contact, banners) are merged in
 * one per SP-1d task, mapping 1:1 onto @docjob/core's namespaces (see
 * packages/core/src/index.ts). `cases` + `search` landed in Task 2; `reviews`
 * + `saved` + `tags` landed in Task 3 (see packages/api/src/routers/
 * {reviews,saved,tags}.ts); `submissions` lands in Task 4 (see
 * packages/api/src/routers/submissions.ts); `users` lands in Task 5 (see
 * packages/api/src/routers/users.ts — login/refresh/logout stay the
 * dedicated `POST /api/auth/*` cookie-setting routes from SP-1c, not tRPC);
 * `news` + `announcements` + `contact` + `banners` land in Task 6 (see
 * packages/api/src/routers/{news,announcements,contact,banners}.ts — note
 * `contact.send` validates + evaluates the honeypot only, it does NOT send
 * real email yet, see that router's doc comment) — this is the last of the
 * domain routers; Task 7 mounts `appRouter` at `/api/trpc`.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  cases: casesRouter,
  search: searchRouter,
  reviews: reviewsRouter,
  saved: savedRouter,
  tags: tagsRouter,
  submissions: submissionsRouter,
  users: usersRouter,
  news: newsRouter,
  announcements: announcementsRouter,
  contact: contactRouter,
  banners: bannersRouter,
});

export type AppRouter = typeof appRouter;
